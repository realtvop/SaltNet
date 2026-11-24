import { describe, expect, it } from "vitest";
import { isLXNSCollectionLists, mapLXNSCollections } from "../collection/map";
import { getVersionPlateTabs } from "../collection/versionPlate";
import { getFixtureLXNSCollections } from "./lxns";
import { getFixtureSaltMetaCompacted } from "./saltmeta";

describe("lxns collections fixture", () => {
    it("has the shape of the four lists the service returns", () => {
        const lists = getFixtureLXNSCollections();

        expect(isLXNSCollectionLists(lists)).toBe(true);
        for (const list of [lists.trophies, lists.icons, lists.plates, lists.frames]) {
            expect(list.length).toBeGreaterThan(0);
        }
    });

    it("hands out independent copies", () => {
        const first = getFixtureLXNSCollections();
        first.plates[0].name = "changed";

        expect(getFixtureLXNSCollections().plates[0].name).toBe("デフォルト");
    });

    it("keeps the upstream fields the app does not read", () => {
        const [plate] = getFixtureLXNSCollections().plates as unknown as {
            release_date?: string;
        }[];

        expect(plate.release_date).toBe("2019-12-05");
    });

    it("covers titles of every colour that have requirements, and some that have none", () => {
        const { trophies } = getFixtureLXNSCollections();

        expect(new Set(trophies.map(trophy => trophy.color))).toEqual(
            new Set(["Normal", "Bronze", "Silver", "Gold", "Rainbow"])
        );
        expect(trophies.some(trophy => trophy.required === undefined)).toBe(true);
        expect(trophies.some(trophy => trophy.required?.some(entry => entry.songs?.length))).toBe(
            true
        );
    });

    it("covers a requirement with several entries and one that names a song with no CN chart", () => {
        const { plates, trophies } = getFixtureLXNSCollections();
        const catalogIds = new Set(getFixtureSaltMetaCompacted().musics.map(music => music[0]));

        expect(plates.some(plate => (plate.required?.length ?? 0) > 1)).toBe(true);
        const senbonzakura = trophies.find(trophy => trophy.id === 5101);
        expect(senbonzakura?.required?.[0].songs?.[0]).toMatchObject({ id: 125, type: "dx" });
        expect(catalogIds.has(125)).toBe(true);
    });

    it("maps to version plates, one list per category, that form tabs", () => {
        const mapped = mapLXNSCollections(getFixtureLXNSCollections());

        expect(mapped.versionPlates.極.map(plate => plate.name)).toEqual(["真極", "超極"]);
        expect(mapped.versionPlates.神.map(plate => plate.name)).toEqual(["真神", "超神"]);
        expect(mapped.versionPlates.将.map(plate => plate.name)).toEqual(["超将"]);
        expect(mapped.versionPlates.舞舞.map(plate => plate.name)).toEqual(["真舞舞", "超舞舞"]);
        expect(getVersionPlateTabs(mapped.versionPlates.極).map(tab => tab.label)).toEqual([
            "真極",
            "超極",
        ]);
    });
});
