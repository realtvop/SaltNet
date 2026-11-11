/**
 * Running one query a person or an agent wrote (design 2.2, 4.5) in the sandbox, and turning the
 * result into what the output layer prints. A query is one statement; its rows become objects
 * with the values JSON can carry; and whatever SQLite objects to is the caller's mistake, so it
 * is a `SQL_ERROR` with SQLite's own words, not a crash.
 */
import type { DatabaseSync, StatementSync } from "./sqlite";
import { CliError } from "../errors";
import { isSqliteError } from "./errors";

/** What a cell holds once it is JSON: text, a number, or nothing. */
export type SqlValue = string | number | null;

/** One row: the values by column name. It has no prototype, so any column name is safe. */
export type SqlRow = Record<string, SqlValue>;

export interface QueryResult {
    /** The names of the result columns, in order. */
    readonly columns: readonly string[];
    readonly rows: readonly SqlRow[];
    /** There were more rows than `limit`; `rows` has the first `limit` of them. */
    readonly truncated: boolean;
}

const SQLITE_AUTH = 23;

/** Where to look for the names a query can use. */
const SCHEMA_FIX = "saltnet schema --views";

function sqlError(message: string, options: { fix?: string; cause?: unknown } = {}): CliError {
    return new CliError("SQL_ERROR", message, options);
}

/** The error for something SQLite objected to while preparing or running the query. */
function toSqlError(error: unknown): unknown {
    if (!isSqliteError(error)) return error;
    if ((error.errcode & 0xff) === SQLITE_AUTH) {
        return sqlError(
            "这条语句不被允许：sql 只能用一条 SELECT 查询 v_ 开头的视图，不能写入，也不能用 PRAGMA、ATTACH 这样的语句",
            { fix: SCHEMA_FIX, cause: error }
        );
    }
    // The tables and columns of the database are not for queries; the views are.
    const unknownName = /^no such (?:table|column)\b/.test(error.message);
    return sqlError(error.message, { fix: unknownName ? SCHEMA_FIX : undefined, cause: error });
}

/** Whether `text` holds anything SQLite would run: not only blanks, comments and semicolons. */
function hasStatement(db: DatabaseSync, text: string): boolean {
    try {
        const statement = db.prepare(text);
        // An empty statement is only found out when it is used.
        return statement.sourceSQL.length > 0;
    } catch (error) {
        // `ERR_INVALID_STATE` is the empty statement; anything else is a second statement that
        // SQLite or the authorizer does not like, which is a second statement all the same.
        return !(
            error instanceof Error && (error as { code?: unknown }).code === "ERR_INVALID_STATE"
        );
    }
}

function prepareOne(db: DatabaseSync, sql: string): StatementSync {
    let statement: StatementSync;
    let source: string;
    try {
        statement = db.prepare(sql);
        source = statement.sourceSQL;
    } catch (error) {
        if (error instanceof Error && (error as { code?: unknown }).code === "ERR_INVALID_STATE") {
            throw sqlError("没有要执行的语句：SQL 是空的，或者只有注释");
        }
        throw toSqlError(error);
    }
    if (hasStatement(db, sql.slice(source.length))) {
        throw sqlError("一次只能执行一条语句；要分几步，就分几次运行 saltnet sql");
    }
    return statement;
}

/** SQLite integers are read as BigInt so none is lost; one a JavaScript number cannot hold is text. */
function toValue(value: unknown): SqlValue {
    switch (typeof value) {
        case "bigint":
            return value >= BigInt(Number.MIN_SAFE_INTEGER) &&
                value <= BigInt(Number.MAX_SAFE_INTEGER)
                ? Number(value)
                : value.toString();
        case "number":
            // JSON has no infinity or NaN.
            return Number.isFinite(value) ? value : null;
        case "string":
            return value;
        default:
            // A BLOB is the one object SQLite gives back; it is written as hex digits.
            return value instanceof Uint8Array
                ? Array.from(value, byte => byte.toString(16).padStart(2, "0")).join("")
                : null;
    }
}

function toRow(columns: readonly string[], values: readonly unknown[]): SqlRow {
    const row: SqlRow = Object.create(null) as SqlRow;
    columns.forEach((name, index) => {
        row[name] = toValue(values[index]);
    });
    return row;
}

/**
 * Runs one query and returns at most `limit` rows. The rows after that are not read: the query
 * stops at the first one that does not fit, and `truncated` says there was one.
 */
export function runQuery(db: DatabaseSync, sql: string, limit: number): QueryResult {
    const statement = prepareOne(db, sql);
    const columns = statement.columns().map(({ name }) => name);
    const repeated = columns.find((name, index) => columns.indexOf(name) !== index);
    if (repeated !== undefined) {
        throw sqlError(`结果里有两列都叫 ${repeated}，用 AS 给它们起不同的名字`);
    }

    statement.setReturnArrays(true);
    statement.setReadBigInts(true);
    const rows: SqlRow[] = [];
    let truncated = false;
    try {
        for (const values of statement.iterate()) {
            if (rows.length >= limit) {
                truncated = true;
                break;
            }
            rows.push(toRow(columns, values as unknown as readonly unknown[]));
        }
    } catch (error) {
        throw toSqlError(error);
    }
    return { columns, rows, truncated };
}
