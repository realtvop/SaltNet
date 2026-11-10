import type { SavedMusicList } from "./type";
import OpenCC from "opencc-js/t2cn";
import { pinyin } from "pinyin-pro";
import { toRomaji } from "wanakana";

export const MUSIC_SEARCH_INDEX_VERSION = 1;

const toSimplified = OpenCC.Converter({ from: "t", to: "cn" });
const containsHan = /\p{Script=Han}/u;

export function normalizeMusicSearchText(text: string): string {
    return text
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[üǖǘǚǜ]/gu, "v")
        .normalize("NFD")
        .replace(/([a-z])\p{M}+/gu, "$1")
        .normalize("NFC")
        .replace(/[\s\p{P}\p{S}]+/gu, "");
}

/** How a normalized search text was reached from the original text. */
export type MusicSearchVariantKind = "text" | "pinyin" | "romaji";

export interface MusicSearchVariant {
    /**
     * `text` is the text itself or its simplified-Chinese form, `pinyin` its full pinyin or the
     * pinyin initials, `romaji` its romaji or the romaji with the long vowels shortened. A text
     * that more than one route leads to (the romaji of a Latin title is the title) keeps the
     * kind of the first route.
     */
    kind: MusicSearchVariantKind;
    /** The normalized text a query is matched against. */
    text: string;
}

/**
 * Every normalized text `text` can be found by, with the way it was reached, in the order
 * `createMusicSearchIndex` lists them and without repeats.
 */
export function createMusicSearchVariants(text: string): MusicSearchVariant[] {
    if (!text) return [];

    const found = new Map<string, MusicSearchVariantKind>();
    const add = (kind: MusicSearchVariantKind, value: string) => {
        if (value && !found.has(value)) found.set(value, kind);
    };

    const variants = new Set([text, toSimplified(text)]);
    for (const variant of variants) {
        add("text", normalizeMusicSearchText(variant));

        if (containsHan.test(variant)) {
            add("pinyin", normalizeMusicSearchText(pinyin(variant, { toneType: "none" })));
            add(
                "pinyin",
                normalizeMusicSearchText(pinyin(variant, { pattern: "first", toneType: "none" }))
            );
        }

        const romaji = normalizeMusicSearchText(toRomaji(variant));
        add("romaji", romaji);
        // Accept Hepburn macrons and common long-vowel spellings, e.g. "tokyo" for "toukyou".
        add("romaji", romaji.replace(/ou/gu, "o").replace(/([aeiou])\1/gu, "$1"));
    }

    return [...found].map(([normalized, kind]) => ({ kind, text: normalized }));
}

export function createMusicSearchIndex(texts: readonly (string | undefined)[]): string[] {
    const index = new Set<string>();
    for (const text of texts) {
        if (!text) continue;
        for (const variant of createMusicSearchVariants(text)) index.add(variant.text);
    }
    return [...index];
}

export function createMusicSearchQuery(query: string): string[] {
    const normalizedQuery = normalizeMusicSearchText(query);
    if (!normalizedQuery) return [];

    return [...new Set([normalizedQuery, normalizeMusicSearchText(toSimplified(query))])];
}

export function indexMusicSearchData(data: SavedMusicList): SavedMusicList {
    for (const music of Object.values(data.musicList)) {
        music.info.searchIndex = createMusicSearchIndex([
            music.info.title,
            music.info.artist,
            ...(music.info.aliases ?? []),
        ]);

        for (const chart of music.charts) {
            chart.info.searchIndex = createMusicSearchIndex([chart.info.charter]);
        }
    }
    return data;
}

export function matchesMusicSearchIndex(
    index: readonly string[] | undefined,
    query: string | readonly string[]
): boolean {
    if (!index?.length) return false;
    const queryVariants = typeof query === "string" ? createMusicSearchQuery(query) : query;

    return queryVariants.some(
        variant => variant && index.some(indexedText => indexedText.includes(variant))
    );
}
