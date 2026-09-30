import OpenCC from "opencc-js/t2cn";
import { pinyin } from "pinyin-pro";
import { toRomaji } from "wanakana";
import type { SavedMusicList } from "./type";

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

function addTextVariants(index: Set<string>, text: string): void {
    if (!text) return;

    const variants = new Set([text, toSimplified(text)]);
    for (const variant of variants) {
        const normalized = normalizeMusicSearchText(variant);
        if (normalized) index.add(normalized);

        if (containsHan.test(variant)) {
            const fullPinyin = pinyin(variant, { toneType: "none" });
            const pinyinInitials = pinyin(variant, { pattern: "first", toneType: "none" });
            const normalizedPinyin = normalizeMusicSearchText(fullPinyin);
            const normalizedInitials = normalizeMusicSearchText(pinyinInitials);
            if (normalizedPinyin) index.add(normalizedPinyin);
            if (normalizedInitials) index.add(normalizedInitials);
        }

        const romaji = normalizeMusicSearchText(toRomaji(variant));
        if (romaji) {
            index.add(romaji);
            // Accept Hepburn macrons and common long-vowel spellings, e.g. "tokyo" for "toukyou".
            const shortenedLongVowels = romaji.replace(/ou/gu, "o").replace(/([aeiou])\1/gu, "$1");
            if (shortenedLongVowels !== romaji) index.add(shortenedLongVowels);
        }
    }
}

export function createMusicSearchIndex(texts: readonly (string | undefined)[]): string[] {
    const index = new Set<string>();
    for (const text of texts) {
        if (text) addTextVariants(index, text);
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
