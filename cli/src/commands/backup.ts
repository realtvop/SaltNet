import type { ScoreHistoryEventV1 } from "@core/user/scoreHistory/type";
import type { User } from "@core/user/type";
import type { CredentialsFile, UserCredentials } from "../runtime/credentials";
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { decodeUserDataBackup, encodeUserDataBackup } from "@core/user/backup";
import { getUserDisplayName } from "@core/user/type";
import { CliError } from "../errors";
import { bool, int, object, str } from "../output/schema";
import { readCredentials, stageCredentials } from "../runtime/credentials";
import { writeFileAtomic } from "../runtime/files";
import {
    assertStoredScoreEvent,
    assertStoredUser,
    listUsers,
    readScoreEvents,
    readUsers,
    replaceUsers,
} from "../users/repository";
import { joinCommandLine } from "../util/shell";
import { formatLocalTime } from "../util/time";
import { CONFIRM_OPTIONS, requireConfirmation } from "./confirm";
import { defineCommand } from "./registry";

const FILE_POSITIONAL = {
    name: "file",
    valueName: "文件",
    description: "备份文件路径；相对路径按当前目录解析",
} as const;

interface ImportResult {
    path: string;
    userCount: number;
    eventCount: number;
    divingFishTokenCount: number;
    lxnsAuthorizationCount: number;
}

interface ExportResult {
    path: string;
    userCount: number;
    eventCount: number;
    byteSize: number;
    containsDivingFishTokens: boolean;
    divingFishTokenCount: number;
    containsLxnsAuthorizations: boolean;
    lxnsAuthorizationCount: number;
}

interface PreparedImport {
    users: User[];
    events: ScoreHistoryEventV1[];
    credentials: CredentialsFile;
    divingFishTokenCount: number;
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object"
        ? (value as Record<string, unknown>)
        : undefined;
}

function present(value: unknown): boolean {
    return value !== undefined && value !== null;
}

function credentialsOf(credentials: CredentialsFile, uid: string): UserCredentials | undefined {
    return Object.hasOwn(credentials.users, uid) ? credentials.users[uid] : undefined;
}

function emptyCredentialUsers(): Record<string, UserCredentials> {
    return Object.create(null) as Record<string, UserCredentials>;
}

function backupError(file: string, reason: string, cause?: unknown): CliError {
    return new CliError("INVALID_BACKUP", `备份文件 ${file} ${reason}`, {
        retryable: false,
        cause,
    });
}

function safeDecodeReason(error: unknown): string {
    const message = error instanceof Error ? error.message : "";
    return /^(?:备份|不支持|用户数据|成绩历史)/.test(message) ? message : "JSON 或编码内容无效";
}

function readBackup(file: string): {
    bytes: Buffer;
    source: Record<string, unknown>;
    decoded: ReturnType<typeof decodeUserDataBackup>;
} {
    let bytes: Buffer;
    try {
        bytes = readFileSync(file);
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        throw backupError(file, `无法读取${typeof code === "string" ? `（${code}）` : ""}`, error);
    }

    let source: unknown;
    try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        source = JSON.parse(text);
    } catch (error) {
        throw backupError(file, "不是有效的 UTF-8 JSON", error);
    }

    try {
        const decoded = decodeUserDataBackup(source);
        return { bytes, source: source as Record<string, unknown>, decoded };
    } catch (error) {
        throw backupError(file, safeDecodeReason(error), error);
    }
}

function stageImportedEvents(events: readonly ScoreHistoryEventV1[]): ScoreHistoryEventV1[] {
    const generationId = `import-${randomUUID()}`;
    return events.map(source => {
        if (
            !Number.isSafeInteger(source.sequence) ||
            !Number.isSafeInteger(source.state.dxScore) ||
            (source.state.playCount !== null && !Number.isSafeInteger(source.state.playCount))
        ) {
            throw new CliError(
                "INVALID_BACKUP",
                "备份中的成绩历史含有超出安全整数范围的 sequence、dxScore 或 playCount",
                { retryable: false }
            );
        }
        return {
            ...source,
            id: `${generationId}:${source.userUid}:${source.batchId}:${source.chartKey}:${source.sequence}:${source.kind}`,
            generationId,
        };
    });
}

function prepareImport(
    users: readonly User[],
    events: readonly ScoreHistoryEventV1[]
): PreparedImport {
    const credentialUsers = emptyCredentialUsers();
    let divingFishTokenCount = 0;
    const storedUsers = users.map(source => {
        const raw = source as unknown as Record<string, unknown>;
        const divingFish = record(raw.divingFish);
        const lxns = record(raw.lxns);
        const importToken = divingFish?.importToken;
        const lxnsAuthorization = lxns?.auth;
        const hasImportToken = present(importToken);
        const hasLxnsAuthorization = present(lxnsAuthorization);
        const credentials: UserCredentials = {};
        if (hasImportToken) {
            credentials.divingFishImportToken = importToken;
            divingFishTokenCount++;
        }
        if (hasLxnsAuthorization) {
            credentials.lxnsAuthorization = lxnsAuthorization;
        }
        if (hasImportToken || hasLxnsAuthorization)
            credentialUsers[source.uid as string] = credentials;

        return {
            ...raw,
            ...(hasImportToken ? { divingFish: { ...divingFish, importToken: null } } : {}),
            ...(hasLxnsAuthorization ? { lxns: { ...lxns, auth: null } } : {}),
        } as unknown as User;
    });
    return {
        users: storedUsers,
        events: stageImportedEvents(events),
        credentials: { version: 1, users: credentialUsers },
        divingFishTokenCount,
    };
}

/**
 * Rejects, before anything is previewed, a backup that decodes but holds users or events the user
 * tables cannot store, so it fails as INVALID_BACKUP instead of inside the import transaction.
 */
function assertImportable(file: string, prepared: PreparedImport): void {
    try {
        for (const user of prepared.users) assertStoredUser(user);
        for (const event of prepared.events) assertStoredScoreEvent(event);
    } catch (error) {
        throw backupError(file, "含有 CLI 无法保存的用户数据或成绩历史", error);
    }
}

function lxnsId(user: User): unknown {
    return record((user as unknown as Record<string, unknown>).lxns)?.id;
}

function applyCredentialPolicy(
    prepared: PreparedImport,
    currentUsers: readonly User[],
    currentCredentials: CredentialsFile,
    keepLxns: boolean
): CredentialsFile {
    const users = emptyCredentialUsers();
    for (const imported of prepared.users) {
        const uid = imported.uid as string;
        const incoming = credentialsOf(prepared.credentials, uid);
        const entry: UserCredentials = {};
        const importToken = incoming?.divingFishImportToken;
        const incomingLxns = incoming?.lxnsAuthorization;
        if (present(importToken)) {
            entry.divingFishImportToken = importToken;
        }
        if (keepLxns && present(incomingLxns)) {
            entry.lxnsAuthorization = incomingLxns;
        } else {
            const current = currentUsers.find(user => user.uid === uid);
            const own = credentialsOf(currentCredentials, uid);
            const ownLxns = own?.lxnsAuthorization;
            if (current && lxnsId(current) === lxnsId(imported) && present(ownLxns)) {
                entry.lxnsAuthorization = ownLxns;
            }
        }
        if (Object.keys(entry).length > 0) users[uid] = entry;
    }
    return { version: 1, users };
}

function credentialCount(credentials: CredentialsFile, key: keyof UserCredentials): number {
    return Object.values(credentials.users).filter(entry => present(entry[key])).length;
}

export const importBackup = defineCommand(
    {
        name: "import",
        summary: "确认后从网页端备份整体替换用户和成绩历史",
        description:
            "读取网页端 v0 或 v1 用户备份，预览文件内容和会被覆盖的本地数据；确认后整体替换用户与成绩历史，收藏夹不受影响。水鱼 Import-Token 会移到 credentials.json；落雪授权默认丢弃，但会保留 uid 与落雪 id 都未改变的 CLI 自有授权。--keep-lxns 改为采用备份里的落雪授权；备份里没有落雪授权的用户仍照默认规则处理。输出和预览永远只含凭据数量，不含凭据值。",
        category: "data",
        effect: "local",
        output: "object",
        positionals: [FILE_POSITIONAL],
        options: {
            ...CONFIRM_OPTIONS,
            keepLxns: {
                kind: "boolean",
                description:
                    "采用备份里的落雪授权（备份里没有的用户照默认处理）；默认丢弃并保留身份未变的 CLI 自有授权",
            },
        },
        examples: [
            {
                command: "import saltnet-backup.json",
                description: "预览导入备份；确认后运行 error.fix",
            },
        ],
        errors: ["INVALID_BACKUP", "CONFIRMATION_REQUIRED", "DB_LOCKED"],
        dataSchema: object<ImportResult>(
            {
                path: str("导入文件的绝对路径"),
                userCount: int("导入的用户数"),
                eventCount: int("导入的成绩历史事件数"),
                divingFishTokenCount: int("存入 credentials.json 的水鱼 Import-Token 数"),
                lxnsAuthorizationCount: int("存入 credentials.json 的落雪授权数"),
            },
            { description: "导入的用户、成绩历史和凭据数量" }
        ),
    },
    (args, ctx) => {
        const givenPath = args.positionals.file;
        const absolutePath = path.resolve(ctx.io.cwd, givenPath);
        const backup = readBackup(absolutePath);
        const prepared = prepareImport(backup.decoded.users, backup.decoded.events);
        assertImportable(absolutePath, prepared);
        const store = ctx.store();
        const currentUsers = readUsers(store);
        const currentRows = listUsers(store);
        const currentEventCount = readScoreEvents(store).length;
        const currentCredentials = readCredentials(ctx.paths);
        const credentials = applyCredentialPolicy(
            prepared,
            currentUsers,
            currentCredentials,
            args.options.keepLxns
        );
        const version = backup.source.version as 0 | 1;
        const importedRows = prepared.users.map((user, index) => ({
            index,
            uid: user.uid as string,
            name: String(getUserDisplayName(user)),
        }));
        const confirmArgs = [
            "import",
            givenPath,
            ...(args.options.keepLxns ? ["--keep-lxns"] : []),
        ];
        requireConfirmation(args.options.yes, {
            operation: "backup.import",
            target: absolutePath,
            state: {
                fileDigest: createHash("sha256").update(backup.bytes).digest("hex"),
                currentUsers: currentRows.map(user => ({
                    uid: user.uid,
                    updatedAt: user.updatedAt,
                })),
                currentEventCount,
                keepLxns: args.options.keepLxns,
            },
            preview: {
                file: {
                    path: absolutePath,
                    version,
                    ...(version === 1
                        ? {
                              exportedAt: formatLocalTime(
                                  new Date(backup.source.exportedAt as number)
                              ),
                          }
                        : {}),
                },
                users: importedRows,
                eventCount: prepared.events.length,
                overwritten: {
                    users: currentRows.map(user => ({
                        index: user.index,
                        uid: user.uid,
                        name: user.displayName,
                    })),
                    eventCount: currentEventCount,
                },
                keepLxns: args.options.keepLxns,
                divingFishTokenCount: prepared.divingFishTokenCount,
            },
            summary: `将用备份中的 ${prepared.users.length} 个用户和 ${prepared.events.length} 条成绩历史覆盖本地数据`,
            confirmArgs,
        });

        const staged = stageCredentials(ctx.paths, credentials);
        try {
            replaceUsers(store, prepared.users, prepared.events);
        } catch (error) {
            staged.discard();
            throw error;
        }
        try {
            staged.commit();
        } catch (error) {
            throw new Error(
                `用户已经导入，但凭据未保存到 ${ctx.paths.credentials}；请修复文件权限后重新导入`,
                { cause: error }
            );
        }

        return {
            data: {
                path: absolutePath,
                userCount: prepared.users.length,
                eventCount: prepared.events.length,
                divingFishTokenCount: credentialCount(credentials, "divingFishImportToken"),
                lxnsAuthorizationCount: credentialCount(credentials, "lxnsAuthorization"),
            } satisfies ImportResult,
        };
    }
);

function restoreCredentials(
    storedUsers: readonly User[],
    credentials: CredentialsFile,
    keepLxns: boolean
): {
    users: User[];
    divingFishTokenCount: number;
    lxnsAuthorizationCount: number;
} {
    let divingFishTokenCount = 0;
    let lxnsAuthorizationCount = 0;
    const users = storedUsers.map(source => {
        const raw = source as unknown as Record<string, unknown>;
        const entry = credentialsOf(credentials, source.uid as string);
        const importToken = entry?.divingFishImportToken;
        const lxnsAuthorization = entry?.lxnsAuthorization;
        let restored: Record<string, unknown> = { ...raw };
        if (present(importToken)) {
            restored = {
                ...restored,
                divingFish: {
                    ...record(raw.divingFish),
                    importToken,
                },
            };
            divingFishTokenCount++;
        }
        if (keepLxns && present(lxnsAuthorization)) {
            restored = {
                ...restored,
                lxns: { ...record(raw.lxns), auth: lxnsAuthorization },
            };
            lxnsAuthorizationCount++;
        }
        return restored as unknown as User;
    });
    return { users, divingFishTokenCount, lxnsAuthorizationCount };
}

export const exportBackup = defineCommand(
    {
        name: "export",
        summary: "导出网页端可直接导入的 v1 用户备份",
        description:
            "按 users.raw 的顺序导出全部用户和成绩历史，并从 credentials.json 放回水鱼 Import-Token。落雪授权默认不导出，加 --keep-lxns 才放回。文件以 0600 权限原子写入；已有文件必须加 --overwrite。输出只含凭据数量，不含凭据值。",
        category: "data",
        effect: "local",
        output: "object",
        positionals: [FILE_POSITIONAL],
        options: {
            overwrite: { kind: "boolean", description: "允许替换已经存在的目标文件" },
            keepLxns: { kind: "boolean", description: "把 credentials.json 里的落雪授权写进备份" },
        },
        examples: [
            {
                command: "export saltnet-backup.json --overwrite",
                description: "导出一个可供网页端导入的备份",
            },
        ],
        errors: ["FILE_EXISTS", "NO_USER", "DB_LOCKED"],
        dataSchema: object<ExportResult>(
            {
                path: str("导出文件的绝对路径"),
                userCount: int("导出的用户数"),
                eventCount: int("导出的成绩历史事件数"),
                byteSize: int("写入文件的 UTF-8 字节数"),
                containsDivingFishTokens: bool("文件是否包含水鱼 Import-Token"),
                divingFishTokenCount: int("文件包含的水鱼 Import-Token 数"),
                containsLxnsAuthorizations: bool("文件是否包含落雪授权"),
                lxnsAuthorizationCount: int("文件包含的落雪授权数"),
            },
            { description: "导出文件及其中的用户、成绩历史和凭据数量" }
        ),
    },
    (args, ctx) => {
        const absolutePath = path.resolve(ctx.io.cwd, args.positionals.file);
        const store = ctx.store();
        const users = readUsers(store);
        if (users.length === 0) throw new CliError("NO_USER", "还没有任何用户可以导出");
        if (existsSync(absolutePath) && !args.options.overwrite) {
            throw new CliError("FILE_EXISTS", `文件已经存在：${absolutePath}`, {
                retryable: false,
                fix: joinCommandLine(["saltnet", "export", args.positionals.file, "--overwrite"]),
            });
        }
        const credentials = readCredentials(ctx.paths);
        const restored = restoreCredentials(users, credentials, args.options.keepLxns);
        const events = readScoreEvents(store);
        const backup = encodeUserDataBackup(restored.users, events, ctx.io.now().getTime());
        const content = `${JSON.stringify(backup, null, 2)}\n`;
        try {
            writeFileAtomic(absolutePath, content, 0o600);
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === "ENOENT" || code === "ENOTDIR") {
                throw new CliError(
                    "USAGE",
                    `目录不存在：${path.dirname(absolutePath)}；export 不会创建目录`,
                    { retryable: false, cause: error }
                );
            }
            throw error;
        }
        const byteSize = Buffer.byteLength(content);
        return {
            data: {
                path: absolutePath,
                userCount: restored.users.length,
                eventCount: events.length,
                byteSize,
                containsDivingFishTokens: restored.divingFishTokenCount > 0,
                divingFishTokenCount: restored.divingFishTokenCount,
                containsLxnsAuthorizations: restored.lxnsAuthorizationCount > 0,
                lxnsAuthorizationCount: restored.lxnsAuthorizationCount,
            } satisfies ExportResult,
        };
    }
);
