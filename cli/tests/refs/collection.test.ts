import type { CollectionEntry } from "../../src/refs/collection";
import { mapLXNSCollections } from "@core/collection/map";
import { characters, partners } from "@core/collection/static";
import { CollectionKind } from "@core/collection/type";
import { getFixtureLXNSCollections } from "@core/fixtures/lxns";
import { describe, expect, it } from "vitest";
import {
    COLLECTION_KINDS,
    collectionRef,
    listCollections,
    resolveCollection,
} from "../../src/refs/collection";
import { caught } from "../caught";

describe("collections resolver", () => {
    const collections = mapLXNSCollections(getFixtureLXNSCollections());
    const entries = listCollections(collections);

    it("defines COLLECTION_KINDS in fixed order", () => {
        expect(COLLECTION_KINDS).toEqual([
            "plate",
            "title",
            "icon",
            "frame",
            "character",
            "partner",
        ]);
    });

    it("listCollections lists entries kind by kind with expected counts and ids", () => {
        const counts = COLLECTION_KINDS.map(
            kind => entries.filter(entry => entry.kind === kind).length
        );
        expect(counts).toEqual([12, 9, 3, 3, characters.length, partners.length]);

        let lastKindIndex = 0;
        for (const entry of entries) {
            const kindIndex = COLLECTION_KINDS.indexOf(entry.kind);
            expect(kindIndex).toBeGreaterThanOrEqual(lastKindIndex);
            lastKindIndex = kindIndex;
        }

        const idsOf = (kind: string) =>
            entries.filter(e => e.kind === kind).map(e => e.collection.id);

        expect(idsOf("plate")).toEqual([
            1, 2, 6101, 6102, 6103, 6104, 6105, 6106, 6107, 6148, 409506, 101,
        ]);
        expect(idsOf("title")).toEqual([1, 2, 5101, 5102, 5502, 5501, 158511, 458582, 20]);
        expect(idsOf("icon")).toEqual([1, 2, 209502]);
        expect(idsOf("frame")).toEqual([1, 2, 109101]);

        const firstChar = entries.find(e => e.kind === "character");
        expect(firstChar?.collection.type).toBe(CollectionKind.Character);
        expect(firstChar?.collection.description).toBe("");
        expect(firstChar?.collection.id).toBe(characters[0].id);
        expect(firstChar?.collection.name).toBe(characters[0].name);
        expect(firstChar?.collection.genre).toBe(characters[0].genre);

        const firstPartner = entries.find(e => e.kind === "partner");
        expect(firstPartner?.collection).toEqual(partners[0]);
    });

    it("formats collectionRef as kind:id", () => {
        const plate6101 = entries.find(e => e.kind === "plate" && e.collection.id === 6101)!;
        expect(collectionRef(plate6101)).toBe("plate:6101");

        const title5102 = entries.find(e => e.kind === "title" && e.collection.id === 5102)!;
        expect(collectionRef(title5102)).toBe("title:5102");

        const char0 = entries.find(
            e => e.kind === "character" && e.collection.id === characters[0].id
        )!;
        expect(collectionRef(char0)).toBe(`character:${characters[0].id}`);
    });

    it("resolves kind:id references directly", () => {
        const titleRes = resolveCollection(entries, "title:5102");
        expect(titleRes.kind).toBe("title");
        expect(titleRes.collection.id).toBe(5102);
        expect(titleRes.collection.name).toBe("39");

        expect(resolveCollection(entries, "TITLE:5102")).toEqual(titleRes);
        expect(resolveCollection(entries, " title:5102 ")).toEqual(titleRes);

        const frameRes = resolveCollection(entries, "frame:109101");
        expect(frameRes.kind).toBe("frame");
        expect(frameRes.collection.id).toBe(109101);

        const charRes = resolveCollection(entries, `character:${characters[0].id}`);
        expect(charRes.kind).toBe("character");
        expect(charRes.collection.id).toBe(characters[0].id);

        const errPlate = caught(() => resolveCollection(entries, "plate:5102"));
        expect(errPlate.code).toBe("NOT_FOUND");
        expect(errPlate.message).toBe("没有这个收藏品「plate:5102」");
        expect(errPlate.candidates ?? []).toEqual([]);

        const errTitle = caught(() => resolveCollection(entries, "title:999999"));
        expect(errTitle.code).toBe("NOT_FOUND");
        expect(errTitle.message).toBe("没有这个收藏品「title:999999」");
        expect(errTitle.candidates ?? []).toEqual([]);
    });

    it("does not take a bare number for a collection; the type is part of the id", () => {
        for (const text of ["5102", "6101", "101"]) {
            expect(caught(() => resolveCollection(entries, text)).code).toBe("NOT_FOUND");
        }
    });

    it("reads leading zeros of an id as the number and echoes the id as it was written", () => {
        expect(resolveCollection(entries, "title:05102").collection.id).toBe(5102);

        const error = caught(() => resolveCollection(entries, "title:0999999"));
        expect(error.code).toBe("NOT_FOUND");
        expect(error.message).toBe("没有这个收藏品「title:0999999」");
    });

    it("treats non-collection prefixes as name searches with hint", () => {
        const error = caught(() => resolveCollection(entries, "song:5102"));
        expect(error.code).toBe("NOT_FOUND");
        expect(error.message).toBe(
            "找不到收藏品「song:5102」；写成 类型:id（类型有 plate、title、icon、frame、character、partner）或完整的名称"
        );
    });

    it("resolves whole names with case and NFKC normalization", () => {
        expect(resolveCollection(entries, "千本桜").collection.id).toBe(5101);
        expect(resolveCollection(entries, "覇者").collection.id).toBe(6148);
        expect(resolveCollection(entries, "PERFECT Jewel [Diamond]").collection.id).toBe(109101);
        expect(resolveCollection(entries, "universe しゃま&みるく").collection.id).toBe(209502);
    });

    it("rejects partial names with NOT_FOUND and suggests nearest full name", () => {
        const error = caught(() => resolveCollection(entries, "千本"));
        expect(error.code).toBe("NOT_FOUND");
        expect(error.candidates?.[0]).toEqual({
            ref: "title:5101",
            title: "千本桜",
        });
    });

    it("fails with AMBIGUOUS_REF for duplicate names across kinds", () => {
        const errDefault = caught(() => resolveCollection(entries, "デフォルト"));
        expect(errDefault.code).toBe("AMBIGUOUS_REF");
        expect(errDefault.message).toBe(
            "「デフォルト」对应 3 个收藏品；请写得更完整一些，或者用候选里的 ref"
        );
        expect(errDefault.candidates).toEqual([
            { ref: "plate:1", title: "デフォルト" },
            { ref: "icon:1", title: "デフォルト" },
            { ref: "frame:1", title: "デフォルト" },
        ]);

        const errRandom = caught(() => resolveCollection(entries, "从整体中随机选择"));
        expect(errRandom.code).toBe("AMBIGUOUS_REF");
        expect(errRandom.candidates).toEqual([
            { ref: "plate:2", title: "从整体中随机选择" },
            { ref: "title:2", title: "从整体中随机选择" },
            { ref: "icon:2", title: "从整体中随机选择" },
            { ref: "frame:2", title: "从整体中随机选择" },
        ]);
    });

    it("truncates ambiguous candidates when duplicates exceed 10", () => {
        const dupEntries: CollectionEntry[] = Array.from({ length: 12 }, (_, i) => ({
            kind: "title" as const,
            collection: {
                type: CollectionKind.Title,
                id: i + 1,
                name: "same",
                description: "",
            },
        }));

        const error = caught(() => resolveCollection(dupEntries, "same"));
        expect(error.code).toBe("AMBIGUOUS_REF");
        expect(error.message).toBe(
            "「same」对应 12 个收藏品，只列出前 10 个；请写得更完整一些，或者用候选里的 ref"
        );
        expect(error.candidates).toHaveLength(10);
        expect(error.candidates?.map(c => c.ref)).toEqual(
            Array.from({ length: 10 }, (_, i) => `title:${i + 1}`)
        );
    });
});
