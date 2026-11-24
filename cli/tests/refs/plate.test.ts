import type { VersionPlate, VersionPlateCategory } from "@core/collection/type";
import { mapLXNSCollections } from "@core/collection/map";
import { CollectionKind } from "@core/collection/type";
import { getFixtureLXNSCollections } from "@core/fixtures/lxns";
import { describe, expect, it } from "vitest";
import { listPlateRefs, resolvePlate } from "../../src/refs/plate";
import { caught } from "../caught";

function makePlate(
    category: VersionPlateCategory,
    id: number,
    name: string,
    songIds?: number[]
): VersionPlate {
    return {
        type: CollectionKind.Plate,
        id,
        name,
        genre: "",
        description: "",
        category,
        required: songIds
            ? [
                  {
                      difficulties: [3],
                      songs: songIds.map(sId => ({
                          id: sId,
                          title: String(sId),
                          type: "dx" as const,
                      })),
                  },
              ]
            : undefined,
    };
}

describe("version plates resolver", () => {
    const madeUpRecord: Record<VersionPlateCategory, VersionPlate[]> = {
        極: [
            makePlate("極", 1, "熊極", [1, 2]),
            makePlate("極", 2, "華極", [1, 2]),
            makePlate("極", 3, "煌極", [3]),
        ],
        将: [makePlate("将", 4, "熊将", [4])],
        神: [
            makePlate("神", 5, "熊神", [5]),
            makePlate("神", 6, "華神", [5]),
            makePlate("神", 7, "宴神", [5]),
        ],
        舞舞: [makePlate("舞舞", 8, "熊舞舞"), makePlate("舞舞", 9, "華舞舞")],
    };

    it("listPlateRefs lists single plates and joined tab labels in category order", () => {
        // Scramble keys to verify category order is always 極, 将, 神, 舞舞
        const scrambled = {
            舞舞: madeUpRecord.舞舞,
            将: madeUpRecord.将,
            極: madeUpRecord.極,
            神: madeUpRecord.神,
        } as Record<VersionPlateCategory, VersionPlate[]>;

        const refs = listPlateRefs(scrambled);
        const texts = refs.map(r => r.text);
        expect(texts).toEqual([
            "熊極",
            "華極",
            "煌極",
            "熊華極",
            "熊将",
            "熊神",
            "華神",
            "宴神",
            "熊華宴神",
            "熊舞舞",
            "華舞舞",
        ]);

        const xiongHuaJi = refs.find(r => r.text === "熊華極");
        expect(xiongHuaJi?.plate.id).toBe(1);

        const xiongHuaYanShen = refs.find(r => r.text === "熊華宴神");
        expect(xiongHuaYanShen?.plate.id).toBe(5);

        for (const plate of [
            ...madeUpRecord.極,
            ...madeUpRecord.将,
            ...madeUpRecord.神,
            ...madeUpRecord.舞舞,
        ]) {
            const single = refs.find(r => r.text === plate.name);
            expect(single?.plate.id).toBe(plate.id);
        }

        const withEmptyCategory = listPlateRefs({
            極: madeUpRecord.極,
            将: [],
            神: madeUpRecord.神,
            舞舞: [],
        });
        expect(withEmptyCategory.map(r => r.text)).toEqual([
            "熊極",
            "華極",
            "煌極",
            "熊華極",
            "熊神",
            "華神",
            "宴神",
            "熊華宴神",
        ]);
    });

    it("resolvePlate resolves exact names and joined tab labels", () => {
        const r1 = resolvePlate(madeUpRecord, "熊華極");
        expect(r1.text).toBe("熊華極");
        expect(r1.plate.id).toBe(1);

        expect(resolvePlate(madeUpRecord, "熊極").plate.id).toBe(1);
        expect(resolvePlate(madeUpRecord, "華極").plate.id).toBe(2);
        expect(resolvePlate(madeUpRecord, "熊華宴神").plate.id).toBe(5);
        expect(resolvePlate(madeUpRecord, "煌極").plate.id).toBe(3);
    });

    it("matches unique parts and rejects ambiguous parts", () => {
        expect(resolvePlate(madeUpRecord, "煌").plate.id).toBe(3);

        const errYan = caught(() => resolvePlate(madeUpRecord, "宴"));
        expect(errYan.code).toBe("AMBIGUOUS_REF");
        expect(errYan.candidates?.map(c => c.ref)).toEqual(["宴神", "熊華宴神"]);

        const errXiong = caught(() => resolvePlate(madeUpRecord, "熊"));
        expect(errXiong.code).toBe("AMBIGUOUS_REF");
        expect(errXiong.message).toBe("「熊」对应 6 个牌子；请写得更完整一些，或者用候选里的 ref");
        expect(errXiong.candidates?.map(c => c.ref)).toEqual([
            "熊極",
            "熊華極",
            "熊将",
            "熊神",
            "熊華宴神",
            "熊舞舞",
        ]);
    });

    it("rejects simplified characters with NOT_FOUND", () => {
        const error = caught(() => resolvePlate(madeUpRecord, "极"));
        expect(error.code).toBe("NOT_FOUND");
    });

    it("resolves plates from fixture LXNS data", () => {
        const fixturePlates = mapLXNSCollections(getFixtureLXNSCollections()).versionPlates;
        const refs = listPlateRefs(fixturePlates);
        expect(refs.map(r => r.text)).toEqual([
            "真極",
            "超極",
            "超将",
            "真神",
            "超神",
            "真舞舞",
            "超舞舞",
        ]);
        expect(refs.map(r => r.plate.id)).toEqual([6101, 6104, 6105, 6102, 6106, 6103, 6107]);

        expect(resolvePlate(fixturePlates, "真極").plate.id).toBe(6101);

        const errChao = caught(() => resolvePlate(fixturePlates, "超"));
        expect(errChao.code).toBe("AMBIGUOUS_REF");
        expect(errChao.candidates?.map(c => c.ref)).toEqual(["超極", "超将", "超神", "超舞舞"]);

        const errWuWu = caught(() => resolvePlate(fixturePlates, "舞舞"));
        expect(errWuWu.code).toBe("AMBIGUOUS_REF");
        expect(errWuWu.candidates?.map(c => c.ref)).toEqual(["真舞舞", "超舞舞"]);

        const errBaZhe = caught(() => resolvePlate(fixturePlates, "覇者"));
        expect(errBaZhe.code).toBe("NOT_FOUND");
        expect(errBaZhe.message).toContain("找不到牌子「覇者」");
        expect(errBaZhe.candidates?.map(c => c.ref)).toEqual([
            "真極",
            "超極",
            "超将",
            "真神",
            "超神",
        ]);
    });
});
