/**
 * Loads `node:sqlite`. Node 24 ships it, but some 24.x releases announce it with an
 * ExperimentalWarning on stderr. A person at a terminal does not need that and an agent must not
 * have to read it (design 4.2: stderr stays silent unless something is worth saying), so the
 * warning about SQLite is swallowed while the module loads. Every other warning is left alone.
 */
import type * as SqliteTypes from "node:sqlite";
import process from "node:process";
import { CliError } from "../errors";

export type { DatabaseSync, StatementSync } from "node:sqlite";

export type SqliteModule = typeof SqliteTypes;

type EmitWarning = typeof process.emitWarning;

function isSqliteWarning(warning: string | Error, rest: readonly unknown[]): boolean {
    const message = warning instanceof Error ? warning.message : String(warning);
    let type: unknown = warning instanceof Error ? warning.name : rest[0];
    // `process.emitWarning(message, { type })` is the other way to name the type.
    if (typeof type === "object" && type !== null) type = (type as { type?: unknown }).type;
    return type === "ExperimentalWarning" && /sqlite/i.test(message);
}

/** Runs `load` with the experimental-feature warning about SQLite dropped. */
export function withoutSqliteWarning<T>(load: () => T): T {
    const original = process.emitWarning;
    process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
        if (isSqliteWarning(warning, rest)) return;
        Reflect.apply(original, process, [warning, ...rest]);
    }) as unknown as EmitWarning;
    try {
        return load();
    } finally {
        process.emitWarning = original;
    }
}

let loaded: SqliteModule | undefined;

/**
 * The `node:sqlite` module, loaded on first use: commands that never touch the database (help,
 * schema, config) do not pay for it.
 */
export function loadSqlite(): SqliteModule {
    if (loaded) return loaded;
    // `getBuiltinModule` loads synchronously, which keeps opening the store synchronous too.
    const sqlite = withoutSqliteWarning(
        () => process.getBuiltinModule("node:sqlite") as unknown as SqliteModule | undefined
    );
    if (sqlite === undefined) {
        throw new CliError(
            "INTERNAL",
            `这个 Node（${process.version}）没有内置 node:sqlite，saltnet 需要 Node 24 或更新的版本`
        );
    }
    loaded = sqlite;
    return sqlite;
}
