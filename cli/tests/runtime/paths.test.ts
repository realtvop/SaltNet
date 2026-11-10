import { existsSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";
import { ensureRuntimeDirs, resolveRuntimePaths } from "../../src/runtime/paths";

const base = { homeDir: "/home/agent", cwd: "/work/project" };

describe("resolveRuntimePaths", () => {
    it("defaults to ~/.saltnet", () => {
        expect(resolveRuntimePaths({ ...base, env: {} })).toEqual({
            home: "/home/agent/.saltnet",
            database: "/home/agent/.saltnet/saltnet.db",
            credentials: "/home/agent/.saltnet/credentials.json",
            config: "/home/agent/.saltnet/config.json",
            cache: "/home/agent/.saltnet/cache",
        });
    });

    it("uses SALTNET_HOME when it is absolute", () => {
        const paths = resolveRuntimePaths({ ...base, env: { SALTNET_HOME: "/data/saltnet" } });
        expect(paths.home).toBe("/data/saltnet");
        expect(paths.database).toBe("/data/saltnet/saltnet.db");
        expect(paths.cache).toBe("/data/saltnet/cache");
    });

    it("resolves a relative SALTNET_HOME against the working directory", () => {
        const paths = resolveRuntimePaths({ ...base, env: { SALTNET_HOME: "state/../state" } });
        expect(paths.home).toBe("/work/project/state");
    });

    it("expands a leading ~ that no shell expanded", () => {
        const home = (value: string) =>
            resolveRuntimePaths({ ...base, env: { SALTNET_HOME: value } }).home;
        expect(home("~")).toBe("/home/agent");
        expect(home("~/data/saltnet")).toBe("/home/agent/data/saltnet");
        // Only the current user's `~` is understood; `~other` is an ordinary relative name.
        expect(home("~other")).toBe("/work/project/~other");
    });

    it("treats an empty or blank SALTNET_HOME as unset", () => {
        for (const value of ["", "   "]) {
            const paths = resolveRuntimePaths({ ...base, env: { SALTNET_HOME: value } });
            expect(paths.home).toBe("/home/agent/.saltnet");
        }
    });

    it("reads the process environment by default, which the test setup points at a sandbox", () => {
        const paths = resolveRuntimePaths();
        expect(paths.home).toBe(path.resolve(process.env.SALTNET_HOME ?? ""));
        expect(paths.home.startsWith(tmpdir())).toBe(true);
    });

    it("does not touch the disk", () => {
        const sandbox = mkdtempSync(path.join(tmpdir(), "saltnet-paths-"));
        const home = path.join(sandbox, "never-created");
        resolveRuntimePaths({ env: { SALTNET_HOME: home } });
        expect(existsSync(home)).toBe(false);
    });
});

describe("ensureRuntimeDirs", () => {
    function sandboxPaths() {
        const sandbox = mkdtempSync(path.join(tmpdir(), "saltnet-paths-"));
        return resolveRuntimePaths({ env: { SALTNET_HOME: path.join(sandbox, "a", "b") } });
    }

    it("creates the data directory and cache/, private to the user", () => {
        const paths = sandboxPaths();
        ensureRuntimeDirs(paths);
        for (const dir of [paths.home, paths.cache]) {
            expect(statSync(dir).isDirectory()).toBe(true);
            expect(statSync(dir).mode & 0o777).toBe(0o700);
        }
    });

    it("can run again over an existing directory", () => {
        const paths = sandboxPaths();
        ensureRuntimeDirs(paths);
        writeFileSync(paths.config, "{}\n");
        ensureRuntimeDirs(paths);
        expect(existsSync(paths.config)).toBe(true);
    });

    it("explains it when the data directory is really a file", () => {
        const paths = sandboxPaths();
        ensureRuntimeDirs(paths);
        writeFileSync(paths.config, "{}\n");
        const blocked = { ...paths, home: paths.config, cache: path.join(paths.config, "cache") };
        expect(() => ensureRuntimeDirs(blocked)).toThrow(/不是目录/);
    });
});
