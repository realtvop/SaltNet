import { describe, expect, it } from "vitest";
import { toHalfWidth } from "./toHalfWidth";

describe("toHalfWidth", () => {
    it("converts full-width ASCII characters to half-width equivalents", () => {
        // Full-width exclamation mark \uFF01 to tilde \uFF5E
        const fullWidth =
            "！＂＃＄％＆＇（）＊＋，－．／０１２３４５６７８９：；＜＝＞？＠ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ［＼］＾＿｀ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ｛｜｝～";
        const halfWidth =
            "!\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";

        expect(toHalfWidth(fullWidth)).toBe(halfWidth);
    });

    it("converts ideographic space to standard half-width space", () => {
        expect(toHalfWidth("Hello\u3000World")).toBe("Hello World");
        expect(toHalfWidth("　")).toBe(" ");
    });

    it("preserves standard ASCII and regular Chinese characters", () => {
        const text = "Hello World! 舞萌DX 123";
        expect(toHalfWidth(text)).toBe(text);
    });
});
