/**
 * Changing one entry of `config.json` (design 3.2, `config set` and `config unset`). The file is
 * read as plain JSON, the entry is changed and the whole file is written back in one step, so what
 * else the user keeps in it (settings of a newer version, entries this version ignores) stays as
 * it was.
 */
import type { ConfigKey, ConfigValue } from "./config";
import type { RuntimePaths } from "./paths";
import { usageError } from "../errors";
import { readConfigFile } from "./config";
import { writeFileAtomic } from "./files";
import { ensureRuntimeDirs } from "./paths";

type PlainObject = Record<string, unknown>;

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

function write(paths: RuntimePaths, content: PlainObject): void {
    ensureRuntimeDirs(paths);
    writeFileAtomic(paths.config, `${JSON.stringify(content, null, 2)}\n`);
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
): { changed: boolean } {
    const [group, name] = splitKey(key);
    const content = readEditable(paths);
    const current = content[group];
    const members = isPlainObject(current) ? current : undefined;
    if (members && members[name] === value) return { changed: false };

    content[group] = { ...members, [name]: value };
    write(paths, content);
    return { changed: true };
}

/**
 * Removes one entry, and its group when that leaves it empty, so the setting goes back to the
 * default. A group that is not an object is removed as a whole (it was an error already). Nothing
 * is written, and no directory created, when there was nothing to remove.
 */
export function unsetConfigEntry(paths: RuntimePaths, key: ConfigKey): { changed: boolean } {
    const [group, name] = splitKey(key);
    const content = readEditable(paths);
    const current = content[group];
    if (current === undefined) return { changed: false };

    if (isPlainObject(current)) {
        if (!(name in current)) return { changed: false };
        const rest = { ...current };
        delete rest[name];
        if (Object.keys(rest).length > 0) content[group] = rest;
        else delete content[group];
    } else {
        delete content[group];
    }
    write(paths, content);
    return { changed: true };
}
