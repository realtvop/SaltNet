import { describe, expect, it } from "vitest";
import {
    B50_DESIGN_SIZE,
    B50_RENDER_SCALE,
    B50_RENDER_SIZE,
    B50RenderImage,
} from "../../shared/rendering/b50-image";
import type { B50RenderPayload } from "../../shared/rendering/b50-payload";

describe("B50RenderImage", () => {
    it("keeps the legacy 2x PNG output resolution", () => {
        expect(B50_DESIGN_SIZE).toEqual({ width: 1175, height: 1365 });
        expect(B50_RENDER_SCALE).toBe(2);
        expect(B50_RENDER_SIZE).toEqual({ width: 2350, height: 2730 });
    });

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
