/** Private credentials kept outside SQLite so the public SQL surface can never reach them. */
import type { LXNSOAuthTransaction } from "@core/integrations/lxns/oauth";
import type { Lock, LockHolder } from "../store/locks";
import type { Store } from "../store/store";
import type { StagedFile } from "./files";
import type { RuntimePaths } from "./paths";
import { readFileSync } from "node:fs";
import { validateLXNSOAuthTransaction } from "@core/integrations/lxns/oauth";
import { CliError } from "../errors";
import { acquireLock } from "../store/locks";
import { stageFileAtomic, writeFileAtomic } from "./files";
import { ensureRuntimeDirs } from "./paths";

export interface UserCredentials {
    divingFishImportToken?: unknown;
    lxnsAuthorization?: unknown;
}

export interface CredentialsFile {
    version: 1;
    users: Record<string, UserCredentials>;
    pendingLxnsAuthorizations?: Record<string, LXNSOAuthTransaction>;
}

export interface CredentialsLockOptions {
    ttlMs?: number;
    waitIntervalMs?: number;
    timeoutMs?: number;
    now?: () => Date | number;
    sleep?: (ms: number) => Promise<void>;
}

export interface UpdateCredentialsOptions extends CredentialsLockOptions {
    now?: () => Date | number;
}

function object(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function failure(action: string, file: string, error: unknown): CliError {
    const code = (error as NodeJS.ErrnoException).code;
    const reason = typeof code === "string" ? `（${code}）` : "";
    return new CliError("INTERNAL", `${action}凭据文件 ${file}${reason}；文件没有改动`, {
        fix: `检查 ${file}；修不好时可以把它移走，再重新绑定水鱼和落雪`,
        cause: error,
    });
}

/** A missing file is empty; every other read or shape failure is explicit and non-destructive. */
export function readCredentials(paths: Pick<RuntimePaths, "credentials">): CredentialsFile {
    let text: string;
    try {
        text = readFileSync(paths.credentials, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, users: {} };
        throw failure("无法读取", paths.credentials, error);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        throw failure("无法解析", paths.credentials, error);
    }
    const root = object(parsed);
    if (!root || root.version !== 1) {
        throw failure("无法解析", paths.credentials, new Error("invalid credentials shape"));
    }
    for (const key of Object.keys(root)) {
        if (key !== "version" && key !== "users" && key !== "pendingLxnsAuthorizations") {
            throw failure(
                "无法解析",
                paths.credentials,
                new Error(`unknown top-level member ${key}`)
            );
        }
    }
    const users = object(root.users);
    if (!users) {
        throw failure("无法解析", paths.credentials, new Error("invalid credentials shape"));
    }
    for (const value of Object.values(users)) {
        if (!object(value)) {
            throw failure("无法解析", paths.credentials, new Error("invalid user credentials"));
        }
    }
    if ("pendingLxnsAuthorizations" in root) {
        const pending = object(root.pendingLxnsAuthorizations);
        if (!pending) {
            throw failure(
                "无法解析",
                paths.credentials,
                new Error("invalid pendingLxnsAuthorizations")
            );
        }
        for (const value of Object.values(pending)) {
            if (!object(value)) {
                throw failure(
                    "无法解析",
                    paths.credentials,
                    new Error("invalid pending authorization entry")
                );
            }
        }
    }
    return parsed as CredentialsFile;
}

/** Holds the named lock `credentials` for up to 30 s while `work` runs. */
export async function withCredentialsLock<T>(
    store: Store,
    work: (lock: Lock) => Promise<T> | T,
    options: CredentialsLockOptions = {}
): Promise<T> {
    const ttlMs = options.ttlMs ?? 30_000;
    const waitIntervalMs = options.waitIntervalMs ?? 100;
    const timeoutMs = options.timeoutMs ?? 5_000;
    const toMs = (val: Date | number) => (val instanceof Date ? val.getTime() : val);
    const now = () => (options.now ? toMs(options.now()) : Date.now());
    const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));

    const startTime = now();
    let lastHolder: LockHolder | undefined;

    while (true) {
        const acquisition = acquireLock(store, "credentials", { ttlMs, now });
        if (acquisition.acquired) {
            try {
                return await work(acquisition.lock);
            } finally {
                try {
                    acquisition.lock.release();
                } catch {
                    // Lock release failure should not mask original result or error.
                }
            }
        }
        lastHolder = acquisition.holder;
        if (now() - startTime >= timeoutMs) {
            break;
        }
        await sleep(Math.min(waitIntervalMs, Math.max(0, timeoutMs - (now() - startTime))));
    }

    const pid = lastHolder ? lastHolder.pid : "未知";
    throw new CliError("DB_LOCKED", `另一个 saltnet 进程（pid ${pid}）正在改凭据文件；稍后再试`, {
        retryable: true,
    });
}

function pruneCredentials(
    credentials: CredentialsFile,
    store: Store,
    now?: () => Date | number
): CredentialsFile {
    const validUids = new Set<string>();
    store.read(() => {
        const rows = store.db.prepare("SELECT uid FROM users").all() as { uid: string }[];
        for (const row of rows) validUids.add(row.uid);
    });

    const nowMs = (() => {
        if (!now) return Date.now();
        const n = now();
        return n instanceof Date ? n.getTime() : n;
    })();

    const prunedUsers: Record<string, UserCredentials> = {};
    for (const [uid, creds] of Object.entries(credentials.users ?? {})) {
        if (!validUids.has(uid)) continue;
        const hasDf =
            creds?.divingFishImportToken !== undefined && creds?.divingFishImportToken !== null;
        const hasLxns = creds?.lxnsAuthorization !== undefined && creds?.lxnsAuthorization !== null;
        if (!hasDf && !hasLxns) continue;
        prunedUsers[uid] = creds;
    }

    const pruned: CredentialsFile = {
        version: 1,
        users: prunedUsers,
    };

    if (credentials.pendingLxnsAuthorizations !== undefined) {
        const prunedPending: Record<string, LXNSOAuthTransaction> = {};
        for (const [state, record] of Object.entries(credentials.pendingLxnsAuthorizations)) {
            const validated = validateLXNSOAuthTransaction(record, nowMs);
            if (!validated) continue;
            if (!validUids.has(validated.userUid)) continue;
            prunedPending[state] = validated;
        }
        pruned.pendingLxnsAuthorizations = prunedPending;
    }

    return pruned;
}

/** Re-reads `credentials.json` under lock, mutates, prunes, and writes mode 0600 atomically. */
export async function updateCredentials(
    paths: RuntimePaths,
    store: Store,
    mutate: (current: CredentialsFile) => CredentialsFile | Promise<CredentialsFile>,
    options: UpdateCredentialsOptions = {}
): Promise<CredentialsFile> {
    return withCredentialsLock(
        store,
        async () => {
            const current = readCredentials(paths);
            const mutated = await mutate(current);
            const pruned = pruneCredentials(mutated, store, options.now);
            ensureRuntimeDirs(paths);
            writeFileAtomic(paths.credentials, `${JSON.stringify(pruned, null, 2)}\n`, 0o600);
            return pruned;
        },
        options
    );
}

/** Writes the private file now and returns the final rename for a caller-controlled commit point. */
export function stageCredentials(paths: RuntimePaths, content: CredentialsFile): StagedFile {
    ensureRuntimeDirs(paths);
    return stageFileAtomic(paths.credentials, `${JSON.stringify(content, null, 2)}\n`, 0o600);
}
