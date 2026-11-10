import type { LXNSCollectionLists } from "../integrations/lxns/type";
import { describe, expect, it } from "vitest";
import { RankRate } from "../mai/types";
import { isLXNSCollectionLists, mapLXNSCollections, versionPlateCategories } from "./map";
import { CollectionKind, TitleColor } from "./type";

function makeLists(overrides: Partial<LXNSCollectionLists> = {}): LXNSCollectionLists {
    return { trophies: [], icons: [], plates: [], frames: [], ...overrides };
}

describe("mapping LXNS collections", () => {
    it("matches title colors regardless of case and falls back to normal", () => {
        const { titles } = mapLXNSCollections(
            makeLists({
                trophies: [
                    { id: 1, name: "a", color: "rainbow" },
                    { id: 2, name: "b", color: "BRONZE" },
                    { id: 3, name: "c", color: "pink" },
                    { id: 4, name: "d", color: null },
                    { id: 5, name: "e" },
                ],
            })
        );

        expect(titles.map(title => title.color)).toEqual([
            TitleColor.Rainbow,
            TitleColor.Bronze,
            TitleColor.Normal,
            TitleColor.Normal,
            TitleColor.Normal,
        ]);
        expect(titles.every(title => title.type === CollectionKind.Title)).toBe(true);
    });

    it("copies requirements so the downloaded data is never shared", () => {
        const input = makeLists({
            plates: [
                {
                    id: 1,
                    name: "熊極",
                    required: [
                        {
                            difficulties: [3],
                            songs: [{ id: 5, title: "x", type: "dx", completed_difficulties: [3] }],
                        },
                    ],
                },
            ],
        });

        const { plates } = mapLXNSCollections(input);
        plates[0]!.required![0]!.difficulties!.push(4);
        plates[0]!.required![0]!.songs![0]!.completedDifficulties!.push(4);

        expect(input.plates[0]!.required![0]!.difficulties).toEqual([3]);
        expect(input.plates[0]!.required![0]!.songs![0]!.completed_difficulties).toEqual([3]);
    });

    it("leaves out empty or missing requirements and lists each genre once in first-seen order", () => {
        const { icons, genres } = mapLXNSCollections(
            makeLists({
                icons: [
                    { id: 1, name: "a", genre: "B", required: [] },
                    { id: 2, name: "b", genre: "A", required: null },
                    { id: 3, name: "c", genre: "B" },
                    { id: 4, name: "d", genre: null },
                ],
            })
        );

        expect(icons.every(icon => icon.required === undefined)).toBe(true);
        expect(icons.map(icon => icon.genre)).toEqual(["B", "A", "B", ""]);
        expect(genres.icons).toEqual(["B", "A"]);
    });

    it("sorts version plates into categories by name suffix and skips plates without requirements", () => {
        const required = [{ rate: RankRate.sss }];
        const { plates, versionPlates } = mapLXNSCollections(
            makeLists({
                plates: [
                    { id: 1, name: "熊極", required },
                    { id: 2, name: "華将", required },
                    { id: 3, name: "輝神", required },
                    { id: 4, name: "覇者舞舞", required },
                    { id: 5, name: "空神", required: [] },
                    { id: 6, name: "桜花", required },
                    { id: 7, name: "極光" },
                ],
            })
        );

        expect(versionPlateCategories).toEqual(["極", "将", "神", "舞舞"]);
        expect(
            Object.fromEntries(
                versionPlateCategories.map(c => [c, versionPlates[c].map(p => p.id)])
            )
        ).toEqual({
            極: [1],
            将: [2],
            神: [3],
            舞舞: [4],
        });
        expect(versionPlates["極"][0]).toEqual({ ...plates[0], category: "極" });
        expect(versionPlates["極"][0]).not.toBe(plates[0]);
    });
});

describe("validating LXNS collection data", () => {
    it("accepts well-formed lists, including cached extras", () => {
        expect(isLXNSCollectionLists(makeLists())).toBe(true);
        expect(
            isLXNSCollectionLists({
                ...makeLists({
                    plates: [
                        {
                            id: 1,
                            name: "熊極",
                            color: null,
                            required: [
                                {
                                    difficulties: [3],
                                    rate: RankRate.sss,
                                    songs: [{ id: 1, title: "x", type: "utage", completed: true }],
                                },
                            ],
                        },
                    ],
                }),
                cachedAt: 1,
            })
        ).toBe(true);
    });

    it.each([
        ["a missing list", { trophies: [], icons: [], plates: [] }],
        ["a non-array list", { ...makeLists(), frames: {} }],
        ["an item without a name", makeLists({ icons: [{ id: 1 } as never] })],
        ["a non-numeric id", makeLists({ icons: [{ id: "1", name: "a" } as never] })],
        [
            "an unknown song type",
            makeLists({
                plates: [
                    { id: 1, name: "a", required: [{ songs: [{ id: 1, title: "x", type: "?" }] }] },
                ] as never,
            }),
        ],
        ["null", null],
        ["a string", "lists"],
    ])("rejects %s", (_label, value) => {
        expect(isLXNSCollectionLists(value)).toBe(false);
    });
});
