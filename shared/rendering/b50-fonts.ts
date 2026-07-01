import type { Font } from "takumi-js";

const GOOGLE_FONTS_CSS_URL =
    "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700;800;900&family=Noto+Sans+JP:wght@400;700;800;900&family=Noto+Sans+TC:wght@400;700;800;900&display=swap";

let fontPromise: Promise<Font[]> | null = null;

export function loadB50RenderFonts(): Promise<Font[]> {
    fontPromise ??= fetchGoogleFonts();
    return fontPromise;
}

async function fetchGoogleFonts(): Promise<Font[]> {
    const response = await fetch(GOOGLE_FONTS_CSS_URL);
    if (!response.ok) return [];

    const css = await response.text();
    const faces = parseFontFaces(css);
    const loaded = await Promise.allSettled(
        faces.map(async face => {
            const fontResponse = await fetch(face.url);
            if (!fontResponse.ok) throw new Error(`Font fetch failed: ${fontResponse.status}`);
            return {
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
        .map(block => {
            const family = readCssValue(block, "font-family")?.replace(/^['"]|['"]$/g, "");
            const weight = Number.parseInt(readCssValue(block, "font-weight") ?? "", 10);
            const style = readCssValue(block, "font-style") ?? "normal";
            const url = block.match(/url\(([^)]+)\)/)?.[1]?.replace(/^['"]|['"]$/g, "");

            if (!family || !url || !Number.isFinite(weight)) return null;
            return {
                family,
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
