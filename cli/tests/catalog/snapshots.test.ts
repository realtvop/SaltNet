import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";
import { readSnapshot, snapshotPath, writeSnapshot } from "../../src/catalog/snapshots";
import { ensureRuntimeDirs } from "../../src/runtime/paths";
import { useTempHome } from "../tempHome";

const home = useTempHome();

function paths() {
    const made = home();
    ensureRuntimeDirs(made);
    return made;
}

describe("snapshots", () => {
    it("are saved as cache/<name>.json and read back", () => {
        const where = paths();
        const saved = writeSnapshot(where, "saltmeta", { version: 1, musics: [{ id: 8 }] });

        expect(saved).toBe(path.join(where.cache, "saltmeta.json"));
        expect(snapshotPath(where, "lxns-collections")).toBe(
            path.join(where.cache, "lxns-collections.json")
        );
        expect(readSnapshot(where, "saltmeta")).toEqual({ version: 1, musics: [{ id: 8 }] });
        expect(readFileSync(saved, "utf8")).toBe('{"version":1,"musics":[{"id":8}]}');
    });

    it("replace the previous one and leave no temporary file behind", () => {
        const where = paths();
        writeSnapshot(where, "saltmeta", { n: 1 });
        writeSnapshot(where, "saltmeta", { n: 2 });

        expect(readSnapshot(where, "saltmeta")).toEqual({ n: 2 });
        expect(readdirSync(where.cache)).toEqual(["saltmeta.json"]);
    });

    it.skipIf(process.platform === "win32")("are private to the user", () => {
        const where = paths();
        const saved = writeSnapshot(where, "saltmeta", {});
        expect(statSync(saved).mode & 0o777).toBe(0o600);
    });

    it("read as undefined when there is none, or when it is not JSON", () => {
        const where = paths();
        expect(readSnapshot(where, "saltmeta")).toBeUndefined();

        writeFileSync(snapshotPath(where, "saltmeta"), "{ not json");
        expect(readSnapshot(where, "saltmeta")).toBeUndefined();
    });

    it("clean up the temporary file when the rename fails", () => {
        const where = paths();
        // A directory in the way makes the rename fail after the temporary file was written.
        mkdirSync(snapshotPath(where, "saltmeta"));

        expect(() => writeSnapshot(where, "saltmeta", { n: 1 })).toThrow();
        expect(readdirSync(where.cache)).toEqual(["saltmeta.json"]);
    });
});
