/**
 * The `sync_runs` journal (design 2.2, 5.1, 5.5).
 *
 * This module is the sole writer of the `sync_runs` table. It records the history of syncs,
 * uploads, account operations, and backup imports. Credentials and tokens are strictly forbidden
 * from appearing in the journal.
 */
import type { Lock } from "../store/locks";
import type { Store } from "../store/store";
import type { SyncLockHandle } from "./lock";
import { CliError } from "../errors";
import { VERSION } from "../version";

/** Checked here rather than by the table, so a later kind needs no migration. */
export type SyncRunKind = "sync" | "upload" | "account" | "import";

export interface BeginRunStart {
    readonly kind: SyncRunKind;
    readonly userUid?: string | null;
    readonly userName?: string | null;
    readonly source?: string | null;
    readonly mode?: string | null;
}

export interface BeginRunOptions {
    readonly version?: string;
    readonly now?: () => number;
}

export interface FinishRunOkResult {
    readonly outcome: "ok";
    readonly summary?: unknown;
}

export interface FinishRunFailedResult {
    readonly outcome: "failed";
    readonly error?: unknown;
    readonly errorCode?: string;
    readonly errorMessage?: string;
    readonly summary?: unknown;
}

export type FinishRunResult = FinishRunOkResult | FinishRunFailedResult;

export interface ReadRunsFilter {
    readonly userUid?: string | null;
    readonly kind?: SyncRunKind;
    readonly since?: number;
    readonly limit?: number;
    readonly offset?: number;
}

export interface SyncRunRow {
    readonly id: number;
    readonly kind: SyncRunKind;
    readonly userUid: string | null;
    readonly userName: string | null;
    readonly source: string | null;
    readonly mode: string | null;
    readonly outcome: "running" | "ok" | "failed" | "interrupted";
    readonly errorCode: string | null;
    readonly errorMessage: string | null;
    readonly summary: Readonly<Record<string, unknown>> | null;
    readonly startedAt: number;
    readonly finishedAt: number | null;
    readonly cliVersion: string;
}

export interface ReadRunsResult {
    readonly items: readonly SyncRunRow[];
    readonly total: number;
}

/** A newly acquired sync lock makes this user's previous running rows abandoned. */
export function interruptRuns(store: Store, userUid: string): void {
    store.db
        .prepare(
            "UPDATE sync_runs SET outcome = 'interrupted' WHERE user_uid = ? AND outcome = 'running'"
        )
        .run(userUid);
}

const FORBIDDEN_SECRET_WORDS = [
    "token",
    "authorization",
    "verifier",
    "secret",
    "password",
    "cookie",
    "qr",
] as const;

function validateSummaryKey(key: string): void {
    const lower = key.toLowerCase();
    for (const word of FORBIDDEN_SECRET_WORDS) {
        if (lower.includes(word)) {
            throw new CliError("INTERNAL", `summary 包含禁止的凭据键名 "${key}"`);
        }
    }
}

function validateSummaryValue(value: unknown, ancestors: Set<unknown>): void {
    if (value === null || typeof value === "boolean" || typeof value === "string") {
        return;
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new CliError("INTERNAL", "summary 中包含非有限数字（NaN 或 Infinity）");
        }
        return;
    }
    if (value === undefined) {
        throw new CliError("INTERNAL", "summary 中不能包含 undefined");
    }
    if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
        throw new CliError("INTERNAL", `summary 中包含不被允许的类型 ${typeof value}`);
    }
    if (typeof value !== "object") {
        throw new CliError("INTERNAL", "summary 中包含非 JSON 值");
    }
    if (ancestors.has(value)) {
        throw new CliError("INTERNAL", "summary 包含循环引用");
    }

    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                if (!Object.hasOwn(value, i) || value[i] === undefined) {
                    throw new CliError("INTERNAL", "summary 数组中不能包含 undefined 或稀疏项");
                }
                validateSummaryValue(value[i], ancestors);
            }
            return;
        }

        const proto = Object.getPrototypeOf(value);
        if (proto !== Object.prototype && proto !== null) {
            throw new CliError(
                "INTERNAL",
                `summary 中包含类实例（${(value as { constructor?: { name?: string } }).constructor?.name ?? "未知类"}）`
            );
        }

        for (const [key, propValue] of Object.entries(value)) {
            validateSummaryKey(key);
            if (propValue === undefined) {
                throw new CliError("INTERNAL", `summary 键 "${key}" 的值不能为 undefined`);
            }
            validateSummaryValue(propValue, ancestors);
        }
    } finally {
        ancestors.delete(value);
    }
}

export function validateSummary(summary: unknown): string | null {
    if (summary === null || summary === undefined) return null;
    if (typeof summary !== "object" || Array.isArray(summary)) {
        throw new CliError("INTERNAL", "summary 必须是一个普通对象或 null");
    }
    const proto = Object.getPrototypeOf(summary);
    if (proto !== Object.prototype && proto !== null) {
        throw new CliError(
            "INTERNAL",
            `summary 必须是普通对象，不能是类实例（${(summary as { constructor?: { name?: string } }).constructor?.name ?? "未知类"}）`
        );
    }

    const ancestors = new Set<unknown>();
    validateSummaryValue(summary, ancestors);
    return JSON.stringify(summary);
}

function runOptions(options?: BeginRunOptions): { now: () => number; version: string } {
    return { now: options?.now ?? Date.now, version: options?.version ?? VERSION };
}

function verifyRunLock(
    kind: SyncRunKind,
    userUid: string | null | undefined,
    lockOrHandle?: SyncLockHandle | Lock
): void {
    const isLockedKind = kind === "sync" || kind === "upload" || kind === "account";
    if (isLockedKind) {
        if (!lockOrHandle) {
            throw new CliError("INTERNAL", `${kind} 操作必须在持有该用户的同步锁时开始`);
        }
        if (!userUid) {
            throw new CliError("INTERNAL", `${kind} 操作必须指定目标用户的 uid`);
        }
        let lockUid: string | undefined;
        if ("user" in lockOrHandle && lockOrHandle.user) {
            lockUid = lockOrHandle.user.uid;
        } else if ("name" in lockOrHandle && typeof lockOrHandle.name === "string") {
            if (lockOrHandle.name.startsWith("sync:")) {
                lockUid = lockOrHandle.name.slice(5);
            }
        }
        if (lockUid !== userUid) {
            throw new CliError(
                "INTERNAL",
                `同步锁所属用户（${lockUid ?? "未知"}）与当前操作用户（${userUid}）不一致`
            );
        }
        const renewed = lockOrHandle.renew();
        if (!renewed) {
            throw new CliError("INTERNAL", `用户 ${userUid} 的同步锁已失效`);
        }
    } else {
        if (lockOrHandle) {
            throw new CliError("INTERNAL", `${kind} 操作不需要同步锁`);
        }
    }
}

function extractErrorInfo(result: FinishRunResult): {
    errorCode: string | null;
    errorMessage: string | null;
} {
    let errorCode: string | null = null;
    let errorMessage: string | null = null;

    if (result.outcome === "failed") {
        if ("errorCode" in result && result.errorCode) {
            errorCode = result.errorCode;
        } else if (result.error instanceof CliError) {
            errorCode = result.error.code;
        } else if (
            result.error !== null &&
            typeof result.error === "object" &&
            "code" in result.error &&
            typeof (result.error as { code: unknown }).code === "string"
        ) {
            errorCode = (result.error as { code: string }).code;
        }

        if ("errorMessage" in result && result.errorMessage) {
            errorMessage = result.errorMessage;
        } else if (result.error instanceof Error) {
            errorMessage = result.error.message;
        } else if (
            result.error !== null &&
            typeof result.error === "object" &&
            "message" in result.error &&
            typeof (result.error as { message: unknown }).message === "string"
        ) {
            errorMessage = (result.error as { message: string }).message;
        } else if (result.error !== undefined && result.error !== null) {
            errorMessage = String(result.error);
        }
    }

    return { errorCode, errorMessage };
}

/**
 * Inserts a new run row in `sync_runs` with outcome `running` and returns its id.
 *
 * For kinds `sync`, `upload`, and `account`, `lock` must be that user's sync lock, still held; for
 * other kinds it must be null. Never call inside a transaction that may be rolled back.
 */
export function beginRun(
    store: Store,
    start: BeginRunStart,
    lock: SyncLockHandle | Lock | null,
    options?: BeginRunOptions
): number {
    const { now, version } = runOptions(options);
    verifyRunLock(start.kind, start.userUid, lock ?? undefined);

    const at = now();
    const result = store.db
        .prepare(
            `
            INSERT INTO sync_runs (
                kind, user_uid, user_name, source, mode, outcome,
                error_code, error_message, summary, started_at, finished_at, cli_version
            ) VALUES (?, ?, ?, ?, ?, 'running', NULL, NULL, NULL, ?, NULL, ?)
        `
        )
        .run(
            start.kind,
            start.userUid ?? null,
            start.userName ?? null,
            start.source ?? null,
            start.mode ?? null,
            at,
            version
        );

    return Number(result.lastInsertRowid);
}

/**
 * Finishes a run by setting its outcome to `ok` or `failed`, updating `finished_at`,
 * and recording error details and summary.
 *
 * Runs inside `store.transaction`. Fails if the run does not exist or is not `running`.
 */
export function finishRun(
    store: Store,
    id: number,
    result: FinishRunResult,
    options?: { now?: () => number }
): void {
    const serializedSummary = validateSummary(result.summary);
    const now = options?.now ?? Date.now;
    const finishedAt = now();
    const { errorCode, errorMessage } = extractErrorInfo(result);

    store.transaction(() => {
        const row = store.db.prepare("SELECT id, outcome FROM sync_runs WHERE id = ?").get(id) as
            | { id: number; outcome: string }
            | undefined;

        if (!row) {
            throw new CliError("INTERNAL", `找不到 sync_runs 记录 ${id}`);
        }
        if (row.outcome !== "running") {
            throw new CliError(
                "INTERNAL",
                `sync_runs 记录 ${id} 的状态是 ${row.outcome}，不是 running`
            );
        }

        store.db
            .prepare(
                `
                UPDATE sync_runs
                SET outcome = ?,
                    finished_at = ?,
                    error_code = ?,
                    error_message = ?,
                    summary = ?
                WHERE id = ?
            `
            )
            .run(result.outcome, finishedAt, errorCode, errorMessage, serializedSummary, id);
    });
}

/**
 * Records an already-finished run in one step, for an operation that completes inside one
 * transaction and takes no sync lock (`import`). A `sync`, `upload` or `account` run is refused: it
 * is begun under the user's sync lock with `beginRun` and finished with `finishRun`.
 * Runs inside `store.transaction`.
 */
export function recordRun(
    store: Store,
    start: BeginRunStart,
    result: FinishRunResult,
    options?: BeginRunOptions
): number {
    const { now, version } = runOptions(options);
    verifyRunLock(start.kind, start.userUid, undefined);

    const serializedSummary = validateSummary(result.summary);
    const at = now();
    const { errorCode, errorMessage } = extractErrorInfo(result);

    return store.transaction(() => {
        const res = store.db
            .prepare(
                `
                INSERT INTO sync_runs (
                    kind, user_uid, user_name, source, mode, outcome,
                    error_code, error_message, summary, started_at, finished_at, cli_version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
            )
            .run(
                start.kind,
                start.userUid ?? null,
                start.userName ?? null,
                start.source ?? null,
                start.mode ?? null,
                result.outcome,
                errorCode,
                errorMessage,
                serializedSummary,
                at,
                at,
                version
            );

        return Number(res.lastInsertRowid);
    });
}

/**
 * Reads runs newest first (by id desc), filtered and paged.
 */
export function readRuns(store: Store, filter: ReadRunsFilter = {}): ReadRunsResult {
    return store.read(() => {
        const conditions: string[] = [];
        const params: (string | number)[] = [];

        if (filter.userUid !== undefined) {
            if (filter.userUid === null) {
                conditions.push("user_uid IS NULL");
            } else {
                conditions.push("user_uid = ?");
                params.push(filter.userUid);
            }
        }

        if (filter.kind !== undefined) {
            conditions.push("kind = ?");
            params.push(filter.kind);
        }

        if (filter.since !== undefined) {
            conditions.push("started_at >= ?");
            params.push(filter.since);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const countRow = store.db
            .prepare(`SELECT count(*) AS total FROM sync_runs ${whereClause}`)
            .get(...params) as { total: number };
        const total = countRow.total;

        let query = `SELECT id, kind, user_uid, user_name, source, mode, outcome, error_code, error_message, summary, started_at, finished_at, cli_version FROM sync_runs ${whereClause} ORDER BY id DESC`;

        const queryParams = [...params];
        if (filter.limit !== undefined) {
            query += " LIMIT ?";
            queryParams.push(filter.limit);
            if (filter.offset !== undefined) {
                query += " OFFSET ?";
                queryParams.push(filter.offset);
            }
        } else if (filter.offset !== undefined) {
            query += " LIMIT -1 OFFSET ?";
            queryParams.push(filter.offset);
        }

        const rows = store.db.prepare(query).all(...queryParams) as {
            id: number;
            kind: string;
            user_uid: string | null;
            user_name: string | null;
            source: string | null;
            mode: string | null;
            outcome: "running" | "ok" | "failed" | "interrupted";
            error_code: string | null;
            error_message: string | null;
            summary: string | null;
            started_at: number;
            finished_at: number | null;
            cli_version: string;
        }[];

        const items: SyncRunRow[] = rows.map(row => ({
            id: row.id,
            kind: row.kind as SyncRunKind,
            userUid: row.user_uid,
            userName: row.user_name,
            source: row.source,
            mode: row.mode,
            outcome: row.outcome,
            errorCode: row.error_code,
            errorMessage: row.error_message,
            summary: row.summary ? (JSON.parse(row.summary) as Record<string, unknown>) : null,
            startedAt: row.started_at,
            finishedAt: row.finished_at,
            cliVersion: row.cli_version,
        }));

        return { items, total };
    });
}
