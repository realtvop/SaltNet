import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readCredentials } from "../../src/runtime/credentials";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

describe("readCredentials", () => {
    it("returns empty credentials when no file exists", () => {
        const paths = makeHome();
        expect(readCredentials(paths)).toEqual({ version: 1, users: {} });
    });

    it.each(['{"version":2,"users":{}}', '{"users":{}}'])(
        "rejects version other than 1 (%s) without modifying the file",
        content => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(paths.credentials, content, "utf8");
            let caught: Error | undefined;
            try {
                readCredentials(paths);
            } catch (error) {
                caught = error as Error;
            }
            expect(caught).toBeInstanceOf(Error);
            expect(caught?.message).toContain(paths.credentials);
            expect(caught?.message).not.toContain(content);
            expect(readFileSync(paths.credentials, "utf8")).toBe(content);
        }
    );

    it.each([
        JSON.stringify({ version: 1, users: { "made-up-uid": "fake-token-as-string" } }),
        JSON.stringify({ version: 1, users: { "made-up-uid": null } }),
        JSON.stringify({ version: 1, users: { "made-up-uid": [] } }),
    ])("rejects non-object user entries (%s) without leaking secrets", content => {
        const paths = makeHome();
        mkdirSync(paths.home, { recursive: true });
        writeFileSync(paths.credentials, content, "utf8");
        let caught: Error | undefined;
        try {
            readCredentials(paths);
        } catch (error) {
            caught = error as Error;
        }
        expect(caught).toBeInstanceOf(Error);
        expect(caught?.message).not.toContain("fake-token-as-string");
    });

    it("returns valid credentials when file has one valid entry", () => {
        const paths = makeHome();
        mkdirSync(paths.home, { recursive: true });
        const valid = {
            version: 1 as const,
            users: {
                "made-up-uid": {
                    divingFishImportToken: "fake-import-token-unit",
                },
            },
        };
        writeFileSync(paths.credentials, JSON.stringify(valid), "utf8");
        expect(readCredentials(paths)).toEqual(valid);
    });
});
