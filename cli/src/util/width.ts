/** Ranges of code points that a terminal draws two columns wide (CJK, full-width forms). */
const WIDE_RANGES: readonly (readonly [number, number])[] = [
    [0x1100, 0x115f],
    [0x2e80, 0x303e],
    [0x3041, 0x33ff],
    [0x3400, 0x4dbf],
    [0x4e00, 0x9fff],
    [0xa000, 0xa4cf],
    [0xac00, 0xd7a3],
    [0xf900, 0xfaff],
    [0xfe30, 0xfe6f],
    [0xff00, 0xff60],
    [0xffe0, 0xffe6],
    [0x20000, 0x3fffd],
];

/** How many terminal columns a string takes up. */
export function displayWidth(text: string): number {
    let width = 0;
    for (const char of text) {
        const code = char.codePointAt(0) ?? 0;
        width += WIDE_RANGES.some(([from, to]) => code >= from && code <= to) ? 2 : 1;
    }
    return width;
}

/** Pads with spaces on the right to a display width, so columns line up with Chinese text. */
export function padDisplay(text: string, width: number): string {
    return text + " ".repeat(Math.max(0, width - displayWidth(text)));
}
