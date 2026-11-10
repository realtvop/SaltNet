import type { VersionPlate, VersionPlateCategory } from "./type";
import { describe, expect, it } from "vitest";
import { ComboStatus } from "../mai/types";
import { CollectionKind } from "./type";
import { getVersionPlateTabs } from "./versionPlate";

describe("version plate tabs", () => {
    function makePlate(name: string, category: VersionPlateCategory = "極"): VersionPlate {
        return {
            id: 1,
            type: CollectionKind.Plate,
            name,
            category,
            genre: "",
            description: "",
            required: [
                {
                    difficulties: [0, 1, 2, 3],
                    fc: ComboStatus.FullCombo,
                    songs: [{ id: 1, title: "Song", type: "dx" }],
                },
            ],
        };
    }

    it.each(["極", "将", "神", "舞舞"] as const)(
        "combines matching adjacent %s plates and retains the first selection value",
        category => {
            expect(
                getVersionPlateTabs([
                    makePlate(`熊${category}`, category),
                    makePlate(`華${category}`, category),
                ])
            ).toEqual([{ value: `熊${category}`, label: `熊華${category}` }]);
        }
    );

    it("keeps different requirements and non-adjacent matches in separate tabs", () => {
        const first = makePlate("熊極");
        const second = makePlate("爽極");
        second.required![0]!.songs![0]!.id = 2;
        expect(getVersionPlateTabs([first, second, makePlate("華極")])).toEqual([
            { value: "熊極", label: "熊極" },
            { value: "爽極", label: "爽極" },
            { value: "華極", label: "華極" },
        ]);
    });

    it("ignores song titles and progress when comparing requirements", () => {
        const first = makePlate("双極");
        const second = makePlate("宴極");
        second.required![0]!.difficulties!.reverse();
        second.required![0]!.completed = true;
        second.required![0]!.songs![0]!.title = "Updated title";
        second.required![0]!.songs![0]!.completed = true;
        expect(getVersionPlateTabs([first, second])).toEqual([{ value: "双極", label: "双宴極" }]);
    });

    it("does not combine missing requirements or different plate categories", () => {
        const first = makePlate("熊極");
        const second = makePlate("華極");
        first.required = [];
        second.required = [];
        expect(getVersionPlateTabs([first, second])).toHaveLength(2);
        expect(getVersionPlateTabs([makePlate("熊極"), makePlate("熊神", "神")])).toHaveLength(2);
        expect(getVersionPlateTabs([])).toEqual([]);
    });
});
