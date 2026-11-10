import { describe, expect, it } from "vitest";
import { convertSaltMetaNextToSavedMusicList } from "./saltmeta";
import {
    createMusicSearchIndex,
    matchesMusicSearchIndex,
    normalizeMusicSearchText,
} from "./search";

describe("music search index", () => {
    it("matches simplified and traditional Chinese variants in either direction", () => {
        const simplifiedIndex = createMusicSearchIndex(["台风来了"]);
        const traditionalIndex = createMusicSearchIndex(["颱風來了"]);

        expect(matchesMusicSearchIndex(simplifiedIndex, "颱風")).toBe(true);
        expect(matchesMusicSearchIndex(traditionalIndex, "台风")).toBe(true);
    });

    it("matches full pinyin and pinyin initials", () => {
        const index = createMusicSearchIndex(["世界计划"]);

        expect(matchesMusicSearchIndex(index, "shijiejihua")).toBe(true);
        expect(matchesMusicSearchIndex(index, "sj jh")).toBe(true);
    });

    it("matches Japanese kana by romaji, including common long-vowel spelling", () => {
        const index = createMusicSearchIndex(["とうきょう", "ほしぞら"]);

        expect(matchesMusicSearchIndex(index, "toukyou")).toBe(true);
        expect(matchesMusicSearchIndex(index, "tokyo")).toBe(true);
        expect(matchesMusicSearchIndex(index, "tōkyō")).toBe(true);
        expect(matchesMusicSearchIndex(index, "hoshizora")).toBe(true);
    });

    it("normalizes width, spaces, punctuation, and pinyin tone marks", () => {
        expect(normalizeMusicSearchText("Ｓｈì　Ｊｉè！")).toBe("shijie");
        expect(matchesMusicSearchIndex(createMusicSearchIndex(["世界"]), "shì jiè")).toBe(true);
    });

    it("precomputes indexes as SaltMeta metadata is converted", () => {
        const data = convertSaltMetaNextToSavedMusicList({
            musics: [
                {
                    id: 1,
                    title: "世界计划",
                    artist: "星空",
                    bpm: 120,
                    category: "maimai",
                    isLocked: false,
                    aliases: { cn: ["台风"] },
                    charts: [
                        {
                            type: "sd",
                            difficulty: 0,
                            noteDesigner: "ほしぞら",
                            noteCounts: {
                                tap: 1,
                                hold: 0,
                                slide: 0,
                                touch: null,
                                break: 1,
                                total: 2,
                            },
                            regions: {
                                cn: { level: "1", internalLevel: 1, version: 2026 },
                            },
                        },
                    ],
                },
            ],
            versions: [],
        });
        const music = Object.values(data.musicList)[0];

        expect(matchesMusicSearchIndex(music.info.searchIndex, "xingkong")).toBe(true);
        expect(matchesMusicSearchIndex(music.info.searchIndex, "颱風")).toBe(true);
        expect(matchesMusicSearchIndex(music.info.searchIndex, "shijiejihua")).toBe(true);
        expect(matchesMusicSearchIndex(music.charts[0].info.searchIndex, "hoshizora")).toBe(true);
    });
});
