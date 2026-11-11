import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import process from "node:process";
import { describe, expect, it } from "vitest";
import { setConfigEntry, unsetConfigEntry } from "../../src/runtime/configFile";
import { caught } from "../caught";
import { useTempHome } from "../tempHome";

describe("configFile", () => {
    const makeHome = useTempHome();

    describe("setConfigEntry", () => {
        it("creates the directory and file on a fresh home with exact text and modes", () => {
            const paths = makeHome();
            expect(existsSync(paths.home)).toBe(false);

            const result = setConfigEntry(paths, "metadata.maxAgeHours", 12);
            expect(result).toEqual({ changed: true });

            const text = readFileSync(paths.config, "utf8");
            expect(text).toBe('{\n  "metadata": {\n    "maxAgeHours": 12\n  }\n}\n');

            if (process.platform !== "win32") {
                expect(statSync(paths.home).mode & 0o777).toBe(0o700);
                expect(statSync(paths.config).mode & 0o777).toBe(0o600);
            }
        });

        it("adding to an existing group keeps siblings, other groups, unknown keys and key order", () => {
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

            const result = setConfigEntry(paths, "metadata.maxAgeHours", 12);
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

        it("appends a new group at the end", () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(paths.config, '{\n  "metadata": {\n    "maxAgeHours": 12\n  }\n}\n');

            const result = setConfigEntry(paths, "lxns.clientId", "my-client");
            expect(result).toEqual({ changed: true });

            const parsed = JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                string,
                unknown
            >;
            expect(Object.keys(parsed)).toEqual(["metadata", "lxns"]);
            expect(parsed.lxns).toEqual({ clientId: "my-client" });
        });

        it("leaves the file byte for byte when changed is false", () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            const formatted = '{\n    "metadata": {\n        "maxAgeHours": 12\n    }\n}\n';
            writeFileSync(paths.config, formatted);

            const result = setConfigEntry(paths, "metadata.maxAgeHours", 12);
            expect(result).toEqual({ changed: false });
            expect(readFileSync(paths.config, "utf8")).toBe(formatted);
        });

        it("replaces a non-object group", () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(paths.config, '{\n  "lxns": 5\n}\n');

            const result = setConfigEntry(paths, "lxns.clientId", "new-client");
            expect(result).toEqual({ changed: true });

            const parsed = JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                string,
                unknown
            >;
            expect(parsed.lxns).toEqual({ clientId: "new-client" });
        });

        it("replaces an invalid value", () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(
                paths.config,
                '{\n  "metadata": {\n    "maxAgeHours": "invalid"\n  }\n}\n'
            );

            const result = setConfigEntry(paths, "metadata.maxAgeHours", 24);
            expect(result).toEqual({ changed: true });

            const parsed = JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                string,
                unknown
            >;
            expect((parsed.metadata as Record<string, unknown>).maxAgeHours).toBe(24);
        });

        it("treats empty, whitespace-only, and BOM-prefixed file as {}", () => {
            for (const content of ["", "   \n\t  ", "\uFEFF{}"]) {
                const paths = makeHome();
                mkdirSync(paths.home, { recursive: true });
                writeFileSync(paths.config, content);

                const result = setConfigEntry(paths, "metadata.maxAgeHours", 12);
                expect(result).toEqual({ changed: true });
                const parsed = JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                    string,
                    unknown
                >;
                expect(parsed).toEqual({ metadata: { maxAgeHours: 12 } });
            }
        });

        it("writes string empty value and number values with their JSON types", () => {
            const paths = makeHome();
            setConfigEntry(paths, "api.url", "");
            setConfigEntry(paths, "metadata.maxAgeHours", 12);

            const parsed = JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                string,
                unknown
            >;
            expect((parsed.api as Record<string, unknown>).url).toBe("");
            expect(typeof (parsed.api as Record<string, unknown>).url).toBe("string");
            expect((parsed.metadata as Record<string, unknown>).maxAgeHours).toBe(12);
            expect(typeof (parsed.metadata as Record<string, unknown>).maxAgeHours).toBe("number");
        });

        it("writes over the same value of another type", () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            // The text "12" is not the number 12: it is a mistake in the file, and set puts it right.
            writeFileSync(paths.config, '{\n  "metadata": {\n    "maxAgeHours": "12"\n  }\n}\n');

            expect(setConfigEntry(paths, "metadata.maxAgeHours", 12)).toEqual({ changed: true });
            expect(readFileSync(paths.config, "utf8")).toBe(
                '{\n  "metadata": {\n    "maxAgeHours": 12\n  }\n}\n'
            );
        });

        it("replaces a group that is null or a list", () => {
            for (const group of ["null", '["a"]']) {
                const paths = makeHome();
                mkdirSync(paths.home, { recursive: true });
                writeFileSync(paths.config, `{"lxns": ${group}}`);

                expect(setConfigEntry(paths, "lxns.clientId", "x")).toEqual({ changed: true });
                expect(JSON.parse(readFileSync(paths.config, "utf8"))).toEqual({
                    lxns: { clientId: "x" },
                });
            }
        });

        it("refuses a file that is JSON but not an object, whatever it holds", () => {
            for (const content of ["null", "5", '"text"', "true"]) {
                const paths = makeHome();
                mkdirSync(paths.home, { recursive: true });
                writeFileSync(paths.config, content);

                const error = caught(() => setConfigEntry(paths, "metadata.maxAgeHours", 12));
                expect(error.code).toBe("USAGE");
                expect(error.message).toBe(
                    `config.json 的内容必须是 JSON 对象，没有改动；请先修好或删掉 ${paths.config}`
                );
                expect(readFileSync(paths.config, "utf8")).toBe(content);
            }
        });

        it("reports errors for malformed, non-object, and unreadable config.json without touching it", () => {
            // Not valid JSON
            const paths1 = makeHome();
            mkdirSync(paths1.home, { recursive: true });
            writeFileSync(paths1.config, "{ not json");
            const err1 = caught(() => setConfigEntry(paths1, "metadata.maxAgeHours", 12));
            expect(err1.code).toBe("USAGE");
            expect(err1.message).toBe(
                `config.json 不是合法的 JSON，没有改动；请先修好或删掉 ${paths1.config}`
            );
            expect(readFileSync(paths1.config, "utf8")).toBe("{ not json");

            // JSON but not an object
            const paths2 = makeHome();
            mkdirSync(paths2.home, { recursive: true });
            writeFileSync(paths2.config, "[]");
            const err2 = caught(() => setConfigEntry(paths2, "metadata.maxAgeHours", 12));
            expect(err2.code).toBe("USAGE");
            expect(err2.message).toBe(
                `config.json 的内容必须是 JSON 对象，没有改动；请先修好或删掉 ${paths2.config}`
            );
            expect(readFileSync(paths2.config, "utf8")).toBe("[]");

            // Cannot be read (directory)
            const paths3 = makeHome();
            mkdirSync(paths3.config, { recursive: true });
            const err3 = caught(() => setConfigEntry(paths3, "metadata.maxAgeHours", 12));
            expect(err3.code).toBe("USAGE");
            expect(err3.message).toBe(
                `无法读取 config.json（EISDIR），没有改动；请先修好或删掉 ${paths3.config}`
            );
            expect(statSync(paths3.config).isDirectory()).toBe(true);
        });
    });

    describe("unsetConfigEntry", () => {
        it("removes a group when it becomes empty and writes {} when nothing is left", () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(paths.config, '{\n  "metadata": {\n    "maxAgeHours": 12\n  }\n}\n');

            const result = unsetConfigEntry(paths, "metadata.maxAgeHours");
            expect(result).toEqual({ changed: true });
            expect(readFileSync(paths.config, "utf8")).toBe("{}\n");
        });

        it("keeps the group when other entries remain", () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(
                paths.config,
                '{\n  "metadata": {\n    "maxAgeHours": 12,\n    "timeoutMs": 8000\n  }\n}\n'
            );

            const result = unsetConfigEntry(paths, "metadata.maxAgeHours");
            expect(result).toEqual({ changed: true });

            const parsed = JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                string,
                unknown
            >;
            expect(parsed).toEqual({ metadata: { timeoutMs: 8000 } });
        });

        it("does not create a directory when the file is missing", () => {
            const paths = makeHome();
            expect(existsSync(paths.home)).toBe(false);

            const result = unsetConfigEntry(paths, "metadata.maxAgeHours");
            expect(result).toEqual({ changed: false });
            expect(existsSync(paths.home)).toBe(false);
        });

        it("removes a non-object group as a whole", () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(paths.config, '{\n  "lxns": 5\n}\n');

            const result = unsetConfigEntry(paths, "lxns.clientId");
            expect(result).toEqual({ changed: true });
            expect(readFileSync(paths.config, "utf8")).toBe("{}\n");
        });

        it("removes a group that is null or a list as a whole, and keeps the others", () => {
            for (const group of ["null", '["a"]']) {
                const paths = makeHome();
                mkdirSync(paths.home, { recursive: true });
                writeFileSync(paths.config, `{"lxns": ${group}, "scores": {"staleDays": 5}}`);

                expect(unsetConfigEntry(paths, "lxns.clientId")).toEqual({ changed: true });
                expect(JSON.parse(readFileSync(paths.config, "utf8"))).toEqual({
                    scores: { staleDays: 5 },
                });
            }
        });

        it("refuses a file that is JSON but not an object, whatever it holds", () => {
            for (const content of ["null", "5", '"text"', "true"]) {
                const paths = makeHome();
                mkdirSync(paths.home, { recursive: true });
                writeFileSync(paths.config, content);

                const error = caught(() => unsetConfigEntry(paths, "metadata.maxAgeHours"));
                expect(error.code).toBe("USAGE");
                expect(error.message).toBe(
                    `config.json 的内容必须是 JSON 对象，没有改动；请先修好或删掉 ${paths.config}`
                );
                expect(readFileSync(paths.config, "utf8")).toBe(content);
            }
        });

        it("leaves the file byte for byte when the key or group is missing", () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            const formatted = '{\n    "metadata": {\n        "maxAgeHours": 12\n    }\n}\n';
            writeFileSync(paths.config, formatted);

            // Missing key in existing group
            expect(unsetConfigEntry(paths, "metadata.timeoutMs")).toEqual({ changed: false });
            expect(readFileSync(paths.config, "utf8")).toBe(formatted);

            // Missing group
            expect(unsetConfigEntry(paths, "lxns.clientId")).toEqual({ changed: false });
            expect(readFileSync(paths.config, "utf8")).toBe(formatted);
        });

        it("reports errors for malformed, non-object, and unreadable config.json without touching it", () => {
            const paths1 = makeHome();
            mkdirSync(paths1.home, { recursive: true });
            writeFileSync(paths1.config, "{ not json");
            const err1 = caught(() => unsetConfigEntry(paths1, "metadata.maxAgeHours"));
            expect(err1.code).toBe("USAGE");
            expect(err1.message).toBe(
                `config.json 不是合法的 JSON，没有改动；请先修好或删掉 ${paths1.config}`
            );
            expect(readFileSync(paths1.config, "utf8")).toBe("{ not json");

            const paths2 = makeHome();
            mkdirSync(paths2.home, { recursive: true });
            writeFileSync(paths2.config, "[]");
            const err2 = caught(() => unsetConfigEntry(paths2, "metadata.maxAgeHours"));
            expect(err2.code).toBe("USAGE");
            expect(err2.message).toBe(
                `config.json 的内容必须是 JSON 对象，没有改动；请先修好或删掉 ${paths2.config}`
            );
            expect(readFileSync(paths2.config, "utf8")).toBe("[]");

            const paths3 = makeHome();
            mkdirSync(paths3.config, { recursive: true });
            const err3 = caught(() => unsetConfigEntry(paths3, "metadata.maxAgeHours"));
            expect(err3.code).toBe("USAGE");
            expect(err3.message).toBe(
                `无法读取 config.json（EISDIR），没有改动；请先修好或删掉 ${paths3.config}`
            );
            expect(statSync(paths3.config).isDirectory()).toBe(true);
        });
    });
});
