import { describe, expect, it } from "vitest";
import {
    alwaysNull,
    anyOf,
    anything,
    bool,
    dictionary,
    extend,
    int,
    list,
    literal,
    nullable,
    num,
    object,
    str,
    strEnum,
    strEnumOf,
} from "../../src/output/schema";
import { expectConforms, schemaErrors } from "../dataSchema";

describe("schema builders", () => {
    it("str", () => {
        expect(str("文本描述")).toEqual({ type: "string", description: "文本描述" });
    });

    it("int", () => {
        expect(int("整数描述")).toEqual({ type: "integer", description: "整数描述" });
    });

    it("num", () => {
        expect(num("数字描述")).toEqual({ type: "number", description: "数字描述" });
    });

    it("bool", () => {
        expect(bool("布尔描述")).toEqual({ type: "boolean", description: "布尔描述" });
    });

    it("strEnum copies values", () => {
        const values = ["a", "b", "c"] as const;
        const schema = strEnum(values, "枚举描述");
        expect(schema).toEqual({
            type: "string",
            enum: ["a", "b", "c"],
            description: "枚举描述",
        });
        expect(schema.enum).not.toBe(values);
    });

    describe("strEnumOf", () => {
        it("takes the keys as the values and explains each one in the description", () => {
            const schema = strEnumOf<"a" | "b" | "c">(
                { a: "第一个", b: "", c: "第三个" },
                "枚举描述"
            );
            expect(schema).toEqual({
                type: "string",
                enum: ["a", "b", "c"],
                description: "枚举描述：a 第一个；b；c 第三个",
            });
        });

        it("makes TypeScript insist on every member of the union and on nothing else", () => {
            // @ts-expect-error `b` is a member of the union and is not listed
            strEnumOf<"a" | "b">({ a: "" }, "少了一个");
            // @ts-expect-error `c` is not a member of the union
            strEnumOf<"a" | "b">({ a: "", b: "", c: "" }, "多了一个");
        });

        it("accepts the values and only the values", () => {
            const schema = strEnumOf<"x" | "y">({ x: "", y: "" }, "枚举");
            expectConforms(schema, "x");
            expect(schemaErrors(schema, "z").length).toBeGreaterThan(0);
            expect(schemaErrors(schema, 1).length).toBeGreaterThan(0);
        });

        it("can be made nullable", () => {
            const schema = nullable(strEnumOf<"x">({ x: "" }, "枚举"));
            expectConforms(schema, "x");
            expectConforms(schema, null);
            expect(schemaErrors(schema, "y").length).toBeGreaterThan(0);
        });
    });

    describe("literal", () => {
        it("is const with a description", () => {
            expect(literal(true, "对")).toEqual({ const: true, description: "对" });
            expect(literal("saltmeta", "曲库")).toEqual({ const: "saltmeta", description: "曲库" });
            expect(literal(3, "三")).toEqual({ const: 3, description: "三" });
        });

        it("accepts that value and no other", () => {
            const schema = literal("ok", "固定值");
            expectConforms(schema, "ok");
            expect(schemaErrors(schema, "OK").length).toBeGreaterThan(0);
            expect(schemaErrors(schema, null).length).toBeGreaterThan(0);
            expect(schemaErrors(literal(true, "真"), false).length).toBeGreaterThan(0);
            expect(schemaErrors(literal(1, "一"), "1").length).toBeGreaterThan(0);
        });
    });

    it("alwaysNull", () => {
        expect(alwaysNull("空值描述")).toEqual({ type: "null", description: "空值描述" });
    });

    it("anything only has description", () => {
        expect(anything("任意值描述")).toEqual({ description: "任意值描述" });
    });

    it("list", () => {
        const item = str("项");
        expect(list(item, "列表描述")).toEqual({
            type: "array",
            description: "列表描述",
            items: item,
        });
    });

    it("dictionary", () => {
        const val = int("值");
        expect(dictionary(val, "字典描述")).toEqual({
            type: "object",
            description: "字典描述",
            additionalProperties: val,
        });
    });

    describe("anyOf", () => {
        it("creates an anyOf schema", () => {
            const a = str("文本");
            const b = int("整数");
            expect(anyOf("联合描述", a, b)).toEqual({
                description: "联合描述",
                anyOf: [a, b],
            });
        });

        it("throws with fewer than two alternatives", () => {
            expect(() => anyOf("少于两个", str("只有一个"))).toThrow("anyOf 至少要有两种写法");
            expect(() => anyOf("没有")).toThrow("anyOf 至少要有两种写法");
        });
    });

    describe("nullable", () => {
        it("turns a plain type into [type, 'null']", () => {
            const base = str("文本");
            const res = nullable(base);
            expect(res).toEqual({
                type: ["string", "null"],
                description: "文本",
            });
        });

        it("appends null to an enum", () => {
            const base = strEnum(["x", "y"], "枚举");
            const res = nullable(base);
            expect(res).toEqual({
                type: ["string", "null"],
                enum: ["x", "y", null],
                description: "枚举",
            });
        });

        it("adds { type: 'null' } alternative to anyOf", () => {
            const base = anyOf("联合", str("文本"), int("整数"));
            const res = nullable(base);
            expect(res).toEqual({
                description: "联合",
                anyOf: [str("文本"), int("整数"), { type: "null" }],
            });
        });

        it("extends an existing array type", () => {
            const base = { type: ["string", "number"], description: "多类型" };
            const res = nullable(base);
            expect(res).toEqual({
                type: ["string", "number", "null"],
                description: "多类型",
            });
        });

        it("replaces description when provided", () => {
            const base = str("原描述");
            const res = nullable(base, "新描述");
            expect(res).toEqual({
                type: ["string", "null"],
                description: "新描述",
            });
        });

        it("does not mutate its argument", () => {
            const base = str("原对象");
            const clone = { ...base };
            nullable(base);
            expect(base).toEqual(clone);
        });

        it("throws on a schema without type and anyOf", () => {
            expect(() => nullable(anything("没有 type"))).toThrow(TypeError);
        });

        it("validates conformity with schemaErrors / expectConforms", () => {
            const schema = nullable(int("可空整数"));
            expectConforms(schema, 42);
            expectConforms(schema, null);
            expect(schemaErrors(schema, "wrong").length).toBeGreaterThan(0);
        });
    });

    describe("object", () => {
        it("sets required to every key except optional", () => {
            const schema = object(
                { a: str("a"), b: int("b"), c: bool("c") },
                { description: "对象", optional: ["b"] }
            );
            expect(schema).toEqual({
                type: "object",
                description: "对象",
                properties: { a: str("a"), b: int("b"), c: bool("c") },
                required: ["a", "c"],
                additionalProperties: false,
            });
        });

        it("omits required when all keys are optional", () => {
            const schema = object({ a: str("a") }, { optional: ["a"] });
            expect(schema).toEqual({
                type: "object",
                properties: { a: str("a") },
                additionalProperties: false,
            });
            expect(schema.required).toBeUndefined();
        });

        it("omits description when not given", () => {
            const schema = object({ a: str("a") });
            expect(schema.description).toBeUndefined();
        });

        it("preserves property key order", () => {
            const schema = object({ z: str("z"), m: str("m"), a: str("a") });
            expect(Object.keys(schema.properties as object)).toEqual(["z", "m", "a"]);
        });

        it("validates conformity with schemaErrors / expectConforms", () => {
            const schema = object(
                { req: str("必填"), opt: str("选填") },
                { description: "测试对象", optional: ["opt"] }
            );
            // Valid with optional present
            expectConforms(schema, { req: "hello", opt: "world" });
            // Valid with optional omitted
            expectConforms(schema, { req: "hello" });
            // Missing required key rejected
            expect(schemaErrors(schema, { opt: "world" }).length).toBeGreaterThan(0);
            // Extra key rejected
            expect(schemaErrors(schema, { req: "hello", extra: 1 }).length).toBeGreaterThan(0);
        });
    });

    describe("extend", () => {
        const base = object(
            { id: int("id"), name: str("名字") },
            { description: "基础对象", optional: ["name"] }
        );

        it("keeps base properties and required keys, adds new ones and honours optional", () => {
            const extended = extend<{ readonly extra: string; readonly optExtra?: boolean }>(
                base,
                { extra: str("额外"), optExtra: bool("可选额外") },
                { optional: ["optExtra"] }
            );
            expect(extended).toEqual({
                type: "object",
                description: "基础对象",
                properties: {
                    id: int("id"),
                    name: str("名字"),
                    extra: str("额外"),
                    optExtra: bool("可选额外"),
                },
                required: ["id", "extra"],
                additionalProperties: false,
            });
        });

        it("keeps base description unless new one is given", () => {
            const kept = extend(base, { x: int("x") });
            expect(kept.description).toBe("基础对象");

            const replaced = extend(base, { x: int("x") }, { description: "新对象描述" });
            expect(replaced.description).toBe("新对象描述");
        });

        it("throws on duplicate keys", () => {
            expect(() => extend(base, { id: int("重复 id") })).toThrow(
                "extend 不能重复写已有的字段：id"
            );
        });

        it("throws on base that is not an object schema", () => {
            expect(() => extend(str("不是对象"), { a: str("a") })).toThrow(TypeError);
        });

        it("asks TypeScript for exactly the keys the result adds to the base", () => {
            interface Whole {
                readonly id: number;
                readonly extra: string;
            }
            // `id` is the base's; only `extra` is described here.
            extend<Whole, { readonly id: number }>(base, { extra: str("额外") });
            // @ts-expect-error `extra` is a key of the result that is not described
            extend<Whole, { readonly id: number }>(base, {});
            extend<Whole, { readonly id: number }>(base, {
                extra: str("额外"),
                // @ts-expect-error `other` is not a key of the result
                other: str("别的"),
            });
        });

        it("does not mutate the base schema", () => {
            const clone = JSON.parse(JSON.stringify(base));
            extend(base, { newProp: str("新字段") });
            expect(base).toEqual(clone);
        });
    });
});
