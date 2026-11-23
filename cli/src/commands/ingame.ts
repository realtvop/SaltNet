import type { Warning } from "../output/warning";
import type { PositionalSpec } from "./registry";
import { Buffer } from "node:buffer";
import { buildGameBackup } from "@core/user/gameBackup";
import { CliError } from "../errors";
import { int, object, str } from "../output/schema";
import { resolveUser } from "../refs/user";
import { resolveOutputFile, writeOutputFile } from "../runtime/outputFile";
import { listUsers, readUser } from "../users/repository";
import { quoteArg } from "../util/shell";
import { USER_OPTION } from "./describe";
import { defineCommand } from "./registry";

const FILE_POSITIONAL: PositionalSpec = {
    name: "file",
    valueName: "文件",
    description: "导出的备份文件路径；相对路径按当前目录解析",
};

/** Binds the game account of `uid`; a uid that looks like an option goes after `--`. */
export function ingameBindFix(uid: string): string {
    return uid.startsWith("-")
        ? `saltnet user bind --qr - -- ${quoteArg(uid)} ingame`
        : `saltnet user bind ${quoteArg(uid)} ingame --qr -`;
}

/** How a printed command selects a user: nothing for the default user. */
function userFlag(row: { readonly index: number; readonly uid: string }): string {
    if (row.index === 0) return "";
    return row.uid.startsWith("-")
        ? ` --user=${quoteArg(row.uid)}`
        : ` --user ${quoteArg(row.uid)}`;
}

interface IngameBackupResult {
    path: string;
    user: {
        index: number;
        uid: string;
        name: string;
    };
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
            "将指定用户的成绩、收藏品和角色数据导出为与游戏格式兼容的 JSON 备份。该文件不含凭据，以 0600 权限写入。缺少角色数据时文件仍会导出，并产生 PARTIAL_BACKUP 警告。",
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
                user: object<{ index: number; uid: string; name: string }>(
                    {
                        index: int("用户序号（从 0 开始）"),
                        uid: str("用户的稳定 UID"),
                        name: str("用户的显示名称"),
                    },
                    { description: "导出的用户信息" }
                ),
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
                fix: `saltnet sync${userFlag(selectedRow)}`,
            });
        }

        // A file or user that looks like an option must still give a fix that runs.
        const givenFile = args.positionals.file;
        const givenUser = args.options.user;
        const retryCommand = [
            "saltnet",
            "ingame",
            "backup",
            givenFile.startsWith("-") ? `./${givenFile}` : givenFile,
            ...(givenUser === undefined
                ? []
                : givenUser.startsWith("-")
                  ? [`--user=${givenUser}`]
                  : ["--user", givenUser]),
        ];
        const absolutePath = resolveOutputFile(
            ctx,
            args.positionals.file,
            args.options.overwrite,
            retryCommand
        );

        const backup = buildGameBackup(user);
        const content = JSON.stringify(backup, null, 2);
        writeOutputFile(absolutePath, content, "ingame backup");
        const byteSize = Buffer.byteLength(content);

        const warnings: Warning[] = [];
        if (!user.data.characters || user.data.characters.length === 0) {
            warnings.push({
                code: "PARTIAL_BACKUP",
                message: `用户 ${selectedRow.displayName} 没有角色数据，备份仅包含成绩和已有的收藏品`,
                fix: `saltnet sync${userFlag(selectedRow)} --source ingame`,
            });
        }

        return {
            data: {
                path: absolutePath,
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
