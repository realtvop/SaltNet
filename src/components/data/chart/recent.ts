import type { Chart } from "@/components/data/music/type";

// prettier-ignore
export const BASE_DIFFICULTY_TABS: string[] = [
    "ALL",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "7+",
    "8",
    "8+",
    "9",
    "9+",
    "10",
    "10+",
    "11",
    "11+",
    "12",
    "12+",
    "13",
    "13+",
    "14",
    "14+",
    "15",
];

// prettier-ignore
export const DIFFICULTY_TABS: string[] = [
    "ALL",
    "最近",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "7+",
    "8",
    "8+",
    "9",
    "9+",
    "10",
    "10+",
    "11",
    "11+",
    "12",
    "12+",
    "13",
    "13+",
    "14",
    "14+",
    "15",
];

export function getDifficultyTabs(reverse: boolean, includeRecent: boolean = true): string[] {
    const tabs = includeRecent ? DIFFICULTY_TABS : BASE_DIFFICULTY_TABS;
    if (!reverse) return [...tabs];
    if (includeRecent) {
        return [tabs[0], tabs[1], ...tabs.slice(2).reverse()];
    }
    return [tabs[0], ...tabs.slice(1).reverse()];
}

export function hasAnyScoreChangedTime(charts: Chart[] | null | undefined): boolean {
    if (!charts || !charts.length) return false;
    return charts.some(
        c => typeof c.score?.lastChangedAt === "number" && c.score.lastChangedAt > 0
    );
}

export function getRecentCharts(charts: Chart[], limit: number = 50): Chart[] {
    return charts
        .filter(
            (chart: Chart) =>
                typeof chart.score?.lastChangedAt === "number" && chart.score.lastChangedAt > 0
        )
        .sort((a: Chart, b: Chart) => {
            const diff = b.score!.lastChangedAt! - a.score!.lastChangedAt!;
            if (diff !== 0) return diff;
            const achA = a.score?.achievements ?? 0;
            const achB = b.score?.achievements ?? 0;
            return achB - achA;
        })
        .slice(0, limit);
}
