import type { ConfigDefinition } from "../../src/runtime/config";
import { describe, expect, it } from "vitest";
import { resolveSetting } from "../../src/refs/setting";
import { CONFIG_DEFINITIONS } from "../../src/runtime/config";
import { caught } from "../caught";

describe("resolveSetting", () => {
    it("resolves each of the 17 keys to its own definition", () => {
        expect(CONFIG_DEFINITIONS).toHaveLength(17);
        for (const definition of CONFIG_DEFINITIONS) {
            const resolved = resolveSetting(definition.key);
            expect(resolved.key).toBe(definition.key);
            expect(resolved).toBe(definition);
        }
    });

    it("resolves case-insensitively and handles full-width characters", () => {
        const resolvedUpper = resolveSetting("METADATA.MAXAGEHOURS");
        expect(resolvedUpper.key).toBe("metadata.maxAgeHours");

        const resolvedFull = resolveSetting("ＭＥＴＡＤＡＴＡ.maxAgeHours");
        expect(resolvedFull.key).toBe("metadata.maxAgeHours");

        const resolvedClient = resolveSetting("lxns.clientid");
        expect(resolvedClient.key).toBe("lxns.clientId");
    });

    it("trims leading and trailing whitespace", () => {
        const resolved = resolveSetting("  metadata.maxAgeHours  ");
        expect(resolved.key).toBe("metadata.maxAgeHours");
    });

    it("throws NOT_FOUND for partial names and nonexistent keys", () => {
        // Neither a part of the dotted name nor its last segment alone is a setting.
        const partials = ["maxAge", "metadata", "url", "maxAgeHours", "clientId"];
        for (const text of partials) {
            const err = caught(() => resolveSetting(text));
            expect(err.code).toBe("NOT_FOUND");
            expect(err.message).toBe(`找不到设置「${text}」；config list 列出全部设置`);
        }

        const errNosuch = caught(() => resolveSetting("nosuch"));
        expect(errNosuch.code).toBe("NOT_FOUND");
        expect(errNosuch.message).toBe("找不到设置「nosuch」；config list 列出全部设置");

        const errEmpty = caught(() => resolveSetting(""));
        expect(errEmpty.code).toBe("NOT_FOUND");
        expect(errEmpty.message).toBe("找不到这个写法对应的设置；config list 列出全部设置");
    });

    it("returns nearest candidates for close typos", () => {
        const err = caught(() => resolveSetting("metadata.maxAgeHour"));
        expect(err.code).toBe("NOT_FOUND");
        const maxAgeDef = CONFIG_DEFINITIONS.find(d => d.key === "metadata.maxAgeHours")!;
        expect(err.candidates).toEqual([
            {
                ref: "metadata.maxAgeHours",
                title: maxAgeDef.description,
            },
        ]);
    });

    it("returns the first 10 keys of the table when nothing is near", () => {
        const err = caught(() => resolveSetting("nosuch"));
        expect(err.code).toBe("NOT_FOUND");
        expect(err.candidates).toEqual(
            CONFIG_DEFINITIONS.slice(0, 10).map(d => ({
                ref: d.key,
                title: d.description,
            }))
        );
    });

    it("throws AMBIGUOUS_REF when multiple definitions share the same key", () => {
        const duplicateDefs: ConfigDefinition[] = [
            {
                ...CONFIG_DEFINITIONS[0],
                key: "x.y" as unknown as (typeof CONFIG_DEFINITIONS)[0]["key"],
            },
            {
                ...CONFIG_DEFINITIONS[0],
                key: "x.y" as unknown as (typeof CONFIG_DEFINITIONS)[0]["key"],
            },
        ];
        const err = caught(() => resolveSetting("x.y", duplicateDefs));
        expect(err.code).toBe("AMBIGUOUS_REF");
    });
});
