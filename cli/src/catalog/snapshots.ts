/**
 * The raw upstream documents, kept in `cache/` (design 2.1) so the catalog can be rebuilt without
 * the network and a bad refresh can be looked into. A snapshot is written to a temporary file and
 * renamed, so a reader never sees half of one.
 */
import type { RuntimePaths } from "../runtime/paths";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

export type SnapshotName = "saltmeta" | "lxns-collections";

export function snapshotPath(paths: RuntimePaths, name: SnapshotName): string {
    return path.join(paths.cache, `${name}.json`);
}

/** Saves `data` as `cache/<name>.json`, replacing the previous snapshot in one step. */
export function writeSnapshot(paths: RuntimePaths, name: SnapshotName, data: unknown): string {
    const target = snapshotPath(paths, name);
    const temporary = `${target}.${process.pid}.tmp`;
    try {
        // The mode only applies to a file that is created, which is what the temporary one is.
        writeFileSync(temporary, JSON.stringify(data), { mode: 0o600 });
        renameSync(temporary, target);
    } catch (error) {
        rmSync(temporary, { force: true });
        throw error;
    }
    return target;
}

/** The saved document, or undefined when there is none or it is not JSON. */
export function readSnapshot(paths: RuntimePaths, name: SnapshotName): unknown {
    try {
        return JSON.parse(readFileSync(snapshotPath(paths, name), "utf8")) as unknown;
    } catch {
        return undefined;
    }
}
