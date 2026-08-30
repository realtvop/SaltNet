import { describe, expect, it } from "vitest";
import type { Chart } from "@/components/data/music/type";
import { ChartType } from "@/components/data/maiTypes";
import {
    formatScoreChangedAt,
    getDifficultyTabs,
    getRecentCharts,
    getRecentChartSections,
    hasAnyScoreChangedTime,
    sortRecentGroupCharts,
} from "./recent";

function createMockChart(
    id: number,
    lastChangedAt?: number,
    achievements?: number,
    options?: { deluxeRating?: number; constant?: number; deluxeScore?: number }
): Chart {
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
            constant: options?.constant ?? 13.0,
            deluxeScoreMax: 1200,
        },
        score:
            lastChangedAt !== undefined
                ? {
                      achievements: achievements ?? 100.0,
                      comboStatus: "" as any,
                      syncStatus: "" as any,
                      rankRate: "SSS" as any,
                      deluxeScore: options?.deluxeScore ?? 1000,
                      deluxeRating: options?.deluxeRating ?? 200,
                      lastChangedAt,
                  }
                : undefined,
    };
    return chart;
}

describe("getDifficultyTabs", () => {
    it("places 最近 directly to the right of ALL in default order when includeRecent is true", () => {
        const tabs = getDifficultyTabs(false, true);
        expect(tabs[0]).toBe("ALL");
        expect(tabs[1]).toBe("最近");
        expect(tabs[2]).toBe("1");
        expect(tabs[tabs.length - 1]).toBe("15");
    });

    it("keeps ALL and 最近 first while reversing numerical difficulty tabs when reversed", () => {
        const tabs = getDifficultyTabs(true, true);
        expect(tabs[0]).toBe("ALL");
        expect(tabs[1]).toBe("最近");
        expect(tabs[2]).toBe("15");
        expect(tabs[tabs.length - 1]).toBe("1");
    });

    it("hides 最近 when includeRecent is false in default order", () => {
        const tabs = getDifficultyTabs(false, false);
        expect(tabs).not.toContain("最近");
        expect(tabs[0]).toBe("ALL");
        expect(tabs[1]).toBe("1");
        expect(tabs[tabs.length - 1]).toBe("15");
    });

    it("hides 最近 when includeRecent is false in reversed order", () => {
        const tabs = getDifficultyTabs(true, false);
        expect(tabs).not.toContain("最近");
        expect(tabs[0]).toBe("ALL");
        expect(tabs[1]).toBe("15");
        expect(tabs[tabs.length - 1]).toBe("1");
    });
});

describe("hasAnyScoreChangedTime", () => {
    it("returns false for null, undefined, or empty charts", () => {
        expect(hasAnyScoreChangedTime(null)).toBe(false);
        expect(hasAnyScoreChangedTime(undefined)).toBe(false);
        expect(hasAnyScoreChangedTime([])).toBe(false);
    });

    it("returns false when no chart has lastChangedAt", () => {
        const charts = [createMockChart(1), createMockChart(2)];
        expect(hasAnyScoreChangedTime(charts)).toBe(false);
    });

    it("returns true when at least one chart has lastChangedAt > 0", () => {
        const charts = [createMockChart(1), createMockChart(2, 1000)];
        expect(hasAnyScoreChangedTime(charts)).toBe(true);
    });
});

describe("formatScoreChangedAt", () => {
    it("formats epoch timestamp into a localized date string", () => {
        const ts = 1700000000000;
        expect(formatScoreChangedAt(ts)).toBe(new Date(ts).toLocaleString());
    });
});

describe("sortRecentGroupCharts", () => {
    it("sorts charts within a group by achievements descending, then rating, then constant", () => {
        const charts: Chart[] = [
            createMockChart(1, 1000, 100.0, { deluxeRating: 200, constant: 13.0 }),
            createMockChart(2, 1000, 100.5, { deluxeRating: 250, constant: 13.5 }),
            createMockChart(3, 1000, 100.0, { deluxeRating: 220, constant: 13.2 }),
            createMockChart(4, 1000, 100.0, { deluxeRating: 220, constant: 13.7 }),
        ];

        const sorted = sortRecentGroupCharts(charts);
        expect(sorted.map(c => c.music.id)).toEqual([2, 4, 3, 1]);
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

describe("getRecentChartSections", () => {
    it("groups recent charts by score change timestamp descending and sorts within groups", () => {
        const charts: Chart[] = [
            createMockChart(1, 1000, 99.0),
            createMockChart(2, 2000, 100.0),
            createMockChart(3, 1000, 100.5),
            createMockChart(4, 2000, 100.8),
            createMockChart(5, 500, 98.0),
        ];

        const sections = getRecentChartSections(charts);
        expect(sections).toHaveLength(3);
        expect(sections[0].timestamp).toBe(2000);
        expect(sections[0].title).toBe(formatScoreChangedAt(2000));
        expect(sections[0].items.map(c => c.music.id)).toEqual([4, 2]);

        expect(sections[1].timestamp).toBe(1000);
        expect(sections[1].title).toBe(formatScoreChangedAt(1000));
        expect(sections[1].items.map(c => c.music.id)).toEqual([3, 1]);

        expect(sections[2].timestamp).toBe(500);
        expect(sections[2].title).toBe(formatScoreChangedAt(500));
        expect(sections[2].items.map(c => c.music.id)).toEqual([5]);
    });
});
