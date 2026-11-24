import { describe, expect, it } from "vitest";
import {
    convertSaltMetaNextCompactedToNormal,
    SALTMETA_NEXT_COMPACTED_VERSION,
} from "../music/saltmeta";
import {
    createFixtureMusicList,
    FIXTURE_SALTMETA_DUPLICATE_UTAGE_IDS,
    getFixtureSaltMetaCompacted,
} from "./saltmeta";

describe("saltmeta fixture", () => {
    it("is a compacted document of the version the code expects", () => {
        const document = getFixtureSaltMetaCompacted();

        expect(document.version).toBe(SALTMETA_NEXT_COMPACTED_VERSION);
        expect(() => convertSaltMetaNextCompactedToNormal(document)).not.toThrow();
    });

    it("hands out independent copies", () => {
        const first = createFixtureMusicList();
        first.musicList[8].info.title = "changed";

        expect(createFixtureMusicList().musicList[8].info.title).toBe("True Love Song");
    });

    it("covers SD and DX charts of one song and a numeric title", () => {
        const { musicList } = createFixtureMusicList();

        expect(musicList[146].info.title).toBe("39");
        expect(musicList[10146].info.title).toBe("39");
        expect(musicList[146].charts.map(chart => chart.info.grade)).toEqual([0, 1, 2, 3, 4]);
        expect(musicList[10146].charts.map(chart => chart.info.grade)).toEqual([0, 1, 2, 3]);
    });

    it("covers equal and case-different titles", () => {
        const { musicList } = createFixtureMusicList();

        expect([131, 383].map(id => musicList[id].info.title)).toEqual(["Link", "Link"]);
        expect(musicList[695].info.title).toBe("TRUST");
        expect(musicList[10000 + 1726].info.title).toBe("Trust");
    });

    it("lists the two upstream duplicate banquet songs twice", () => {
        const document = getFixtureSaltMetaCompacted();

        for (const id of FIXTURE_SALTMETA_DUPLICATE_UTAGE_IDS) {
            expect(document.musics.filter(music => music[0] === id)).toHaveLength(2);
        }

        const { musicList, chartList } = createFixtureMusicList();
        for (const id of FIXTURE_SALTMETA_DUPLICATE_UTAGE_IDS) {
            const musicId = id + 10000;
            expect(musicList[musicId].charts).toHaveLength(2);
            expect(chartList[musicId * 100 + 10].music).toBe(musicList[musicId]);
        }
    });

    it("drops charts that have no CN data", () => {
        const { musicList } = createFixtureMusicList();

        expect(musicList[125]).toBeUndefined();
        expect(musicList[10125]).toBeUndefined();
        expect(musicList[77].charts).toHaveLength(4);
        expect(musicList[10077]).toBeUndefined();
        expect(musicList[113].charts.map(chart => chart.info.grade)).toEqual([0, 1, 2, 3]);
    });

    it("keeps a locked song and one song per CN version", () => {
        const { musicList } = createFixtureMusicList();
        const versions = new Set(
            Object.values(musicList).map(music => music.info.from as unknown as string)
        );

        expect(musicList[12025]).toBeDefined();
        expect(versions.size).toBeGreaterThanOrEqual(19);
        expect(versions.has("maimai")).toBe(true);
        expect(versions.has("舞萌DX 2026")).toBe(true);
    });
});
