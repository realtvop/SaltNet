import { describe, expect, it } from "vitest";
import type { Chart } from "@/components/data/music/type";
import { ChartType } from "@/components/data/maiTypes";
import { getDifficultyTabs, getRecentCharts } from "./recent";

function createMockChart(id: number, lastChangedAt?: number, achievements?: number): Chart {
    const chart: Chart = {
        id,
        music: {
            id,
            info: {
                id,
                title: `Song ${id}`,
                artist: `Artist ${id}`,
                genre: "POPSアニメ" as any,
                bpm: 150,
                from: "maimai" as any,
                isNew: false,
                type: ChartType.Deluxe,
            },
            charts: [],
        },
        info: {
            notes: [100, 20, 10, 5],
            grade: 3,
            level: "13",
            charter: "Charter",
            constant: 13.0,
            deluxeScoreMax: 1200,
        },
        score:
            lastChangedAt !== undefined
                ? {
                      achievements: achievements ?? 100.0,
                      comboStatus: "" as any,
                      syncStatus: "" as any,
                      rankRate: "SSS" as any,
                      deluxeScore: 1000,
                      deluxeRating: 200,
                      lastChangedAt,
                  }
                : undefined,
    };
    return chart;
}

describe("getDifficultyTabs", () => {
    it("places 最近 directly to the right of ALL in default order", () => {
        const tabs = getDifficultyTabs(false);
        expect(tabs[0]).toBe("ALL");
        expect(tabs[1]).toBe("最近");
        expect(tabs[2]).toBe("1");
        expect(tabs[tabs.length - 1]).toBe("15");
    });

    it("keeps ALL and 最近 first while reversing numerical difficulty tabs when reversed", () => {
        const tabs = getDifficultyTabs(true);
        expect(tabs[0]).toBe("ALL");
        expect(tabs[1]).toBe("最近");
        expect(tabs[2]).toBe("15");
        expect(tabs[tabs.length - 1]).toBe("1");
    });
});

describe("getRecentCharts", () => {
    it("filters out charts without lastChangedAt", () => {
        const charts: Chart[] = [
            createMockChart(1, 1000),
            createMockChart(2, undefined),
            createMockChart(3, 2000),
        ];

        const recent = getRecentCharts(charts);
        expect(recent).toHaveLength(2);
        expect(recent.map(c => c.music.id)).toEqual([3, 1]);
    });

    it("sorts by lastChangedAt descending (newest first)", () => {
        const charts: Chart[] = [
            createMockChart(1, 100),
            createMockChart(2, 500),
            createMockChart(3, 300),
            createMockChart(4, 900),
        ];

        const recent = getRecentCharts(charts);
        expect(recent.map(c => c.music.id)).toEqual([4, 2, 3, 1]);
    });

    it("breaks ties by achievements descending", () => {
        const charts: Chart[] = [
            createMockChart(1, 500, 99.5),
            createMockChart(2, 500, 100.5),
            createMockChart(3, 500, 100.0),
        ];

        const recent = getRecentCharts(charts);
        expect(recent.map(c => c.music.id)).toEqual([2, 3, 1]);
    });

    it("limits results to 50 charts", () => {
        const charts: Chart[] = Array.from({ length: 70 }, (_, i) =>
            createMockChart(i + 1, (i + 1) * 10)
        );

        const recent = getRecentCharts(charts, 50);
        expect(recent).toHaveLength(50);
        expect(recent[0].music.id).toBe(70);
        expect(recent[49].music.id).toBe(21);
    });
});
