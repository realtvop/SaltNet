import { describe, expect, it } from "vitest";
import { renderB50Html } from "../../shared/rendering/b50-template";
import type { B50RenderPayload } from "../../shared/rendering/b50-payload";

describe("renderB50Html", () => {
    it("uses the provided site origin for local static assets", () => {
        const html = renderB50Html(samplePayload(), {
            siteOrigin: "http://localhost:5173/",
        });

        expect(html).toContain("http://localhost:5173/favicon.png");
        expect(html).toContain("http://localhost:5173/b50_background.png");
        expect(html).toContain("http://localhost:5173/icons/sssplus.png");
        expect(html).toContain("http://localhost:5173/icons/music_icon_app.png");
        expect(html).toContain("http://localhost:5173/icons/music_icon_fdxp.png");
    });
});

function samplePayload(): B50RenderPayload {
    return {
        playerName: "Salt",
        playerSecondaryName: null,
        playerRating: 15000,
        modeLabel: "B50",
        showDxScore: true,
        sd: [
            {
                songId: 123,
                title: "Test",
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
