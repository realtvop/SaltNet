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

export function formatScoreChangedAt(timestamp: number): string {
    if (!timestamp || !Number.isFinite(timestamp)) return "";
    const date = new Date(timestamp);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${d} ${hh}:${mm}`;
}

export function sortRecentGroupCharts(charts: Chart[]): Chart[] {
    return [...charts].sort((a: Chart, b: Chart) => {
        const achA = a.score?.achievements ?? 0;
        const achB = b.score?.achievements ?? 0;
        if (achB !== achA) return achB - achA;
        const raA = a.score?.deluxeRating ?? 0;
        const raB = b.score?.deluxeRating ?? 0;
        if (raB !== raA) return raB - raA;
        const constA = a.info.constant ?? 0;
        const constB = b.info.constant ?? 0;
        if (constB !== constA) return constB - constA;
        const dxA = a.score?.deluxeScore ?? 0;
        const dxB = b.score?.deluxeScore ?? 0;
        return dxB - dxA;
    });
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
            if (achB !== achA) return achB - achA;
            const raA = a.score?.deluxeRating ?? 0;
            const raB = b.score?.deluxeRating ?? 0;
            if (raB !== raA) return raB - raA;
            const constA = a.info.constant ?? 0;
            const constB = b.info.constant ?? 0;
            return constB - constA;
        })
        .slice(0, limit);
}

export interface RecentChartSection {
    timestamp: number;
    title: string;
    items: Chart[];
}

export function getRecentChartSections(charts: Chart[], limit: number = 50): RecentChartSection[] {
    const recentCharts = getRecentCharts(charts, limit);
    const groups = new Map<number, Chart[]>();
    for (const chart of recentCharts) {
        const timestamp = chart.score?.lastChangedAt ?? 0;
        const existing = groups.get(timestamp);
        if (existing) {
            existing.push(chart);
        } else {
            groups.set(timestamp, [chart]);
        }
    }
    return Array.from(groups.entries())
        .sort(([tsA], [tsB]) => tsB - tsA)
        .map(([timestamp, items]) => ({
            timestamp,
            title: formatScoreChangedAt(timestamp),
            items: sortRecentGroupCharts(items),
        }));
}
