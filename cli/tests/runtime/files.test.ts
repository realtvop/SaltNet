import {
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileAtomic } from "../../src/runtime/files";

describe("writeFileAtomic", () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(path.join(tmpdir(), "saltnet-files-"));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it("creates a file with the content", () => {
        const file = path.join(dir, "target.txt");
        writeFileAtomic(file, "hello world");
        expect(readFileSync(file, "utf8")).toBe("hello world");
    });

    it("replaces an existing file content and resets mode from 0o644 to 0o600", () => {
        const file = path.join(dir, "target.txt");
        writeFileSync(file, "initial content", { mode: 0o644 });
        if (process.platform !== "win32") {
            expect(statSync(file).mode & 0o777).toBe(0o644);
        }

        writeFileAtomic(file, "updated content");
        expect(readFileSync(file, "utf8")).toBe("updated content");
        if (process.platform !== "win32") {
            expect(statSync(file).mode & 0o777).toBe(0o600);
        }
    });

    it("uses default mode 0o600 and respects an explicit 0o400", () => {
        const defaultFile = path.join(dir, "default-mode.txt");
        writeFileAtomic(defaultFile, "default mode");
        if (process.platform !== "win32") {
            expect(statSync(defaultFile).mode & 0o777).toBe(0o600);
        }

        const explicitFile = path.join(dir, "explicit-mode.txt");
        writeFileAtomic(explicitFile, "explicit mode", 0o400);
        if (process.platform !== "win32") {
            expect(statSync(explicitFile).mode & 0o777).toBe(0o400);
        }
    });

    it("leaves only the target in the directory after a successful write", () => {
        const file = path.join(dir, "clean.txt");
        writeFileAtomic(file, "only target");
        expect(readdirSync(dir)).toEqual(["clean.txt"]);
    });

    it("throws ENOENT and creates nothing when parent directory is missing", () => {
        const missingDir = path.join(dir, "nonexistent");
        const file = path.join(missingDir, "target.txt");
        let thrownError: unknown;
        try {
            writeFileAtomic(file, "test");
        } catch (error) {
            thrownError = error;
        }
        expect((thrownError as { code?: string })?.code).toBe("ENOENT");
        expect(readdirSync(dir)).toEqual([]);
    });

    it("throws when target is an existing directory and leaves no tmp file", () => {
        const targetDir = path.join(dir, "existing-dir");
        mkdirSync(targetDir);

        let thrownError: unknown;
        try {
            writeFileAtomic(targetDir, "content");
        } catch (error) {
            thrownError = error;
        }
        expect(thrownError).toBeDefined();
        expect(statSync(targetDir).isDirectory()).toBe(true);
        const tmpFiles = readdirSync(dir).filter(name => name.endsWith(".tmp"));
        expect(tmpFiles).toEqual([]);
    });

    it("replaces the first write completely when writing shorter content", () => {
        const file = path.join(dir, "shorter.txt");
        writeFileAtomic(file, "a very long initial content that spans many characters");
        writeFileAtomic(file, "short");
        expect(readFileSync(file, "utf8")).toBe("short");
    });
});
