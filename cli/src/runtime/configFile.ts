/**
 * Changing one entry of `config.json` (design 3.2, `config set` and `config unset`). The file is
 * read as plain JSON, the entry is changed and the whole file is written back in one step, so what
 * else the user keeps in it (settings of a newer version, entries this version ignores) stays as
 * it was.
 */
import type { ConfigKey, ConfigValue } from "./config";
import type { RuntimePaths } from "./paths";
import {
    existsSync,
    mkdtempSync,
    readdirSync,
    renameSync,
    rmdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { CliError, usageError } from "../errors";
import { readConfigFile } from "./config";
import { writeFileAtomic } from "./files";
import { ensureRuntimeDirs } from "./paths";

type PlainObject = Record<string, unknown>;

const LOCK_TIMEOUT_MS = 5_000;

function processExists(pid: number): boolean {
    if (pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code !== "ESRCH";
    }
}

function removeEmptyLock(lock: string): void {
    try {
        rmdirSync(lock);
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT" && code !== "ENOTEMPTY" && code !== "EEXIST") throw error;
    }
}

function discardAbandonedOwner(lock: string): void {
    let members: string[];
    try {
        members = readdirSync(lock);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
    }
    for (const member of members) {
        const owner = /^owner-(\d+)-/.exec(member);
        if (!owner) continue;
        const file = path.join(lock, member);
        const stat = statSync(file, { throwIfNoEntry: false });
        if (
            stat &&
            Date.now() - stat.mtimeMs >= LOCK_TIMEOUT_MS &&
            !processExists(Number(owner[1]))
        ) {
            rmSync(file, { force: true });
        }
    }
    removeEmptyLock(lock);
}

/** An occupied lock directory always contains a unique owner file. */
async function withConfigLock<T>(paths: RuntimePaths, work: () => T): Promise<T> {
    const lock = `${paths.config}.lock`;
    try {
        ensureRuntimeDirs(paths);
        const candidate = mkdtempSync(`${lock}-`);
        const owner = `owner-${process.pid}-${path.basename(candidate)}`;
        let acquired = false;
        const deadline = performance.now() + LOCK_TIMEOUT_MS;
        try {
            writeFileSync(path.join(candidate, owner), "", { mode: 0o600 });
            while (true) {
                try {
                    // Publishing the nonempty directory atomically prevents a concurrent reaper
                    // from unlinking a new owner's lock after examining an old one.
                    renameSync(candidate, lock);
                    acquired = true;
                    break;
                } catch (error) {
                    const code = (error as NodeJS.ErrnoException).code;
                    if (
                        code !== "ENOTEMPTY" &&
                        code !== "EEXIST" &&
                        !(process.platform === "win32" && code === "EPERM" && existsSync(lock))
                    ) {
                        throw error;
                    }
                }
                discardAbandonedOwner(lock);
                const remaining = deadline - performance.now();
                if (remaining <= 0) {
                    throw new CliError(
                        "DB_LOCKED",
                        `配置文件 ${paths.config} 正被另一个 saltnet 进程占用；稍后再试`
                    );
                }
                await new Promise(resolve => setTimeout(resolve, Math.min(remaining, 50)));
            }
            return work();
        } finally {
            if (acquired) {
                rmSync(path.join(lock, owner), { force: true });
                removeEmptyLock(lock);
            } else {
                rmSync(candidate, { recursive: true, force: true });
            }
        }
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EACCES" || code === "EPERM") {
            throw new CliError("INTERNAL", `数据目录 ${paths.home} 不可写；请检查目录权限`);
        }
        throw error;
    }
}

function isPlainObject(value: unknown): value is PlainObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The content of `config.json` as an object; a missing or empty file is `{}`. A file that cannot be
 * read or is not a JSON object stays untouched: writing it back would throw away what the user
 * wrote, so the person has to fix or delete it.
 */
function readEditable(paths: Pick<RuntimePaths, "config">): PlainObject {
    const file = readConfigFile(paths.config);
    const [problem] = file.problems;
    if (problem) {
        throw usageError(`${problem.message}，没有改动；请先修好或删掉 ${paths.config}`);
    }
    if (file.data === undefined) return {};
    if (!isPlainObject(file.data)) {
        throw usageError(
            `config.json 的内容必须是 JSON 对象，没有改动；请先修好或删掉 ${paths.config}`
        );
    }
    return file.data;
}

async function editConfig(paths: RuntimePaths, edit: (content: PlainObject) => boolean) {
    // A no-op can complete at its first read, without creating anything or needing write access.
    if (!edit(readEditable(paths))) return { changed: false };
    return withConfigLock(paths, () => {
        const current = readEditable(paths);
        const changed = edit(current);
        if (changed) writeFileAtomic(paths.config, `${JSON.stringify(current, null, 2)}\n`);
        return { changed };
    });
}

function splitKey(key: ConfigKey): [group: string, name: string] {
    const [group, name] = key.split(".");
    return [group, name];
}

/**
 * Sets one entry, creating the file and its group when they are missing. A group that is not an
 * object is replaced (it was an error already). `changed` is false when the file said so already,
 * in which case nothing is written.
 */
export function setConfigEntry(
    paths: RuntimePaths,
    key: ConfigKey,
    value: ConfigValue
): Promise<{ changed: boolean }> {
    const [group, name] = splitKey(key);
    return editConfig(paths, content => {
        const current = content[group];
        const members = isPlainObject(current) ? current : undefined;
        if (members && members[name] === value) return false;

        content[group] = { ...members, [name]: value };
        return true;
    });
}

/**
 * Removes one entry, and its group when that leaves it empty, so the setting goes back to the
 * default. A group that is not an object is removed as a whole (it was an error already). Nothing
 * is written, and no directory created, when there was nothing to remove.
 */
export function unsetConfigEntry(
    paths: RuntimePaths,
    key: ConfigKey
): Promise<{ changed: boolean }> {
    const [group, name] = splitKey(key);
    return editConfig(paths, content => {
        const current = content[group];
        if (current === undefined) return false;

        if (isPlainObject(current)) {
            if (!(name in current)) return false;
            const rest = { ...current };
            delete rest[name];
            if (Object.keys(rest).length > 0) content[group] = rest;
            else delete content[group];
        } else {
            delete content[group];
        }
        return true;
    });
}
