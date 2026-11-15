import type { OptionEntry, OptionSpec } from "../../src/commands/registry";
import { describe, expect, it } from "vitest";
import { createRegistry } from "../../src/commands";
import {
    commandErrorCodes,
    commandUsage,
    describeError,
    describeOption,
    describePositional,
} from "../../src/commands/describe";
import { commandOptionEntries, flagOf } from "../../src/commands/registry";

function entry(key: string, spec: OptionSpec): OptionEntry {
    return { key, flag: flagOf(key), spec };
}

describe("describeOption", () => {
    it("describes every option kind with nulls for fields that do not apply", () => {
        const cases: readonly [OptionSpec, unknown][] = [
            [
                { kind: "string", description: "文字", valueName: "名字", required: true },
                {
                    flag: "--test-option",
                    type: "string",
                    description: "文字",
                    valueName: "名字",
                    required: true,
                    default: null,
                    values: null,
                    item: null,
                    min: null,
                    max: null,
                },
            ],
            [
                { kind: "credential", description: "秘密" },
                {
                    flag: "--test-option",
                    type: "credential",
                    description: "秘密",
                    valueName: null,
                    required: false,
                    default: null,
                    values: null,
                    item: null,
                    min: null,
                    max: null,
                },
            ],
            [
                { kind: "integer", description: "整数", min: 1, max: 9, default: 3 },
                {
                    flag: "--test-option",
                    type: "integer",
                    description: "整数",
                    valueName: null,
                    required: false,
                    default: 3,
                    values: null,
                    item: null,
                    min: 1,
                    max: 9,
                },
            ],
            [
                { kind: "number", description: "数字", min: -1 },
                {
                    flag: "--test-option",
                    type: "number",
                    description: "数字",
                    valueName: null,
                    required: false,
                    default: null,
                    values: null,
                    item: null,
                    min: -1,
                    max: null,
                },
            ],
            [
                { kind: "boolean", description: "开关" },
                {
                    flag: "--test-option",
                    type: "boolean",
                    description: "开关",
                    valueName: null,
                    required: false,
                    default: false,
                    values: null,
                    item: null,
                    min: null,
                    max: null,
                },
            ],
            [
                {
                    kind: "enum",
                    description: "枚举",
                    values: ["a", { value: "b", aliases: ["bee"], description: "第二项" }],
                    default: "a",
                },
                {
                    flag: "--test-option",
                    type: "enum",
                    description: "枚举",
                    valueName: null,
                    required: false,
                    default: "a",
                    values: [
                        { value: "a", aliases: [], description: null },
                        { value: "b", aliases: ["bee"], description: "第二项" },
                    ],
                    item: null,
                    min: null,
                    max: null,
                },
            ],
            [
                {
                    kind: "list",
                    description: "列表",
                    item: { kind: "enum", values: [{ value: "x", aliases: ["ex"] }] },
                    default: ["x"],
                },
                {
                    flag: "--test-option",
                    type: "list",
                    description: "列表",
                    valueName: null,
                    required: false,
                    default: ["x"],
                    values: null,
                    item: {
                        type: "enum",
                        values: [{ value: "x", aliases: ["ex"], description: null }],
                    },
                    min: null,
                    max: null,
                },
            ],
            [
                { kind: "range", description: "区间", item: "number" },
                {
                    flag: "--test-option",
                    type: "range",
                    description: "区间",
                    valueName: null,
                    required: false,
                    default: null,
                    values: null,
                    item: { type: "number", values: null },
                    min: null,
                    max: null,
                },
            ],
        ];

        for (const [spec, expected] of cases) {
            expect(describeOption(entry("testOption", spec))).toEqual(expected);
        }
    });

    it("describes the selected real charts options literally", () => {
        const charts = createRegistry().find("charts")!;
        const byFlag = new Map(
            commandOptionEntries(charts).map(option => [option.flag, describeOption(option)])
        );
        expect(byFlag.get("level")).toEqual({
            flag: "--level",
            type: "range",
            description: "等级或区间，例如 13+、13..14、14..、..12+",
            valueName: "等级",
            required: false,
            default: null,
            values: null,
            item: { type: "string", values: null },
            min: null,
            max: null,
        });
        expect(byFlag.get("sort")?.default).toBe("default");
        expect(byFlag.get("asc")?.default).toBe(false);
        expect(byFlag.get("limit")).toMatchObject({
            type: "integer",
            default: 50,
            min: 1,
            max: 10000,
        });
        expect(byFlag.get("offset")).toMatchObject({
            type: "integer",
            default: 0,
            min: 0,
            max: null,
        });
        expect(byFlag.get("fields")).toMatchObject({
            type: "list",
            default: null,
            item: { type: "string", values: null },
        });
    });
});

describe("describing commands", () => {
    const registry = createRegistry();

    it("describes a positional", () => {
        expect(
            describePositional({
                name: "query",
                valueName: "查询",
                description: "一条查询",
                variadic: true,
            })
        ).toEqual({
            name: "query",
            valueName: "查询",
            description: "一条查询",
            required: true,
            variadic: true,
        });
    });

    it("generates the same usage forms help uses", () => {
        expect(commandUsage(registry.find("charts")!)).toBe("saltnet charts [选项]");
        expect(commandUsage(registry.find("sql")!)).toBe("saltnet sql <查询...> [选项]");
        expect(commandUsage(registry.find("status")!)).toBe("saltnet status");
    });

    it("adds universal errors, removes duplicates, and follows ERROR_CODES order", () => {
        expect(
            commandErrorCodes({
                name: "x",
                summary: "x",
                category: "data",
                effect: "none",
                output: "object",
                errors: ["DB_LOCKED", "USAGE", "NETWORK", "NETWORK"],
            })
        ).toEqual(["INTERNAL", "USAGE", "NETWORK", "DB_LOCKED"]);
    });

    it("describes an error", () => {
        expect(describeError("NETWORK")).toEqual({
            code: "NETWORK",
            exitCode: 5,
            retryable: true,
            description: "连不上网，或者请求超时；可以稍后重试",
        });
    });
});
