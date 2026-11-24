import type { Warning } from "../output/warning";
import type { UserTarget } from "../util/printedCommand";
import type { PositionalSpec } from "./registry";
import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";
import { SaltAPIEndpoints } from "@core/integrations/saltnet/client";
import { buildGameBackup } from "@core/user/gameBackup";
import { CliError, usageError } from "../errors";
import { bool, int, object, str } from "../output/schema";
import { resolveUser } from "../refs/user";
import { resolveOutputFile, writeOutputFile } from "../runtime/outputFile";
import { assertQrAccount, postQrGameApi, readVerifiedQr } from "../sync/ingame";
import { listUsers, readUser } from "../users/repository";
import {
    fileWord,
    optionWords,
    userBindCommand,
    userOptionWords,
    userUidWord,
} from "../util/printedCommand";
import { joinCommandLine } from "../util/shell";
import { USER_OPTION, USER_REFERENCE } from "./describe";
import { defineCommand } from "./registry";

const FILE_POSITIONAL: PositionalSpec = {
    name: "file",
    valueName: "文件",
    description: "导出的备份文件路径；相对路径按当前目录解析",
};

/** Binds the game account of the user with this uid. */
export function ingameBindFix(uid: string): string {
    return userBindCommand(userUidWord(uid), "ingame", [], ["--qr", "-"]);
}

/** `saltnet sync` for this user, with more words after it. */
function syncFix(row: UserTarget, ...words: string[]): string {
    return joinCommandLine(["saltnet", "sync", ...userOptionWords(row), ...words]);
}

interface IngameUser {
    index: number;
    uid: string;
    name: string;
}

function ingameUserSchema(description: string) {
    return object<IngameUser>(
        {
            index: int("用户序号（从 0 开始）"),
            uid: str("用户的稳定 UID"),
            name: str("用户的显示名称"),
        },
        { description }
    );
}

interface IngameCheckLoginResult {
    user: IngameUser;
    isLogin: boolean;
}

export const ingameCheckLogin = defineCommand(
    {
        name: "ingame check-login",
        summary: "查询指定用户的舞萌账号登录状态",
        description:
            "配置舞萌服务地址后，用属于已绑定舞萌账号的二维码查询当前登录状态。此操作需要联网，不会登录账号。",
        category: "account",
        effect: "none",
        output: "object",
        options: {
            user: {
                ...USER_OPTION.user,
                description: `${USER_REFERENCE}；默认选择第 0 位`,
            },
            qr: {
                kind: "credential",
                required: true,
                description: "从 stdin 读取舞萌二维码扫描结果或页面链接",
            },
        },
        errors: [
            "NO_USER",
            "NOT_FOUND",
            "AMBIGUOUS_REF",
            "NOT_BOUND",
            "QR_INVALID",
            "USAGE",
            "NETWORK",
            "UPSTREAM_ERROR",
            "DB_LOCKED",
        ],
        dataSchema: object<IngameCheckLoginResult>(
            {
                user: ingameUserSchema("查询的用户信息"),
                isLogin: bool("舞萌账号当前是否已登录"),
            },
            { description: "舞萌账号登录状态查询结果" }
        ),
    },
    async (args, ctx) => {
        if (args.global.offline)
            throw usageError("ingame check-login 需要联网，不能使用 --offline");

        const selected = resolveUser(
            // Like `status`, the check never creates the data directory or the database.
            existsSync(ctx.paths.database) ? listUsers(ctx.store()) : [],
            args.options.user
        );
        if (!selected.inGameId) {
            throw new CliError(
                "NOT_BOUND",
                `用户 ${selected.displayName} 尚未绑定舞萌账号（InGame）`,
                {
                    fix: ingameBindFix(selected.uid),
                }
            );
        }

        let result: Record<string, unknown>;
        try {
            const qr = await readVerifiedQr(ctx);
            assertQrAccount(selected.inGameId, qr);
            result = await postQrGameApi(ctx, SaltAPIEndpoints.CheckLogin, { qrCode: qr.code });
        } catch (error) {
            if (!(error instanceof CliError)) {
                throw new CliError("INTERNAL", "读取二维码或查询舞萌登录状态失败");
            }
            if (error.code !== "NETWORK" || !error.fix) throw error;

            throw new CliError(error.code, `${error.message}；网络较慢时可以先运行 ${error.fix}`, {
                retryable: error.retryable,
                fix: joinCommandLine([
                    "saltnet",
                    "ingame",
                    "check-login",
                    ...userOptionWords(selected, true),
                    "--qr",
                    "-",
                ]),
            });
        }
        if (typeof result.isLogin !== "boolean") {
            throw new CliError("UPSTREAM_ERROR", "舞萌服务返回的登录状态无效");
        }

        return {
            data: {
                user: { index: selected.index, uid: selected.uid, name: selected.displayName },
                isLogin: result.isLogin,
            } satisfies IngameCheckLoginResult,
        };
    }
);

interface IngameBackupResult {
    path: string;
    user: IngameUser;
    counts: {
        music: number;
        items: number;
        characters: number;
    };
    byteSize: number;
}

export const ingameBackup = defineCommand(
    {
        name: "ingame backup",
        summary: "导出当前用户的游戏格式备份文件",
        description:
            "将指定用户的成绩、收藏品和角色数据导出为与游戏格式兼容的 JSON 备份。用户需要绑定舞萌游戏 ID。该文件不含凭据，以 0600 权限写入。缺少角色数据时文件仍会导出，并产生 PARTIAL_BACKUP 警告。",
        category: "account",
        effect: "local",
        output: "object",
        positionals: [FILE_POSITIONAL],
        options: {
            ...USER_OPTION,
            overwrite: { kind: "boolean", description: "允许替换已经存在的目标文件" },
        },
        examples: [
            {
                command: "ingame backup game-backup.json",
                description: "导出默认用户的游戏格式备份",
            },
        ],
        errors: [
            "NO_USER",
            "NOT_FOUND",
            "AMBIGUOUS_REF",
            "NOT_BOUND",
            "FILE_EXISTS",
            "USAGE",
            "DB_LOCKED",
        ],
        dataSchema: object<IngameBackupResult>(
            {
                path: str("导出文件的绝对路径"),
                user: ingameUserSchema("导出的用户信息"),
                counts: object<{ music: number; items: number; characters: number }>(
                    {
                        music: int("导出的曲目成绩条数"),
                        items: int("导出的收藏品道具条数"),
                        characters: int("导出的角色条数"),
                    },
                    { description: "备份中包含的各类数据数量" }
                ),
                byteSize: int("写入文件的 UTF-8 字节数"),
            },
            { description: "游戏格式备份导出的结果信息" }
        ),
    },
    (args, ctx) => {
        const store = ctx.store();
        const users = listUsers(store);
        const selectedRow = resolveUser(users, args.options.user);
        const user = readUser(store, selectedRow.uid)!;

        if (!user.inGame.id) {
            throw new CliError(
                "NOT_BOUND",
                `用户 ${selectedRow.displayName} 尚未绑定舞萌账号（InGame）`,
                {
                    retryable: false,
                    fix: ingameBindFix(selectedRow.uid),
                }
            );
        }

        if (
            !user.data.updateTime ||
            !user.data.detailed ||
            Object.keys(user.data.detailed).length === 0
        ) {
            throw new CliError("NOT_FOUND", `用户 ${selectedRow.displayName} 缺少完整成绩数据`, {
                retryable: false,
                fix: syncFix(selectedRow),
            });
        }

        const givenUser = args.options.user;
        const retryCommand = [
            "saltnet",
            "ingame",
            "backup",
            fileWord(args.positionals.file),
            ...(givenUser === undefined ? [] : optionWords("--user", givenUser)),
        ];
        const output = resolveOutputFile(
            ctx,
            args.positionals.file,
            args.options.overwrite,
            retryCommand
        );

        const userForBackup = {
            ...user,
            data: {
                ...user.data,
                items: Array.isArray(user.data.items)
                    ? user.data.items.map(slot => (Array.isArray(slot) ? slot : []))
                    : user.data.items,
            },
        };
        const backup = buildGameBackup(userForBackup);
        const content = JSON.stringify(backup, null, 2);
        writeOutputFile(output, content, "ingame backup");
        const byteSize = Buffer.byteLength(content);

        const warnings: Warning[] = [];
        if (!user.data.characters || user.data.characters.length === 0) {
            warnings.push({
                code: "PARTIAL_BACKUP",
                message: `用户 ${selectedRow.displayName} 没有角色数据，备份仅包含成绩和已有的收藏品`,
                fix: syncFix(selectedRow, "--source", "ingame"),
            });
        }

        return {
            data: {
                path: output.path,
                user: {
                    index: selectedRow.index,
                    uid: selectedRow.uid,
                    name: selectedRow.displayName,
                },
                counts: {
                    music: backup.userMusicDetailList.length,
                    items: backup.userItemList.length,
                    characters: backup.userCharacterList.length,
                },
                byteSize,
            } satisfies IngameBackupResult,
            warnings,
        };
    }
);
