import type { Chart } from "@core/music/type";
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

function makeScores(score: Partial<StoredChartScore>): UserScores {
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
        source: "detailed",
        byChartKey: new Map([[key, stored]]),
        playCountByRecordKey: new Map(),
        b50ByChartKey: new Map(),
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
});
