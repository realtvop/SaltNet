import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";

/** The environment variable that moves the CLI's whole data directory. */
export const HOME_ENV_VAR = "SALTNET_HOME";

/** Where everything the CLI keeps on disk lives. */
export interface RuntimePaths {
    /** The data directory (`SALTNET_HOME`, default `~/.saltnet`). */
    home: string;
    /** SQLite database with metadata and user data. */
    database: string;
    /** Tokens and in-progress authorizations; kept apart so `sql` can never reach them. */
    credentials: string;
    /** Optional user settings. */
    config: string;
    /** Raw upstream snapshots and database backups made before migrations. */
    cache: string;
}

export interface ResolvePathsOptions {
    /** Environment to read `SALTNET_HOME` from; defaults to the process environment. */
    env?: Readonly<Record<string, string | undefined>>;
    /** The user's home directory, for the default location and a leading `~`. */
    homeDir?: string;
    /** What a relative `SALTNET_HOME` is resolved against. */
    cwd?: string;
}

/**
 * Works out the data directory and the files inside it. This never touches the disk: commands that
 * only print help or the schema must not create `~/.saltnet`.
 */
export function resolveRuntimePaths(options: ResolvePathsOptions = {}): RuntimePaths {
    const env = options.env ?? process.env;
    const userHome = options.homeDir ?? homedir();
    const cwd = options.cwd ?? process.cwd();

    const configured = env[HOME_ENV_VAR];
    const home =
        configured === undefined || configured.trim() === ""
            ? path.join(userHome, ".saltnet")
            : path.resolve(cwd, expandTilde(configured, userHome));

    return {
        home,
        database: path.join(home, "saltnet.db"),
        credentials: path.join(home, "credentials.json"),
        config: path.join(home, "config.json"),
        cache: path.join(home, "cache"),
    };
}

/**
 * A `~` is not expanded when the variable is set from a place that is not a shell (an agent's
 * environment block, a `.env` file), so it would otherwise create a directory named `~` in the
 * current directory.
 */
function expandTilde(value: string, userHome: string): string {
    if (value === "~") return userHome;
    if (value.startsWith("~/") || value.startsWith(`~${path.sep}`)) {
        return path.join(userHome, value.slice(2));
    }
    return value;
}

/**
 * Creates the data directory and `cache/`. They hold credentials and the user's scores, so new
 * directories are private to the user.
 */
export function ensureRuntimeDirs(paths: RuntimePaths): void {
    for (const dir of [paths.home, paths.cache]) {
        try {
            mkdirSync(dir, { recursive: true, mode: 0o700 });
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === "EEXIST" || code === "ENOTDIR") {
                throw new Error(`${dir} 已经存在但不是目录；请检查 ${HOME_ENV_VAR}`, {
                    cause: error,
                });
            }
            throw error;
        }
    }
}
