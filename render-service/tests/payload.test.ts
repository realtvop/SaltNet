import { describe, expect, it } from "vitest";
import { parseB50Payload } from "../src/payload";

describe("parseB50Payload", () => {
    it("normalizes a valid B50 payload", () => {
        const payload = parseB50Payload({
            playerName: "  Salt  ",
            playerSecondaryName: "舞萌",
            playerRating: 15000,
            modeLabel: "B50",
            showDxScore: true,
            sd: [sampleChart()],
            dx: [],
        });

        expect(payload.playerName).toBe("Salt");
        expect(payload.sd[0].songId).toBe(123);
        expect(payload.showDxScore).toBe(true);
    });

    it("allows empty optional display and achievement icon fields", () => {
        const payload = parseB50Payload({
            playerName: "Salt",
            playerSecondaryName: "",
            modeLabel: "",
            showDxScore: false,
            sd: [
                {
                    ...sampleChart(),
                    fc: "",
                    fs: "",
                    rate: "",
                },
            ],
            dx: [],
        });

        expect(payload.playerSecondaryName).toBeNull();
        expect(payload.modeLabel).toBeNull();
        expect(payload.sd[0].fc).toBe("");
        expect(payload.sd[0].fs).toBe("");
        expect(payload.sd[0].rate).toBe("");
    });

    it("allows empty player name and chart title", () => {
        const payload = parseB50Payload({
            playerName: "   ",
            showDxScore: false,
            sd: [
                {
                    ...sampleChart(),
                    title: "",
                },
            ],
            dx: [],
        });

        expect(payload.playerName).toBe("");
        expect(payload.sd[0].title).toBe("");
    });

    it("rejects empty chart lists", () => {
        expect(() =>
            parseB50Payload({
                playerName: "Salt",
                showDxScore: false,
                sd: [],
                dx: [],
            })
        ).toThrow("at least one chart");
    });

    it("rejects oversized sections", () => {
        expect(() =>
            parseB50Payload({
                playerName: "Salt",
                showDxScore: false,
                sd: Array.from({ length: 36 }, () => sampleChart()),
                dx: [],
            })
        ).toThrow("at most 35");
    });
});

function sampleChart() {
    return {
        songId: 123,
        title: "テスト曲",
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
    };
}
