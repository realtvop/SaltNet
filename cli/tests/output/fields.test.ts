import { describe, expect, it } from "vitest";
import { CliError } from "../../src/errors";
import { getPath, isPlainObject, prepareFields, selectFields } from "../../src/output/fields";
import { int, list, nullable, num, object, str } from "../../src/output/schema";

const rowSchema = object({
    chartKey: str("谱面 key"),
    title: str("标题"),
    score: nullable(object({ achievements: num("达成率"), rank: str("评级") })),
    b50: nullable(object({ part: str("分组"), rank: int("名次") })),
    tags: list(str("标签"), "标签列表"),
});

function project(items: readonly unknown[], fields: readonly string[]): unknown[] {
    return selectFields(items, prepareFields([rowSchema], fields).paths);
}

function rows() {
    return [
        {
            chartKey: "834-4",
            title: "PANDORA PARADOXXX",
            score: { achievements: 100.1234, rank: "SSS" },
            b50: { part: "B35", rank: 2 },
            tags: ["a", "b"],
        },
        { chartKey: "131-3", title: "Link", score: null, b50: null, tags: [] },
    ];
}

function failure(run: () => unknown): CliError {
    try {
        run();
    } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        return error as CliError;
    }
    throw new Error("expected the call to throw");
}

describe("isPlainObject", () => {
    it("tells objects from everything else", () => {
        expect(isPlainObject({})).toBe(true);
        expect(isPlainObject([])).toBe(false);
        expect(isPlainObject(null)).toBe(false);
        expect(isPlainObject("x")).toBe(false);
        expect(isPlainObject(1)).toBe(false);
    });
});

describe("getPath", () => {
    const value = { a: { b: 1, c: null }, list: [1, 2], empty: undefined };

    it("reads nested keys", () => {
        expect(getPath(value, ["a", "b"])).toBe(1);
        expect(getPath(value, ["list"])).toEqual([1, 2]);
    });

    it("gives null for anything missing, including steps through null or a non-object", () => {
        expect(getPath(value, ["a", "c"])).toBeNull();
        expect(getPath(value, ["a", "c", "d"])).toBeNull();
        expect(getPath(value, ["nope"])).toBeNull();
        expect(getPath(value, ["list", "length"])).toBeNull();
        expect(getPath(value, ["empty"])).toBeNull();
        expect(getPath(null, ["a"])).toBeNull();
    });

    it("does not read inherited properties", () => {
        expect(getPath({}, ["constructor"])).toBeNull();
        expect(getPath({}, ["toString"])).toBeNull();
    });
});

describe("selectFields", () => {
    it("keeps only the requested fields, in the order they were asked for", () => {
        const selected = project(rows(), ["title", "chartKey"]);
        expect(selected).toEqual([
            { title: "PANDORA PARADOXXX", chartKey: "834-4" },
            { title: "Link", chartKey: "131-3" },
        ]);
        expect(Object.keys(selected[0] as object)).toEqual(["title", "chartKey"]);
    });

    it("keeps the nesting of a dotted name", () => {
        expect(project(rows(), ["chartKey", "score.rank"])).toEqual([
            { chartKey: "834-4", score: { rank: "SSS" } },
            { chartKey: "131-3", score: { rank: null } },
        ]);
    });

    it("merges several names below the same object", () => {
        const selected = project(rows(), ["score.rank", "score.achievements"]);
        expect(selected[0]).toEqual({ score: { rank: "SSS", achievements: 100.1234 } });
        expect(Object.keys((selected[0] as { score: object }).score)).toEqual([
            "rank",
            "achievements",
        ]);
    });

    it("takes a whole object when only its name is given", () => {
        expect(project(rows(), ["score", "tags"])).toEqual([
            { score: { achievements: 100.1234, rank: "SSS" }, tags: ["a", "b"] },
            { score: null, tags: [] },
        ]);
    });

    it("lets a whole object win over names inside it, and ignores repeats", () => {
        const wanted = { score: { achievements: 100.1234, rank: "SSS" } };
        expect(project(rows(), ["score.rank", "score", "score"])[0]).toEqual(wanted);
        expect(project(rows(), ["score", "score.rank"])[0]).toEqual(wanted);
    });

    it("accepts a nested name when every item has null for the object", () => {
        expect(project([{ score: null }, { score: null }], ["score.rank"])).toEqual([
            { score: { rank: null } },
            { score: { rank: null } },
        ]);
    });

    it("leaves items that are not objects alone and does not touch the input", () => {
        const input = rows();
        const snapshot = JSON.stringify(input);
        expect(project([{ title: "A", b: 2 }, "x", null], ["title"])).toEqual([
            { title: "A" },
            "x",
            null,
        ]);
        project(input, ["title"]);
        expect(JSON.stringify(input)).toBe(snapshot);
    });

    it("projects an empty list with valid paths", () => {
        expect(project([], ["score.rank"])).toEqual([]);
    });

    it("rejects a name that no item has, offering the closest ones", () => {
        const error = failure(() => project(rows(), ["titel"]));
        expect(error.code).toBe("USAGE");
        expect(error.exitCode).toBe(2);
        expect(error.message).toBe("--fields 里有不存在的字段「titel」");
        expect(error.candidates?.[0]).toEqual({ ref: "title" });
    });

    it("rejects a misspelled name inside an object and suggests the dotted path", () => {
        const error = failure(() => project(rows(), ["score.rnk"]));
        expect(error.message).toContain("「score.rnk」");
        expect(error.candidates).toContainEqual({ ref: "score.rank" });
    });

    it("rejects a step into something that is not an object", () => {
        expect(failure(() => project(rows(), ["title.length"])).code).toBe("USAGE");
        expect(failure(() => project(rows(), ["tags.0"])).code).toBe("USAGE");
    });

    it("rejects names that are written wrongly, even when a shorter one covers them", () => {
        for (const bad of ["", ".title", "title.", "score..rank", "__proto__", "a.__proto__"]) {
            expect(failure(() => project(rows(), [bad])).code).toBe("USAGE");
        }
        expect(failure(() => project(rows(), ["score", "score..rank"])).code).toBe("USAGE");
    });

    it("does not echo a name that looks like it could be something else", () => {
        const error = failure(() => project(rows(), ["pa ss word"]));
        expect(error.message).toBe("--fields 里有不存在的字段");
    });
});
