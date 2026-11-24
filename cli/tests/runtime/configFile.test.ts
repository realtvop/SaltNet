import {
    chmodSync,
    existsSync,
    mkdirSync,
    readFileSync,
    statSync,
    utimesSync,
    writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { describe, expect, it, vi } from "vitest";
import { CliError } from "../../src/errors";
import { setConfigEntry, unsetConfigEntry } from "../../src/runtime/configFile";
import * as files from "../../src/runtime/files";
import { commandIn } from "../commandRun";
import { useTempHome } from "../tempHome";

async function rejected(write: Promise<unknown>): Promise<CliError> {
    try {
        await write;
    } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        return error as CliError;
    }
    throw new Error("expected invalid configuration");
}

describe("configFile", () => {
    const makeHome = useTempHome();

    it("keeps both changes when config unset starts during config set", async () => {
        const paths = makeHome();
        await setConfigEntry(paths, "metadata.maxAgeHours", 12);
        const write = files.writeFileAtomic;
        let second: ReturnType<typeof commandIn> | undefined;
        const spy = vi.spyOn(files, "writeFileAtomic").mockImplementation((...args) => {
            if (!second && args[0] === paths.config && String(args[1]).includes("new-agent")) {
                second = commandIn(paths, "config", ["unset", "metadata.maxAgeHours"]);
            }
            return write(...args);
        });
        try {
            const first = await commandIn(paths, "config", [
                "set",
                "network.userAgent",
                "new-agent",
            ]);
            expect(first.json.data.changed).toBe(true);
            expect((await second)?.json.data.changed).toBe(true);
            expect(JSON.parse(readFileSync(paths.config, "utf8"))).toEqual({
                network: { userAgent: "new-agent" },
            });
            expect(existsSync(paths.database)).toBe(false);
        } finally {
            spy.mockRestore();
        }
    });

    it("takes over an abandoned config lock and removes it after writing", async () => {
        const paths = makeHome();
        const lock = `${paths.config}.lock`;
        mkdirSync(lock, { recursive: true });
        const abandoned = path.join(lock, "owner-0-abandoned");
        writeFileSync(abandoned, "");
        utimesSync(abandoned, 1, 1);
        const result = await commandIn(paths, "config", ["set", "metadata.maxAgeHours", "0"]);
        expect(result.json.data.changed).toBe(true);
        expect(existsSync(lock)).toBe(false);
        expect(existsSync(paths.database)).toBe(false);
    });

    it("publishes DB_LOCKED when a config writer cannot take a live lock", async () => {
        const paths = makeHome();
        const lock = `${paths.config}.lock`;
        mkdirSync(lock, { recursive: true });
        const owner = path.join(lock, `owner-${process.pid}-live`);
        writeFileSync(owner, "");
        utimesSync(owner, 1, 1);
        const clock = vi.spyOn(performance, "now").mockReturnValue(10_000).mockReturnValueOnce(0);
        try {
            const result = await commandIn(paths, "config", ["set", "metadata.maxAgeHours", "0"]);
            expect(result.json.error).toMatchObject({ code: "DB_LOCKED", retryable: true });
            expect(existsSync(owner)).toBe(true);
            expect(existsSync(paths.config)).toBe(false);
            expect(existsSync(paths.database)).toBe(false);
        } finally {
            clock.mockRestore();
        }
    });

    it.skipIf(process.getuid?.() === 0 || process.platform === "win32")(
        "names the unwritable data directory when config set cannot write",
        async () => {
            const paths = makeHome();
            await setConfigEntry(paths, "metadata.maxAgeHours", 12);
            chmodSync(paths.home, 0o500);
            try {
                const result = await commandIn(paths, "config", [
                    "set",
                    "metadata.maxAgeHours",
                    "0",
                ]);
                expect(result.json.error.message).toContain(`数据目录 ${paths.home} 不可写`);
                expect(result.json.error.message).not.toMatch(/\.tmp/);
            } finally {
                chmodSync(paths.home, 0o700);
            }
        }
    );

    describe("setConfigEntry", () => {
        it("creates the directory and file on a fresh home with exact text and modes", async () => {
            const paths = makeHome();
            expect(existsSync(paths.home)).toBe(false);

            const result = await setConfigEntry(paths, "metadata.maxAgeHours", 12);
            expect(result).toEqual({ changed: true });

            const text = readFileSync(paths.config, "utf8");
            expect(text).toBe('{\n  "metadata": {\n    "maxAgeHours": 12\n  }\n}\n');

            if (process.platform !== "win32") {
                expect(statSync(paths.home).mode & 0o777).toBe(0o700);
                expect(statSync(paths.config).mode & 0o777).toBe(0o600);
            }
        });

        it("adding to an existing group keeps siblings, other groups, unknown keys and key order", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            const initial = {
                weird: 1,
                metadata: {
                    timeoutMs: 5000,
                    unknownKey: "kept",
                },
                otherGroup: { custom: true },
            };
            writeFileSync(paths.config, `${JSON.stringify(initial, null, 2)}\n`);

            const result = await setConfigEntry(paths, "metadata.maxAgeHours", 12);
            expect(result).toEqual({ changed: true });

            const parsed = JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                string,
                unknown
            >;
            expect(Object.keys(parsed)).toEqual(["weird", "metadata", "otherGroup"]);
            const metadata = parsed.metadata as Record<string, unknown>;
            expect(Object.keys(metadata)).toEqual(["timeoutMs", "unknownKey", "maxAgeHours"]);
            expect(metadata.timeoutMs).toBe(5000);
            expect(metadata.unknownKey).toBe("kept");
            expect(metadata.maxAgeHours).toBe(12);
            expect(parsed.weird).toBe(1);
            expect(parsed.otherGroup).toEqual({ custom: true });
        });

        it("appends a new group at the end", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(paths.config, '{\n  "metadata": {\n    "maxAgeHours": 12\n  }\n}\n');

            const result = await setConfigEntry(paths, "lxns.clientId", "my-client");
            expect(result).toEqual({ changed: true });

            const parsed = JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                string,
                unknown
            >;
            expect(Object.keys(parsed)).toEqual(["metadata", "lxns"]);
            expect(parsed.lxns).toEqual({ clientId: "my-client" });
        });

        it("leaves the file byte for byte when changed is false", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            const formatted = '{\n    "metadata": {\n        "maxAgeHours": 12\n    }\n}\n';
            writeFileSync(paths.config, formatted);

            const result = await setConfigEntry(paths, "metadata.maxAgeHours", 12);
            expect(result).toEqual({ changed: false });
            expect(readFileSync(paths.config, "utf8")).toBe(formatted);
        });

        it("replaces a non-object group", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(paths.config, '{\n  "lxns": 5\n}\n');

            const result = await setConfigEntry(paths, "lxns.clientId", "new-client");
            expect(result).toEqual({ changed: true });

            const parsed = JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                string,
                unknown
            >;
            expect(parsed.lxns).toEqual({ clientId: "new-client" });
        });

        it("replaces an invalid value", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(
                paths.config,
                '{\n  "metadata": {\n    "maxAgeHours": "invalid"\n  }\n}\n'
            );

            const result = await setConfigEntry(paths, "metadata.maxAgeHours", 24);
            expect(result).toEqual({ changed: true });

            const parsed = JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                string,
                unknown
            >;
            expect((parsed.metadata as Record<string, unknown>).maxAgeHours).toBe(24);
        });

        it("treats empty, whitespace-only, and BOM-prefixed file as {}", async () => {
            for (const content of ["", "   \n\t  ", "\uFEFF{}"]) {
                const paths = makeHome();
                mkdirSync(paths.home, { recursive: true });
                writeFileSync(paths.config, content);

                const result = await setConfigEntry(paths, "metadata.maxAgeHours", 12);
                expect(result).toEqual({ changed: true });
                const parsed = JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                    string,
                    unknown
                >;
                expect(parsed).toEqual({ metadata: { maxAgeHours: 12 } });
            }
        });

        it("writes string empty value and number values with their JSON types", async () => {
            const paths = makeHome();
            await setConfigEntry(paths, "api.url", "");
            await setConfigEntry(paths, "metadata.maxAgeHours", 12);

            const parsed = JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                string,
                unknown
            >;
            expect((parsed.api as Record<string, unknown>).url).toBe("");
            expect(typeof (parsed.api as Record<string, unknown>).url).toBe("string");
            expect((parsed.metadata as Record<string, unknown>).maxAgeHours).toBe(12);
            expect(typeof (parsed.metadata as Record<string, unknown>).maxAgeHours).toBe("number");
        });

        it("writes over the same value of another type", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            // The text "12" is not the number 12: it is a mistake in the file, and set puts it right.
            writeFileSync(paths.config, '{\n  "metadata": {\n    "maxAgeHours": "12"\n  }\n}\n');

            expect(await setConfigEntry(paths, "metadata.maxAgeHours", 12)).toEqual({
                changed: true,
            });
            expect(readFileSync(paths.config, "utf8")).toBe(
                '{\n  "metadata": {\n    "maxAgeHours": 12\n  }\n}\n'
            );
        });

        it("replaces a group that is null or a list", async () => {
            for (const group of ["null", '["a"]']) {
                const paths = makeHome();
                mkdirSync(paths.home, { recursive: true });
                writeFileSync(paths.config, `{"lxns": ${group}}`);

                expect(await setConfigEntry(paths, "lxns.clientId", "x")).toEqual({
                    changed: true,
                });
                expect(JSON.parse(readFileSync(paths.config, "utf8"))).toEqual({
                    lxns: { clientId: "x" },
                });
            }
        });

        it("refuses a file that is JSON but not an object, whatever it holds", async () => {
            for (const content of ["null", "5", '"text"', "true"]) {
                const paths = makeHome();
                mkdirSync(paths.home, { recursive: true });
                writeFileSync(paths.config, content);

                const error = await rejected(setConfigEntry(paths, "metadata.maxAgeHours", 12));
                expect(error.code).toBe("USAGE");
                expect(error.message).toBe(
                    `config.json 的内容必须是 JSON 对象，没有改动；请先修好或删掉 ${paths.config}`
                );
                expect(readFileSync(paths.config, "utf8")).toBe(content);
            }
        });

        it("reports errors for malformed, non-object, and unreadable config.json without touching it", async () => {
            // Not valid JSON
            const paths1 = makeHome();
            mkdirSync(paths1.home, { recursive: true });
            writeFileSync(paths1.config, "{ not json");
            const err1 = await rejected(setConfigEntry(paths1, "metadata.maxAgeHours", 12));
            expect(err1.code).toBe("USAGE");
            expect(err1.message).toBe(
                `config.json 不是合法的 JSON，没有改动；请先修好或删掉 ${paths1.config}`
            );
            expect(readFileSync(paths1.config, "utf8")).toBe("{ not json");

            // JSON but not an object
            const paths2 = makeHome();
            mkdirSync(paths2.home, { recursive: true });
            writeFileSync(paths2.config, "[]");
            const err2 = await rejected(setConfigEntry(paths2, "metadata.maxAgeHours", 12));
            expect(err2.code).toBe("USAGE");
            expect(err2.message).toBe(
                `config.json 的内容必须是 JSON 对象，没有改动；请先修好或删掉 ${paths2.config}`
            );
            expect(readFileSync(paths2.config, "utf8")).toBe("[]");

            // Cannot be read (directory)
            const paths3 = makeHome();
            mkdirSync(paths3.config, { recursive: true });
            const err3 = await rejected(setConfigEntry(paths3, "metadata.maxAgeHours", 12));
            expect(err3.code).toBe("USAGE");
            expect(err3.message).toBe(
                `无法读取 config.json（EISDIR），没有改动；请先修好或删掉 ${paths3.config}`
            );
            expect(statSync(paths3.config).isDirectory()).toBe(true);
        });
    });

    describe("unsetConfigEntry", () => {
        it("removes a group when it becomes empty and writes {} when nothing is left", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(paths.config, '{\n  "metadata": {\n    "maxAgeHours": 12\n  }\n}\n');

            const result = await unsetConfigEntry(paths, "metadata.maxAgeHours");
            expect(result).toEqual({ changed: true });
            expect(readFileSync(paths.config, "utf8")).toBe("{}\n");
        });

        it("keeps the group when other entries remain", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(
                paths.config,
                '{\n  "metadata": {\n    "maxAgeHours": 12,\n    "timeoutMs": 8000\n  }\n}\n'
            );

            const result = await unsetConfigEntry(paths, "metadata.maxAgeHours");
            expect(result).toEqual({ changed: true });

            const parsed = JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                string,
                unknown
            >;
            expect(parsed).toEqual({ metadata: { timeoutMs: 8000 } });
        });

        it("does not create a directory when the file is missing", async () => {
            const paths = makeHome();
            expect(existsSync(paths.home)).toBe(false);

            const result = await unsetConfigEntry(paths, "metadata.maxAgeHours");
            expect(result).toEqual({ changed: false });
            expect(existsSync(paths.home)).toBe(false);
        });

        it("removes a non-object group as a whole", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(paths.config, '{\n  "lxns": 5\n}\n');

            const result = await unsetConfigEntry(paths, "lxns.clientId");
            expect(result).toEqual({ changed: true });
            expect(readFileSync(paths.config, "utf8")).toBe("{}\n");
        });

        it("removes a group that is null or a list as a whole, and keeps the others", async () => {
            for (const group of ["null", '["a"]']) {
                const paths = makeHome();
                mkdirSync(paths.home, { recursive: true });
                writeFileSync(paths.config, `{"lxns": ${group}, "scores": {"staleDays": 5}}`);

                expect(await unsetConfigEntry(paths, "lxns.clientId")).toEqual({ changed: true });
                expect(JSON.parse(readFileSync(paths.config, "utf8"))).toEqual({
                    scores: { staleDays: 5 },
                });
            }
        });

        it("refuses a file that is JSON but not an object, whatever it holds", async () => {
            for (const content of ["null", "5", '"text"', "true"]) {
                const paths = makeHome();
                mkdirSync(paths.home, { recursive: true });
                writeFileSync(paths.config, content);

                const error = await rejected(unsetConfigEntry(paths, "metadata.maxAgeHours"));
                expect(error.code).toBe("USAGE");
                expect(error.message).toBe(
                    `config.json 的内容必须是 JSON 对象，没有改动；请先修好或删掉 ${paths.config}`
                );
                expect(readFileSync(paths.config, "utf8")).toBe(content);
            }
        });

        it("leaves the file byte for byte when the key or group is missing", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            const formatted = '{\n    "metadata": {\n        "maxAgeHours": 12\n    }\n}\n';
            writeFileSync(paths.config, formatted);

            // Missing key in existing group
            expect(await unsetConfigEntry(paths, "metadata.timeoutMs")).toEqual({ changed: false });
            expect(readFileSync(paths.config, "utf8")).toBe(formatted);

            // Missing group
            expect(await unsetConfigEntry(paths, "lxns.clientId")).toEqual({ changed: false });
            expect(readFileSync(paths.config, "utf8")).toBe(formatted);
        });

        it("reports errors for malformed, non-object, and unreadable config.json without touching it", async () => {
            const paths1 = makeHome();
            mkdirSync(paths1.home, { recursive: true });
            writeFileSync(paths1.config, "{ not json");
            const err1 = await rejected(unsetConfigEntry(paths1, "metadata.maxAgeHours"));
            expect(err1.code).toBe("USAGE");
            expect(err1.message).toBe(
                `config.json 不是合法的 JSON，没有改动；请先修好或删掉 ${paths1.config}`
            );
            expect(readFileSync(paths1.config, "utf8")).toBe("{ not json");

            const paths2 = makeHome();
            mkdirSync(paths2.home, { recursive: true });
            writeFileSync(paths2.config, "[]");
            const err2 = await rejected(unsetConfigEntry(paths2, "metadata.maxAgeHours"));
            expect(err2.code).toBe("USAGE");
            expect(err2.message).toBe(
                `config.json 的内容必须是 JSON 对象，没有改动；请先修好或删掉 ${paths2.config}`
            );
            expect(readFileSync(paths2.config, "utf8")).toBe("[]");

            const paths3 = makeHome();
            mkdirSync(paths3.config, { recursive: true });
            const err3 = await rejected(unsetConfigEntry(paths3, "metadata.maxAgeHours"));
            expect(err3.code).toBe("USAGE");
            expect(err3.message).toBe(
                `无法读取 config.json（EISDIR），没有改动；请先修好或删掉 ${paths3.config}`
            );
            expect(statSync(paths3.config).isDirectory()).toBe(true);
        });
    });
});
