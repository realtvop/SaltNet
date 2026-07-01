import { describe, expect, it } from "vitest";
import { B50RenderImage } from "../../shared/rendering/b50-image";
import type { B50RenderPayload } from "../../shared/rendering/b50-payload";

describe("B50RenderImage", () => {
    it("uses the provided site origin for local static assets", () => {
        const element = (
            <B50RenderImage
                payload={samplePayload()}
                options={{ siteOrigin: "http://localhost:5173/" }}
            />
        );
        const serialized = JSON.stringify(element);

        expect(serialized).toContain("http://localhost:5173");
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
