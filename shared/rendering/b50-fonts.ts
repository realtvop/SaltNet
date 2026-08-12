import type { Font } from "takumi-js";

const GOOGLE_FONTS_ORIGIN = "https://fonts.googleapis.cn/css2";
const FONT_FAMILY_QUERIES = [
    "Noto Sans SC:wght@400;700;800;900",
    "Noto Sans JP:wght@400;700;800;900",
    "Noto Sans TC:wght@400;700;800;900",
    "Noto Sans Mono:wght@700;800;900",
];

export const B50_FONT_FAMILIES = ["Noto Sans SC", "Noto Sans JP", "Noto Sans TC", "Noto Sans Mono"];

export const B50_RENDER_LANG = "zh-CN";

let fontPromise: Promise<Font[]> | null = null;

export function loadB50RenderFonts(): Promise<Font[]> {
    fontPromise ??= fetchGoogleFonts();
    return fontPromise;
}

export function createB50GoogleFontsCssUrl(): string {
    const params = new URLSearchParams();
    for (const family of FONT_FAMILY_QUERIES) params.append("family", family);
    params.set("display", "swap");
    return `${GOOGLE_FONTS_ORIGIN}?${params.toString()}`;
}

async function fetchGoogleFonts(): Promise<Font[]> {
    const response = await fetch(createB50GoogleFontsCssUrl());
    if (!response.ok) return [];

    const css = await response.text();
    const faces = parseFontFaces(css);
    const loaded = await Promise.allSettled(
        faces.map(async face => {
            const fontResponse = await fetch(face.url);
            if (!fontResponse.ok) throw new Error(`Font fetch failed: ${fontResponse.status}`);
            return {
                name: `${face.family} ${face.weight} ${face.index}`,
                data: await fontResponse.arrayBuffer(),
                weight: face.weight,
                style: face.style,
                subsetOf: face.family,
            } satisfies Font;
        })
    );

    const fonts: Font[] = [];
    for (const result of loaded) {
        if (result.status === "fulfilled") fonts.push(result.value);
    }
    return fonts;
}

function parseFontFaces(css: string) {
    const blocks = css.match(/@font-face\s*{[^}]+}/g) ?? [];
    return blocks
        .map((block, index) => {
            const family = readCssValue(block, "font-family")?.replace(/^['"]|['"]$/g, "");
            const weight = Number.parseInt(readCssValue(block, "font-weight") ?? "", 10);
            const style = readCssValue(block, "font-style") ?? "normal";
            const url = block.match(/url\(([^)]+)\)/)?.[1]?.replace(/^['"]|['"]$/g, "");

            if (!family || !url || !Number.isFinite(weight)) return null;
            return {
                family,
                index,
                weight,
                style,
                url,
            };
        })
        .filter(
            (
                face
            ): face is {
                family: string;
                index: number;
                weight: number;
                style: string;
                url: string;
            } => face !== null
        );
}

function readCssValue(block: string, property: string): string | null {
    const match = block.match(new RegExp(`${property}\\s*:\\s*([^;]+);`));
    return match?.[1]?.trim() ?? null;
}
