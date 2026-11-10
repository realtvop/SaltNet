import OpenCC from "opencc-js/t2cn";
import { pinyin } from "pinyin-pro";
import { describe, expect, it } from "vitest";
import { toRomaji } from "wanakana";
import { createFixtureMusicList } from "../fixtures/saltmeta";
import { convertSaltMetaNextToSavedMusicList } from "./saltmeta";
import {
    createMusicSearchIndex,
    createMusicSearchVariants,
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

/**
 * The index as it was built before `createMusicSearchVariants` existed, kept so the test below can
 * show that splitting the variants by kind changed nothing that is stored: the web app and the CLI
 * persist these arrays and do not rebuild them while `MUSIC_SEARCH_INDEX_VERSION` stays the same.
 */
function createLegacyMusicSearchIndex(texts: readonly (string | undefined)[]): string[] {
    const toSimplified = OpenCC.Converter({ from: "t", to: "cn" });
    const containsHan = /\p{Script=Han}/u;
    const index = new Set<string>();

    for (const text of texts) {
        if (!text) continue;
        const variants = new Set([text, toSimplified(text)]);
        for (const variant of variants) {
            const normalized = normalizeMusicSearchText(variant);
            if (normalized) index.add(normalized);

            if (containsHan.test(variant)) {
                const normalizedPinyin = normalizeMusicSearchText(
                    pinyin(variant, { toneType: "none" })
                );
                const normalizedInitials = normalizeMusicSearchText(
                    pinyin(variant, { pattern: "first", toneType: "none" })
                );
                if (normalizedPinyin) index.add(normalizedPinyin);
                if (normalizedInitials) index.add(normalizedInitials);
            }

            const romaji = normalizeMusicSearchText(toRomaji(variant));
            if (romaji) {
                index.add(romaji);
                const shortened = romaji.replace(/ou/gu, "o").replace(/([aeiou])\1/gu, "$1");
                if (shortened !== romaji) index.add(shortened);
            }
        }
    }
    return [...index];
}

describe("music search variants", () => {
    it("has nothing for empty text or text that normalizes to nothing", () => {
        expect(createMusicSearchVariants("")).toEqual([]);
        expect(createMusicSearchVariants("！？ ・")).toEqual([]);
    });

    it("gives plain text as one variant, because its romaji is itself", () => {
        expect(createMusicSearchVariants("Re:MASTER")).toEqual([
            { kind: "text", text: "remaster" },
        ]);
    });

    it("tells the text of a Chinese title from its pinyin and pinyin initials", () => {
        expect(createMusicSearchVariants("世界计划")).toEqual([
            { kind: "text", text: "世界计划" },
            { kind: "pinyin", text: "shijiejihua" },
            { kind: "pinyin", text: "sjjh" },
        ]);
    });

    it("gives the simplified form as text, ahead of the pinyin of each form", () => {
        const variants = createMusicSearchVariants("颱風來了");

        expect(variants.filter(variant => variant.kind === "text")).toEqual([
            { kind: "text", text: "颱風來了" },
            { kind: "text", text: "台风来了" },
        ]);
        expect(variants.filter(variant => variant.kind === "pinyin").map(v => v.text)).toContain(
            "taifenglaile"
        );
    });

    it("tells kana from its romaji and the romaji with long vowels shortened", () => {
        expect(createMusicSearchVariants("とうきょう")).toEqual([
            { kind: "text", text: "とうきょう" },
            { kind: "romaji", text: "toukyou" },
            { kind: "romaji", text: "tokyo" },
        ]);
    });

    it("keeps the first kind when two routes lead to the same text", () => {
        // Kana with no long vowel: the shortened romaji is the romaji itself.
        const variants = createMusicSearchVariants("ほしぞら");

        expect(variants.map(variant => variant.text)).toEqual(["ほしぞら", "hoshizora"]);
        expect(variants.map(variant => variant.kind)).toEqual(["text", "romaji"]);
    });

    it("lists no text twice", () => {
        for (const text of ["東京タワー", "ABC abc", "Ａｂｃ", "とうきょう とうきょう"]) {
            const texts = createMusicSearchVariants(text).map(variant => variant.text);
            expect(new Set(texts).size).toBe(texts.length);
        }
    });

    it("leaves the stored index exactly as it was, text for text and in the same order", () => {
        const samples = [
            "",
            "Link",
            "TRUST",
            "39",
            "Re:MASTER",
            "世界计划",
            "颱風來了",
            "とうきょう",
            "ほしぞら",
            "東京タワー",
            "ＡＢＣ　ｄｅｆ",
            "Ōoki Tōkyō",
            "ﾊﾟｰﾌｪｸﾄ",
            "！？",
        ];
        for (const sample of samples) {
            expect(createMusicSearchIndex([sample]), sample).toEqual(
                createLegacyMusicSearchIndex([sample])
            );
        }
        expect(
            createMusicSearchIndex(["ほしぞら", undefined, "とうきょう", "", "ほしぞら"])
        ).toEqual(
            createLegacyMusicSearchIndex(["ほしぞら", undefined, "とうきょう", "", "ほしぞら"])
        );
    });

    // Builds every index twice, with pinyin and romaji conversion; the long timeout is for a busy machine.
    it("leaves the index of every title, artist, alias and charter in the fixed data as it was", () => {
        const { musicList } = createFixtureMusicList();
        let compared = 0;

        for (const music of Object.values(musicList)) {
            const fields = [music.info.title, music.info.artist, ...(music.info.aliases ?? [])];
            expect(createMusicSearchIndex(fields), music.info.title).toEqual(
                createLegacyMusicSearchIndex(fields)
            );
            for (const chart of music.charts) {
                expect(createMusicSearchIndex([chart.info.charter])).toEqual(
                    createLegacyMusicSearchIndex([chart.info.charter])
                );
                compared++;
            }
        }

        expect(compared).toBeGreaterThan(100);
    }, 30_000);
});
