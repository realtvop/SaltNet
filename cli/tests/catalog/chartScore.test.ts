import type { Chart } from "@core/music/type";
import type { PlayCountEstimate } from "@core/user/scoreHistory/estimate";
import type { User } from "@core/user/type";
import type { UserListRow } from "../../src/users/repository";
import type { StoredChartScore, UserScores } from "../../src/users/scores";
import { describe, expect, it } from "vitest";
import { chartUserParts } from "../../src/catalog/chartScore";
import { fixtureSongCatalog } from "../fixtureCatalog";

const baseChart = fixtureSongCatalog().chartByKey.get("146-3")!.chart;

function makeChart(deluxeScoreMax?: number): Chart {
    return {
        ...baseChart,
        info: {
            ...baseChart.info,
            deluxeScoreMax: deluxeScoreMax as number,
        },
    };
}

function makeScores(score: Partial<StoredChartScore>, estimate?: PlayCountEstimate): UserScores {
    const key = "146-3";
    const stored: StoredChartScore = {
        recordKey: key,
        chartKey: key,
        achievements: 100,
        dxScore: 500,
        fc: null,
        fs: null,
        rate: null,
        rating: null,
        playCount: null,
        lastChangedAt: 123456,
        ...score,
    };
    return {
        user: { index: 0, uid: "made-user", displayName: "Made User" } as unknown as UserListRow,
        raw: { uid: "made-user", data: {} } as User,
        source: "detailed",
        byChartKey: new Map([[key, stored]]),
        playCountByRecordKey: estimate ? new Map([[key, estimate]]) : new Map(),
        b50ByChartKey: new Map(),
        b50: { old: [], newer: [] },
    };
}

describe("chartUserParts", () => {
    it("returns null dxScoreMax and dxStars when deluxeScoreMax is 0 with dxScore 500", () => {
        const parts = chartUserParts(makeChart(0), makeScores({ dxScore: 500 }));
        expect(parts.score?.dxScoreMax).toBeNull();
        expect(parts.score?.dxStars).toBeNull();
    });

    it("returns null dxScoreMax and dxStars when deluxeScoreMax is missing with dxScore 500", () => {
        const parts = chartUserParts(makeChart(undefined), makeScores({ dxScore: 500 }));
        expect(parts.score?.dxScoreMax).toBeNull();
        expect(parts.score?.dxStars).toBeNull();
    });

    it("returns deluxeScoreMax 1000 and dxStars 5 when deluxeScoreMax is 1000 with dxScore 970", () => {
        const parts = chartUserParts(makeChart(1000), makeScores({ dxScore: 970 }));
        expect(parts.score?.dxScoreMax).toBe(1000);
        expect(parts.score?.dxStars).toBe(5);
    });

    it("returns null changedAt without exception when lastChangedAt exceeds Date range", () => {
        const parts = chartUserParts(
            makeChart(1000),
            makeScores({ lastChangedAt: 8_700_000_000_000_000 })
        );
        expect(parts.score?.changedAt).toBeNull();
    });

    it("returns null changedAt when lastChangedAt is 0 and -1", () => {
        const parts0 = chartUserParts(makeChart(1000), makeScores({ lastChangedAt: 0 }));
        expect(parts0.score?.changedAt).toBeNull();

        const partsNeg = chartUserParts(makeChart(1000), makeScores({ lastChangedAt: -1 }));
        expect(partsNeg.score?.changedAt).toBeNull();
    });

    it("returns score and b50 null when no scores argument is given", () => {
        expect(chartUserParts(makeChart())).toEqual({ score: null, b50: null });
    });

    it("uses estimate play count and isEstimated when estimate exists and playCount is not null", () => {
        // stored 10 and that one later change event -> playCount 11, playCountEstimated true
        const estimate1: PlayCountEstimate = {
            recordedPlayCount: 10,
            uncountedScoreChanges: 1,
            playCount: 11,
            isEstimated: true,
            displayText: "≥ 11 次",
        };
        const parts1 = chartUserParts(makeChart(), makeScores({ playCount: 10 }, estimate1));
        expect(parts1.score?.playCount).toBe(11);
        expect(parts1.score?.playCountEstimated).toBe(true);

        // stored 10 and no events -> 10, false
        const estimate2: PlayCountEstimate = {
            recordedPlayCount: 10,
            uncountedScoreChanges: 0,
            playCount: 10,
            isEstimated: false,
            displayText: "10 次",
        };
        const parts2 = chartUserParts(makeChart(), makeScores({ playCount: 10 }, estimate2));
        expect(parts2.score?.playCount).toBe(10);
        expect(parts2.score?.playCountEstimated).toBe(false);

        // stored 10 and one later event that changes only the play count to 12 -> 12, false
        const estimate3: PlayCountEstimate = {
            recordedPlayCount: 12,
            uncountedScoreChanges: 0,
            playCount: 12,
            isEstimated: false,
            displayText: "12 次",
        };
        const parts3 = chartUserParts(makeChart(), makeScores({ playCount: 10 }, estimate3));
        expect(parts3.score?.playCount).toBe(12);
        expect(parts3.score?.playCountEstimated).toBe(false);

        // no stored count and no events -> null, false
        const estimate4: PlayCountEstimate = {
            recordedPlayCount: null,
            uncountedScoreChanges: 0,
            playCount: null,
            isEstimated: false,
            displayText: "未知",
        };
        const parts4 = chartUserParts(makeChart(), makeScores({ playCount: null }, estimate4));
        expect(parts4.score?.playCount).toBeNull();
        expect(parts4.score?.playCountEstimated).toBe(false);
    });
});
