import type { Chart, ChartScore } from "../music/type";
import type { User } from "../user/type";
import { getDetailedRatingsByConstant } from "../chart/rating";

export type RatingDisplayMode = "简洁" | "吃分" | "完整";

export const ratingModeOrder: RatingDisplayMode[] = ["简洁", "吃分", "完整"];

export type RatingTableEntry = ReturnType<typeof getDetailedRatingsByConstant>[number];

export interface ChartRatingTables {
    all: RatingTableEntry[];
    filtered: RatingTableEntry[];
    current: RatingTableEntry[];
}

// 指定难度的 Rating 阶段表
export function getChartRatingTables(
    chart: Chart | null,
    score: ChartScore | null | undefined,
    mode: RatingDisplayMode
): ChartRatingTables {
    if (!chart)
        return {
            all: [],
            filtered: [],
            current: [],
        };

    const all = getDetailedRatingsByConstant(chart.info.constant);
    // 当前的和能吃分的
    const filtered =
        score && score.achievements
            ? getDetailedRatingsByConstant(chart.info.constant, score.achievements)
            : all;

    return {
        all,
        filtered,
        current: mode === "完整" ? all : filtered,
    };
}

export function getAvailableRatingDisplayModes(tables: ChartRatingTables): RatingDisplayMode[] {
    const modes: RatingDisplayMode[] = ["简洁"];
    if (tables.filtered.length > 3) {
        modes.push("吃分");
    }
    modes.push("完整");
    return modes;
}

export function resolveRatingDisplayMode(
    preferred: RatingDisplayMode,
    available: RatingDisplayMode[]
): RatingDisplayMode {
    if (available.includes(preferred)) return preferred;

    const preferredIndex = ratingModeOrder.indexOf(preferred);
    for (let i = preferredIndex - 1; i >= 0; i--) {
        const fallback = ratingModeOrder[i];
        if (available.includes(fallback)) return fallback;
    }

    return available[0] ?? "简洁";
}

// 获取指定难度的显示 Rating 阶段表
export function selectDisplayedRaTable(
    raTable: RatingTableEntry[],
    mode: RatingDisplayMode,
    getBaseRa: () => number | null
): RatingTableEntry[] {
    if (mode === "简洁") {
        // 简洁模式：显示第一个、最后两个，以及最后一个加分项
        if (raTable.length <= 3) {
            return raTable;
        }

        const displayItems = [raTable[0], ...raTable.slice(-2)];
        const baseRa = getBaseRa();

        if (typeof baseRa !== "number") {
            return displayItems;
        }

        const lastBonusItem = [...raTable].reverse().find(item => item.rating > baseRa);
        if (!lastBonusItem) {
            return displayItems;
        }

        const existed = displayItems.some(
            item =>
                item.achievements === lastBonusItem.achievements &&
                item.rating === lastBonusItem.rating
        );

        if (!existed) {
            displayItems.splice(1, 0, lastBonusItem);
        }

        return displayItems;
    } else {
        // 吃分和完整模式：显示全部
        return raTable;
    }
}

// 当前用户在指定类别的最低rating
export function getLowestRaInSection(user: User | null, chart: Chart | null): number | null {
    if (!user || !chart) return null;
    const section = chart.music.info.isNew ? user.data.b50?.dx : user.data.b50?.sd;
    if (!section) return null;
    return section[section.length - 1].ra;
}

export function getLowestRaInChartOrSection(
    dialogChart: Chart | null,
    chartScore: ChartScore | null | undefined,
    sectionLowest: number | null
): number | null {
    if (!dialogChart) return null;

    const chart = chartScore ? chartScore.deluxeRating : null;
    const section = sectionLowest;

    if (!chart || !section) return chart || section;
    return Math.max(chart, section);
}
