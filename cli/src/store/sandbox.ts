/**
 * Where a `sql` query runs (design 2.2). The query is written by a person or an agent, so it must
 * not be able to read a base table or write anything, and the way to be sure of that is to run it
 * where there is nothing to read: a throwaway in-memory database that holds a copy of the views the
 * query names and nothing else.
 *
 * The copy is made while the real database is attached read-only (`?mode=ro`, so even a mistake
 * here cannot write to it), all views inside one transaction so they come from one snapshot, and
 * the real database is detached again before the query is prepared. The query then runs under an
 * authorizer that allows `SELECT` of these copies and refuses everything else.
 *
 * An authorizer on the real connection with views over the base tables would not do: SQLite
 * reports a read of a view's base table without saying it came through a view for `count(*)`, so a
 * query could not be told from one that reads the table itself, and a CTE named like a view can
 * stand in for its context.
 */
import type { DatabaseSync } from "./sqlite";
import { pathToFileURL } from "node:url";
import { storeError } from "./errors";
import { loadSqlite } from "./sqlite";
import { DEFAULT_BUSY_TIMEOUT_MS } from "./store";

/** The name the database has while the views are copied out of it: what a view's SELECT reads. */
export const REAL_SCHEMA = "real";

export interface SandboxView {
    readonly name: string;
    readonly columns: readonly { readonly name: string; readonly type: string }[];
    /** Yields exactly `columns`, in this order, reading the database as `real.<table>`. */
    readonly select: string;
}

export interface SandboxOptions<T> {
    /** The database file to copy from. */
    readonly database: string;
    /** The views to copy. Without any, the database is not opened at all. */
    readonly views: readonly SandboxView[];
    /**
     * Reads something else from the database, from the same snapshot as the copies (it can read
     * `real.<table>`), so that it describes the data the query will see.
     */
    readonly readAlso?: (db: DatabaseSync) => T;
    readonly busyTimeoutMs?: number;
}

export interface Sandbox<T> {
    /** The database the query runs in; it has only the copies and refuses everything else. */
    readonly db: DatabaseSync;
    /** What `readAlso` returned; undefined when there was nothing to copy from. */
    readonly also: T | undefined;
    /** Closing twice is fine. */
    readonly close: () => void;
}

/**
 * Table-valued functions that are not tables of the database: they only take apart the JSON they
 * are given. The ones that read the database itself (`pragma_*`, `dbstat`) are not on the list.
 */
const ALLOWED_TABLE_FUNCTIONS = ["json_each", "json_tree", "jsonb_each", "jsonb_tree"];

/** Functions that reach outside the database; the build has none of them, and this keeps it so. */
const DENIED_FUNCTIONS = new Set([
    "load_extension",
    "fts3_tokenizer",
    "readfile",
    "writefile",
    "edit",
]);

function quoteIdentifier(name: string): string {
    return `"${name.replaceAll('"', '""')}"`;
}

function copyView(db: DatabaseSync, view: SandboxView): void {
    const names = view.columns.map(({ name }) => quoteIdentifier(name));
    const definitions = view.columns.map(({ name, type }) => `${quoteIdentifier(name)} ${type}`);
    db.exec(`CREATE TABLE ${quoteIdentifier(view.name)} (${definitions.join(", ")})`);
    db.exec(`INSERT INTO ${quoteIdentifier(view.name)} (${names.join(", ")}) ${view.select}`);
}

/**
 * From here on the connection only answers queries about the copies: `SELECT`, the functions of
 * SQL, and the tables named. Whatever the authorizer does not allow is refused, so a statement
 * SQLite adds in a later version is refused until someone decides it is harmless.
 */
function lockDown(db: DatabaseSync, tables: ReadonlySet<string>): void {
    const { constants } = loadSqlite();
    db.exec("PRAGMA query_only = ON");
    db.enableDefensive(true);
    db.setAuthorizer((action, table, name) => {
        switch (action) {
            case constants.SQLITE_SELECT:
            case constants.SQLITE_RECURSIVE:
                return constants.SQLITE_OK;
            case constants.SQLITE_READ:
                return table !== null && tables.has(table.toLowerCase())
                    ? constants.SQLITE_OK
                    : constants.SQLITE_DENY;
            case constants.SQLITE_FUNCTION:
                return name !== null && DENIED_FUNCTIONS.has(name.toLowerCase())
                    ? constants.SQLITE_DENY
                    : constants.SQLITE_OK;
            default:
                return constants.SQLITE_DENY;
        }
    });
}

export function openSandbox<T = undefined>(options: SandboxOptions<T>): Sandbox<T> {
    const { database, views, readAlso } = options;
    const { DatabaseSync } = loadSqlite();
    const db = new DatabaseSync(":memory:");
    let also: T | undefined;

    try {
        if (views.length > 0) {
            db.exec(`PRAGMA busy_timeout = ${options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS}`);
            // A URI, because only one can say read-only; `pathToFileURL` escapes what a path may
            // hold (spaces, `?`, `#`, `%`) and is the form SQLite wants on Windows too.
            db.prepare(`ATTACH DATABASE ? AS ${REAL_SCHEMA}`).run(
                `${pathToFileURL(database).href}?mode=ro`
            );
            // One transaction, so the copies and `readAlso` see one snapshot of the database.
            db.exec("BEGIN");
            try {
                for (const view of views) copyView(db, view);
                also = readAlso?.(db);
                db.exec("COMMIT");
            } catch (error) {
                if (db.isTransaction) db.exec("ROLLBACK");
                throw error;
            }
            db.exec(`DETACH DATABASE ${REAL_SCHEMA}`);
        }
        // Lower case, as the authorizer's table is compared in `lockDown`: SQL names do not depend
        // on case, so a view called `V_Things` is read as `v_things`.
        const readable = views.map(({ name }) => name.toLowerCase());
        lockDown(db, new Set([...readable, ...ALLOWED_TABLE_FUNCTIONS]));
    } catch (error) {
        if (db.isOpen) db.close();
        throw storeError(error, database) ?? error;
    }

    return {
        db,
        also,
        close: () => {
            if (db.isOpen) db.close();
        },
    };
}
