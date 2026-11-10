/** What SQLite reports, turned into the errors the CLI answers with (design 4.6). */
import { CliError } from "../errors";

// Primary result codes, https://sqlite.org/rescode.html. An extended code keeps its primary code
// in the low byte.
const SQLITE_PERM = 3;
const SQLITE_BUSY = 5;
const SQLITE_LOCKED = 6;
const SQLITE_READONLY = 8;
const SQLITE_IOERR = 10;
const SQLITE_CORRUPT = 11;
const SQLITE_FULL = 13;
const SQLITE_CANTOPEN = 14;
const SQLITE_NOTADB = 26;

/** The shape `node:sqlite` gives the errors it throws. */
export interface SqliteError extends Error {
    readonly code: "ERR_SQLITE_ERROR";
    readonly errcode: number;
    readonly errstr: string;
}

export function isSqliteError(error: unknown): error is SqliteError {
    return (
        error instanceof Error &&
        (error as { code?: unknown }).code === "ERR_SQLITE_ERROR" &&
        typeof (error as { errcode?: unknown }).errcode === "number"
    );
}

/**
 * The CLI's error for a SQLite failure that is not a bug: a busy database, a damaged file, a
 * directory that cannot be written. Undefined for anything else, which stays an internal error.
 * `database` is the file, named in the message when the caller knows it.
 */
export function storeError(error: unknown, database?: string): CliError | undefined {
    if (!isSqliteError(error)) return undefined;
    const what = database === undefined ? "数据库" : `数据库 ${database}`;
    switch (error.errcode & 0xff) {
        case SQLITE_BUSY:
        case SQLITE_LOCKED:
            return new CliError("DB_LOCKED", "数据库正被另一个 saltnet 进程占用，稍后再试", {
                cause: error,
            });
        case SQLITE_CORRUPT:
        case SQLITE_NOTADB:
            return new CliError(
                "INTERNAL",
                `${what}已损坏，或者不是 SQLite 数据库。把它挪开后 saltnet 会重新建一个：曲库会重新拉取，用户数据只能从备份导入；也可以用 SALTNET_HOME 换一个目录`,
                { cause: error }
            );
        case SQLITE_CANTOPEN:
        case SQLITE_PERM:
        case SQLITE_READONLY:
        case SQLITE_IOERR:
        case SQLITE_FULL:
            return new CliError(
                "INTERNAL",
                `无法读写${what}（${error.errstr}）；请检查目录权限和磁盘空间，或者用 SALTNET_HOME 换一个目录`,
                { cause: error }
            );
        default:
            return undefined;
    }
}
