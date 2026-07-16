import { describe, expect, it } from "vitest";
import { B50_FONT_FAMILIES, createB50GoogleFontsCssUrl } from "../../shared/rendering/b50-fonts";

describe("B50 render fonts", () => {
    it("requests the complete cached B50 font families", () => {
        const url = new URL(createB50GoogleFontsCssUrl());

        expect(url.searchParams.getAll("family")).toEqual([
            "Noto Sans SC:wght@400;700;800;900",
            "Noto Sans JP:wght@400;700;800;900",
            "Noto Sans TC:wght@400;700;800;900",
            "Noto Sans Mono:wght@700;800;900",
        ]);
        expect(url.searchParams.has("text")).toBe(false);
        expect(url.searchParams.get("display")).toBe("swap");
        expect(B50_FONT_FAMILIES).toEqual([
            "Noto Sans SC",
            "Noto Sans JP",
            "Noto Sans TC",
            "Noto Sans Mono",
        ]);
    });
});
