import type { NamedKind } from "../../src/refs/named";
import { describe, expect, it } from "vitest";
import { MAX_AMBIGUOUS_ITEMS, MAX_NEAREST_ITEMS, resolveNamed } from "../../src/refs/named";
import { caught } from "../caught";

interface Thing {
    id: string;
    name: string;
}

const defaultKind: NamedKind<Thing> = {
    noun: "东西",
    names: t => [t.id, t.name],
    candidate: t => ({ ref: t.id, title: t.name }),
};

describe("resolveNamed", () => {
    it("exports MAX_AMBIGUOUS_ITEMS as 10 and MAX_NEAREST_ITEMS as 5", () => {
        expect(MAX_AMBIGUOUS_ITEMS).toBe(10);
        expect(MAX_NEAREST_ITEMS).toBe(5);
    });

    it("matches whole names by id and name, case-insensitively, full-width, and with surrounding spaces", () => {
        const items: Thing[] = [
            { id: "alpha-id", name: "Alpha" },
            { id: "beta-id", name: "Beta" },
        ];
        expect(resolveNamed(items, "Alpha", defaultKind)).toEqual(items[0]);
        expect(resolveNamed(items, "alpha", defaultKind)).toEqual(items[0]);
        expect(resolveNamed(items, "ALPHA", defaultKind)).toEqual(items[0]);
        expect(resolveNamed(items, "alpha-id", defaultKind)).toEqual(items[0]);
        expect(resolveNamed(items, "ALPHA-ID", defaultKind)).toEqual(items[0]);
        expect(resolveNamed(items, "ａｌｐｈａ", defaultKind)).toEqual(items[0]);
        expect(resolveNamed(items, "  Alpha  ", defaultKind)).toEqual(items[0]);
        expect(resolveNamed(items, " beta-id ", defaultKind)).toEqual(items[1]);
    });

    it("prefers a whole name match over longer names that contain it", () => {
        const items: Thing[] = [
            { id: "10", name: "十段" },
            { id: "110", name: "真十段" },
        ];
        expect(resolveNamed(items, "十段", defaultKind)).toEqual(items[0]);
        expect(resolveNamed(items, "真十段", defaultKind)).toEqual(items[1]);
    });

    it("finds the one item that has a matching part of a name", () => {
        const items: Thing[] = [
            { id: "a", name: "Alpha" },
            { id: "b", name: "Beta" },
        ];
        expect(resolveNamed(items, "lph", defaultKind)).toEqual(items[0]);
        expect(resolveNamed(items, "ET", defaultKind)).toEqual(items[1]);
    });

    it("fails with AMBIGUOUS_REF when whole name matches multiple items", () => {
        const items: Thing[] = [
            { id: "x", name: "Same" },
            { id: "y", name: "Same" },
        ];
        const error = caught(() => resolveNamed(items, "Same", defaultKind));
        expect(error.code).toBe("AMBIGUOUS_REF");
        expect(error.exitCode).toBe(3);
        expect(error.message).toBe("「Same」对应 2 个东西；请写得更完整一些，或者用候选里的 ref");
        expect(error.candidates).toEqual([
            { ref: "x", title: "Same" },
            { ref: "y", title: "Same" },
        ]);
    });

    it("fails with AMBIGUOUS_REF when part matches multiple items in item order", () => {
        const items: Thing[] = [
            { id: "a1", name: "Alpha" },
            { id: "a2", name: "Alpine" },
            { id: "b", name: "Beta" },
        ];
        const error = caught(() => resolveNamed(items, "alp", defaultKind));
        expect(error.code).toBe("AMBIGUOUS_REF");
        expect(error.candidates).toEqual([
            { ref: "a1", title: "Alpha" },
            { ref: "a2", title: "Alpine" },
        ]);
    });

    it("truncates candidates when ambiguous hits exceed 10", () => {
        const twelveItems: Thing[] = Array.from({ length: 12 }, (_, i) => ({
            id: `d${i + 1}`,
            name: "Dup",
        }));
        const error12 = caught(() => resolveNamed(twelveItems, "Dup", defaultKind));
        expect(error12.code).toBe("AMBIGUOUS_REF");
        expect(error12.message).toBe(
            "「Dup」对应 12 个东西，只列出前 10 个；请写得更完整一些，或者用候选里的 ref"
        );
        expect(error12.candidates).toHaveLength(10);
        expect(error12.candidates?.map(c => c.ref)).toEqual(
            Array.from({ length: 10 }, (_, i) => `d${i + 1}`)
        );

        const tenItems: Thing[] = Array.from({ length: 10 }, (_, i) => ({
            id: `d${i + 1}`,
            name: "Dup",
        }));
        const error10 = caught(() => resolveNamed(tenItems, "Dup", defaultKind));
        expect(error10.code).toBe("AMBIGUOUS_REF");
        expect(error10.message).toBe("「Dup」对应 10 个东西；请写得更完整一些，或者用候选里的 ref");
        expect(error10.candidates).toHaveLength(10);
    });

    it("formats message with 这个写法 when text is not echoed", () => {
        const longText = "x".repeat(41);
        const twoLong: Thing[] = [
            { id: "x1", name: longText },
            { id: "x2", name: longText },
        ];
        const errLongAmbiguous = caught(() => resolveNamed(twoLong, longText, defaultKind));
        expect(errLongAmbiguous.message).toBe(
            "这个写法对应 2 个东西；请写得更完整一些，或者用候选里的 ref"
        );

        const spaceText = "a b";
        const twoSpace: Thing[] = [
            { id: "s1", name: spaceText },
            { id: "s2", name: spaceText },
        ];
        const errSpaceAmbiguous = caught(() => resolveNamed(twoSpace, spaceText, defaultKind));
        expect(errSpaceAmbiguous.message).toBe(
            "这个写法对应 2 个东西；请写得更完整一些，或者用候选里的 ref"
        );

        const notFoundLong = caught(() => resolveNamed(twoLong, "y".repeat(41), defaultKind));
        expect(notFoundLong.message).toBe("找不到这个写法对应的东西");

        const notFoundSpace = caught(() => resolveNamed(twoSpace, "a c!", defaultKind));
        expect(notFoundSpace.message).toBe("找不到这个写法对应的东西");
    });

    it("respects partialNames: false and custom partialNames functions", () => {
        const items: Thing[] = [{ id: "a", name: "Alpha" }];
        const noPartialKind: NamedKind<Thing> = {
            ...defaultKind,
            partialNames: false,
        };
        const errNoPartial = caught(() => resolveNamed(items, "lph", noPartialKind));
        expect(errNoPartial.code).toBe("NOT_FOUND");
        expect(resolveNamed(items, "Alpha", noPartialKind)).toEqual(items[0]);

        const customPartialItems: Thing[] = [
            { id: "gate-77", name: "Alpha" },
            { id: "x", name: "Beta" },
        ];
        const customPartialKind: NamedKind<Thing> = {
            ...defaultKind,
            partialNames: t => [t.name],
        };
        const errCustom = caught(() => resolveNamed(customPartialItems, "77", customPartialKind));
        expect(errCustom.code).toBe("NOT_FOUND");
        expect(resolveNamed(customPartialItems, "gate-77", customPartialKind)).toEqual(
            customPartialItems[0]
        );

        // With default kind, part of id (77) finds the first
        expect(resolveNamed(customPartialItems, "77", defaultKind)).toEqual(customPartialItems[0]);
    });

    it("returns NOT_FOUND with hint and empty candidates when nothing is near", () => {
        const items: Thing[] = [
            { id: "alpha-1", name: "AlphaLong" },
            { id: "beta-1", name: "BetaLong" },
        ];
        const errNotFound = caught(() => resolveNamed(items, "zzzzzzzz", defaultKind));
        expect(errNotFound.code).toBe("NOT_FOUND");
        expect(errNotFound.exitCode).toBe(3);
        expect(errNotFound.message).toBe("找不到东西「zzzzzzzz」");
        expect(errNotFound.candidates).toEqual([]);

        const kindWithHint: NamedKind<Thing> = {
            ...defaultKind,
            hint: "写成 X",
        };
        const errHint = caught(() => resolveNamed(items, "zzzzzzzz", kindWithHint));
        expect(errHint.message).toBe("找不到东西「zzzzzzzz」；写成 X");

        const errEmpty = caught(() => resolveNamed(items, "", defaultKind));
        expect(errEmpty.code).toBe("NOT_FOUND");
        expect(errEmpty.message).toBe("找不到这个写法对应的东西");
    });

    it("returns nearest candidates up to 5 and uses fallback when nothing is near", () => {
        const items: Thing[] = [
            { id: "n1", name: "Alpha" },
            { id: "n2", name: "Alphb" },
            { id: "n3", name: "Alphc" },
            { id: "n4", name: "Alphd" },
            { id: "n5", name: "Alphe" },
            { id: "n6", name: "Alphf" },
            { id: "n7", name: "Alphg" },
        ];
        const errNearest = caught(() => resolveNamed(items, "Alphx", defaultKind));
        expect(errNearest.code).toBe("NOT_FOUND");
        expect(errNearest.candidates).toEqual([
            { ref: "n1", title: "Alpha" },
            { ref: "n2", title: "Alphb" },
            { ref: "n3", title: "Alphc" },
            { ref: "n4", title: "Alphd" },
            { ref: "n5", title: "Alphe" },
        ]);

        const fallbackItems: Thing[] = Array.from({ length: 12 }, (_, i) => ({
            id: `i${i + 1}`,
            name: `Item${String(i + 1).padStart(2, "0")}`,
        }));
        const kindWithFallback: NamedKind<Thing> = {
            ...defaultKind,
            fallback: fallbackItems,
        };

        const errFallback = caught(() => resolveNamed(items, "qqqqqqqq", kindWithFallback));
        expect(errFallback.code).toBe("NOT_FOUND");
        expect(errFallback.candidates).toHaveLength(10);
        expect(errFallback.candidates).toEqual(
            fallbackItems.slice(0, 10).map(t => ({ ref: t.id, title: t.name }))
        );

        // When something is near, fallback is not used
        const errNearWithFallback = caught(() => resolveNamed(items, "Alphx", kindWithFallback));
        expect(errNearWithFallback.candidates).toEqual([
            { ref: "n1", title: "Alpha" },
            { ref: "n2", title: "Alphb" },
            { ref: "n3", title: "Alphc" },
            { ref: "n4", title: "Alphd" },
            { ref: "n5", title: "Alphe" },
        ]);
    });
});
