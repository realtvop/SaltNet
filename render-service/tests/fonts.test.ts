import { describe, expect, it } from "vitest";
import {
    B50_FONT_FAMILIES,
    collectB50RenderText,
    createB50GoogleFontsCssUrl,
} from "../../shared/rendering/b50-fonts";
import type { B50RenderPayload } from "../../shared/rendering/b50-payload";

describe("B50 render fonts", () => {
    it("includes payload CJK text in the Google Fonts request text", () => {
        const text = collectB50RenderText(samplePayload());
        const url = createB50GoogleFontsCssUrl(text);

        expect(text).toContain("舞");
        expect(text).toContain("初");
        expect(text).toContain("星");
        expect(decodeURIComponent(url)).toContain("text=");
        expect(decodeURIComponent(url)).toContain("舞萌");
        expect(decodeURIComponent(url)).toContain("初音ミク");
        expect(B50_FONT_FAMILIES).toEqual([
            "Noto Sans SC",
            "Noto Sans JP",
            "Noto Sans TC",
            "Noto Sans Mono",
        ]);
    });
});

function samplePayload(): B50RenderPayload {
    return {
        playerName: "舞萌DX",
        playerSecondaryName: "初音ミク",
        playerRating: 15000,
        modeLabel: "拟合 B50",
        showDxScore: true,
        sd: [
            {
                songId: 123,
                title: "あいたい星人",
                type: "DX",
                levelIndex: 3,
                ds: 13.7,
                achievements: 100.5,
                fc: "app",
                fs: "fsdp",
                rate: "sssp",
                ra: 310,
                deluxeScore: 1200,
                deluxeScoreMax: 1250,
            },
        ],
        dx: [],
    };
}
