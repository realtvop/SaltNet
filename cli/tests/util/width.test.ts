import { describe, expect, it } from "vitest";
import { displayWidth, padDisplay } from "../../src/util/width";

describe("displayWidth", () => {
    it("counts Latin letters and digits as one column", () => {
        expect(displayWidth("")).toBe(0);
        expect(displayWidth("saltnet 1")).toBe(9);
    });

    it("counts Chinese, Japanese and full-width characters as two", () => {
        expect(displayWidth("熊極")).toBe(4);
        expect(displayWidth("ひらがな")).toBe(8);
        expect(displayWidth("カタカナ")).toBe(8);
        expect(displayWidth("Ａ")).toBe(2);
        expect(displayWidth("（）")).toBe(4);
        expect(displayWidth("a熊b")).toBe(4);
    });

    it("counts an astral character once, as two columns", () => {
        expect(displayWidth("𠀀")).toBe(2);
    });
});

describe("padDisplay", () => {
    it("pads to a display width", () => {
        expect(padDisplay("ab", 5)).toBe("ab   ");
        expect(padDisplay("熊", 5)).toBe("熊   ");
        expect(padDisplay("熊極", 4)).toBe("熊極");
    });

    it("never truncates", () => {
        expect(padDisplay("abcdef", 3)).toBe("abcdef");
    });
});
