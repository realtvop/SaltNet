import type { VersionPlate, VersionPlateCategory } from "../collection/type";
import type { Course } from "../course";
import type { Chart, ChartScore } from "../music/type";
import { getChartDifficultyFullLabel, UTAGE_GRADE } from "../chart/difficulty";
import {
    DIFFICULTY_TABS,
    formatScoreChangedAt,
    getRecentCharts,
    sortRecentGroupCharts,
} from "../chart/recent";
import { checkCollectionChartFinish, getCollectionCharts } from "../collection/versionPlate";
import { getCourseCharts } from "../course";
import { ComboStatus, RankRate, SyncStatus } from "../mai/types";
import { createMusicSearchQuery, matchesMusicSearchIndex } from "../music/search";

/**
 * Query logic of the songs page: ordering, category filtering, position indexes, text search,
 * grouping and statistics. Every function takes its inputs explicitly so it can run without the
 * page's reactive state.
 */

export enum SongsCategory {
    InGame = "难度",
    Version = "版本",
    Favorite = "收藏夹",
    Banquet = "宴会场",
    Kaleidxscope = "万花筒",
    Course = "段位",
}

export type SongsGroupBy = "none" | "constant" | "version" | "rank" | "combo" | "sync";
export type SongsVersionGroupBy = "none" | "level" | "difficulty" | "rank" | "combo" | "sync";

/** The part of a favorite list the page needs: its name and the music ids it holds. */
export interface SongsFavoriteList {
    name: string;
    charts: Array<{ i: number }>;
}

export interface ChartStats {
    sss: number;
    sssp: number;
    fc: number;
    ap: number;
    fsdx: number;
}

export interface ChartGroup {
    title: string;
    count: number;
    stats: ChartStats;
    items: Chart[];
}

// MARK: default order

/**
 * Orders charts the way the game lists them: by grade, then by the music's position in
 * `musicSort`, both descending. Music missing from `musicSort` sorts as -1.
 */
export function createGameOrderComparator(
    musicSort: readonly number[]
): (a: Chart, b: Chart) => number {
    const musicSortOrder = new Map<number, number>(musicSort.map((id, index) => [id, index]));

    function getMusicSortIndex(chart: Chart): number {
        return musicSortOrder.get(chart.music.id) ?? -1;
    }

    return (a, b) =>
        getMusicSortIndex(b) + b.info.grade * 100000 - getMusicSortIndex(a) - a.info.grade * 100000;
}

/**
 * Puts charts with a numeric achievement first, best first. Because sorting is stable the others
 * keep their previous order.
 */
export function createPlayedFirstComparator(
    findScore: (chart: Chart) => { achievements: number } | undefined
): (a: Chart, b: Chart) => number {
    return (a, b) => {
        const chartDataA = findScore(a);
        const chartDataB = findScore(b);
        const playedA = typeof chartDataA?.achievements === "number";
        const playedB = typeof chartDataB?.achievements === "number";
        if (playedA && playedB) return chartDataB.achievements - chartDataA.achievements;
        if (playedA) return -1;
        if (playedB) return 1;
        return 0;
    };
}

// MARK: filtering

export interface CategoryFilterInput {
    /** Every chart, already in default order. */
    charts: Chart[];
    category: SongsCategory | VersionPlateCategory;
    /** The selected tab of the active category. */
    selectedTab: string;
    /** Grade shown by the "ALL", version and favorite tabs. */
    difficultyFilter: number;
    favorites: readonly SongsFavoriteList[];
    selectedCourse: Course | null;
    versionPlates: Record<VersionPlateCategory, VersionPlate[]>;
    /** `"constant-desc"`, `"constant-asc"`, or anything else for the plate's own condition order. */
    plateSort: string;
}

/** The charts the active category and tab show, before search and position indexes. */
export function filterChartsForCategory(input: CategoryFilterInput): Chart[] {
    const {
        charts: allCharts,
        category,
        selectedTab,
        difficultyFilter,
        favorites,
        selectedCourse,
        versionPlates,
        plateSort,
    } = input;
    let filteredCharts: Chart[];

    // 根据当前分类模式筛选曲目
    if (category === SongsCategory.InGame) {
        // 游戏内难度模式
        if (selectedTab === "ALL") {
            filteredCharts = allCharts.filter(
                (chart: Chart) => chart.info.grade === difficultyFilter
            );
        } else if (selectedTab === "最近") {
            filteredCharts = getRecentCharts(allCharts);
        } else {
            filteredCharts = allCharts.filter((chart: Chart) => chart.info.level === selectedTab);
        }
    } else if (category === SongsCategory.Banquet) {
        // 宴会场模式
        if (selectedTab === "ALL") {
            filteredCharts = allCharts.filter(
                (chart: Chart) => chart.info.grade === UTAGE_GRADE && chart.info.level.endsWith("?")
            );
        } else {
            filteredCharts = allCharts.filter((chart: Chart) => chart.info.level === selectedTab);
        }
    } else if (category === SongsCategory.Version) {
        // 版本模式
        // 创建版本名称映射
        const versionMapping: Record<string, string> = {};

        const targetVersion = versionMapping[selectedTab] || selectedTab;
        filteredCharts = allCharts.filter((chart: Chart) => {
            const matchVersion = (chart.music.info.from as unknown as string) === targetVersion;
            if (!matchVersion) return false;
            return chart.info.grade === difficultyFilter;
        });
    } else if (category === SongsCategory.Favorite) {
        // 收藏夹模式
        const currentFavorite = favorites.find(f => f.name === selectedTab);
        if (!currentFavorite) {
            filteredCharts = [];
        } else {
            // 根据收藏夹中的曲目ID和指定难度筛选
            const favoriteChartIds = new Set(
                currentFavorite.charts.map(fc => `${fc.i}-${difficultyFilter}`)
            );
            filteredCharts = allCharts.filter((chart: Chart) =>
                favoriteChartIds.has(`${chart.music.id}-${chart.info.grade}`)
            );
        }
    } else if (category === SongsCategory.Kaleidxscope) {
        // 万花筒有独立的钥匙条件、血量日历与抽选曲池视图。
        filteredCharts = [];
    } else if (category === SongsCategory.Course) {
        filteredCharts = selectedCourse ? getCourseCharts(selectedCourse, allCharts) : [];
    } else if (category in versionPlates) {
        // 牌子模式
        const plateType = category as VersionPlateCategory;
        // 通过第一个字找到完整的牌子名称
        const selectedPlate = versionPlates[plateType]?.find(plate => plate.name === selectedTab);

        if (!selectedPlate) {
            filteredCharts = [];
        } else {
            filteredCharts = getCollectionCharts(selectedPlate, allCharts);

            // 按照牌子的达成条件进行排序
            if (plateSort === "constant-desc") {
                // 按定数排序（从高到低）
                filteredCharts.sort((a, b) => {
                    const constantA = a.info.constant || 0;
                    const constantB = b.info.constant || 0;
                    return constantB - constantA;
                });
            } else if (plateSort === "constant-asc") {
                // 按定数排序（从低到高）
                filteredCharts.sort((a, b) => {
                    const constantA = a.info.constant || 0;
                    const constantB = b.info.constant || 0;
                    return constantA - constantB;
                });
            } else {
                // 按条件排序（原有逻辑）
                filteredCharts.sort((a, b) => {
                    const scoreA = a.score;
                    const scoreB = b.score;
                    const completedA = checkCollectionChartFinish(selectedPlate, a);
                    const completedB = checkCollectionChartFinish(selectedPlate, b);

                    // 已完成的排在前面
                    if (completedA && !completedB) return -1;
                    if (!completedA && completedB) return 1;

                    // 同样完成状态下按达成率排序
                    if (
                        typeof scoreA?.achievements === "number" &&
                        typeof scoreB?.achievements === "number"
                    ) {
                        return scoreB.achievements - scoreA.achievements;
                    }

                    return 0;
                });
            }
        }
    } else {
        filteredCharts = [];
    }

    return filteredCharts;
}

function getChartBaseScore(chart: Chart): ChartScore {
    return (
        chart.score ?? {
            rankRate: "" as any,
            achievements: null,
            comboStatus: "" as any,
            syncStatus: "" as any,
            deluxeScore: 0,
            deluxeRating: 0,
        }
    );
}

// MARK: position indexes and search

/**
 * Attaches `score.index.all` (position among every chart of the same grade) and
 * `score.index.difficult` (position within `filteredCharts`) to each filtered chart.
 */
export function addChartPositionIndexes(allCharts: Chart[], filteredCharts: Chart[]) {
    const allChartsByGrade: Record<number, Chart[]> = {};
    const gradeChartPositions = new Map<Chart, number>();
    [0, 1, 2, 3, 4, 10].forEach(grade => {
        allChartsByGrade[grade] = allCharts.filter((chart: Chart) => chart.info.grade === grade);
        allChartsByGrade[grade].forEach((chart, index, gradeCharts) => {
            gradeChartPositions.set(chart, gradeCharts.length - index);
        });
    });

    // 先给所有符合难度条件的曲目添加原始排序索引
    const chartsWithOriginalIndex = filteredCharts.map((chart, index) => {
        const gradeCharts = allChartsByGrade[chart.info.grade] || [];
        return {
            ...chart,
            score: {
                ...getChartBaseScore(chart),
                index: {
                    all: {
                        index: gradeChartPositions.get(chart) ?? 0,
                        total: gradeCharts.length,
                    },
                    difficult: {
                        index: filteredCharts.length - index,
                        total: filteredCharts.length,
                    },
                },
            },
        };
    });

    return chartsWithOriginalIndex;
}

/** Keeps the charts matching `queryText` by title, alias, id, achievements or combo/sync status. */
export function searchCharts<T extends Chart>(charts: T[], queryText: string): T[] {
    if (!queryText) return charts;

    const searchTerms = createMusicSearchQuery(queryText);
    return charts.filter(chart => {
        const chartData = chart.score;
        return (
            matchesMusicSearchIndex(chart.music.info.searchIndex, searchTerms) ||
            matchesMusicSearchIndex(chart.info.searchIndex, searchTerms) ||
            chart.music.info.id.toString() === queryText ||
            (chartData &&
                // 达成率 fc sync
                (chartData.achievements?.toString().includes(queryText) ||
                    chartData.comboStatus?.toString().includes(queryText) ||
                    chartData.syncStatus?.toString().includes(queryText)))
        );
    });
}

/**
 * Adds `score.index.queried` after searching. `total` is the number of charts before the search
 * (the size of the category result), which is also what the position counts down from.
 */
export function addQueriedPositionIndexes(
    finalFilteredCharts: ReturnType<typeof addChartPositionIndexes>,
    total: number
) {
    // 使用原始排序索引而不是重新计算
    const chartsWithIndex = finalFilteredCharts.map((chart, index) => {
        return {
            ...chart,
            score: {
                ...getChartBaseScore(chart),
                index: {
                    all: chart.score.index!.all,
                    difficult: chart.score.index!.difficult,
                    queried: {
                        index: total - index,
                        total,
                    },
                },
            },
        };
    });

    return chartsWithIndex;
}

// MARK: statistics and grouping

export function countChartStats(charts: Chart[]): ChartStats {
    let sss = 0,
        sssp = 0,
        fc = 0,
        ap = 0,
        fsdx = 0;
    charts.forEach(chart => {
        const s = chart.score;
        if (s?.achievements != null) {
            if (s.achievements >= 100.5) sssp++;
            else if (s.achievements >= 100.0) sss++;
        }
        if (s?.comboStatus) {
            if (
                [ComboStatus.AllPerfect, ComboStatus.AllPerfectPlus].includes(
                    s.comboStatus as ComboStatus
                )
            )
                ap++;
            if (
                [
                    ComboStatus.FullCombo,
                    ComboStatus.FullComboPlus,
                    ComboStatus.AllPerfect,
                    ComboStatus.AllPerfectPlus,
                ].includes(s.comboStatus as ComboStatus)
            )
                fc++;
        }
        if (
            s?.syncStatus &&
            [SyncStatus.FullSyncDX, SyncStatus.FullSyncDXPlus].includes(s.syncStatus as SyncStatus)
        )
            fsdx++;
    });
    return { sss, sssp, fc, ap, fsdx };
}

const rankOrder = [
    RankRate.sssp,
    RankRate.sss,
    RankRate.ssp,
    RankRate.ss,
    RankRate.sp,
    RankRate.s,
    RankRate.aaa,
    RankRate.aa,
    RankRate.a,
    RankRate.bbb,
    RankRate.bb,
    RankRate.b,
    RankRate.c,
    RankRate.d,
];
const comboOrder = [
    ComboStatus.AllPerfectPlus,
    ComboStatus.AllPerfect,
    ComboStatus.FullComboPlus,
    ComboStatus.FullCombo,
    ComboStatus.None,
];
const syncOrder = [
    SyncStatus.FullSyncDXPlus,
    SyncStatus.FullSyncDX,
    SyncStatus.FullSyncPlus,
    SyncStatus.FullSync,
    SyncStatus.Sync,
    SyncStatus.None,
];

const rankDisplayNames: Record<string, string> = {
    [RankRate.sssp]: "SSS+",
    [RankRate.sss]: "SSS",
    [RankRate.ssp]: "SS+",
    [RankRate.ss]: "SS",
    [RankRate.sp]: "S+",
    [RankRate.s]: "S",
    [RankRate.aaa]: "AAA",
    [RankRate.aa]: "AA",
    [RankRate.a]: "A",
    [RankRate.bbb]: "BBB",
    [RankRate.bb]: "BB",
    [RankRate.b]: "B",
    [RankRate.c]: "C",
    [RankRate.d]: "D",
    "": "未游玩",
};
const comboDisplayNames: Record<string, string> = {
    [ComboStatus.AllPerfectPlus]: "All Perfect+",
    [ComboStatus.AllPerfect]: "All Perfect",
    [ComboStatus.FullComboPlus]: "Full Combo+",
    [ComboStatus.FullCombo]: "Full Combo",
    [ComboStatus.None]: "无",
};
const syncDisplayNames: Record<string, string> = {
    [SyncStatus.FullSyncDXPlus]: "Full Sync DX+",
    [SyncStatus.FullSyncDX]: "Full Sync DX",
    [SyncStatus.FullSyncPlus]: "Full Sync+",
    [SyncStatus.FullSync]: "Full Sync",
    [SyncStatus.Sync]: "Sync",
    [SyncStatus.None]: "无",
};

export interface GroupChartsInput {
    /** The charts shown by the active tab. */
    charts: Chart[];
    category: SongsCategory | VersionPlateCategory;
    selectedTab: string;
    groupBy: SongsGroupBy;
    versionGroupBy: SongsVersionGroupBy;
    /** Version names, oldest first; groups of a version sort by position in this list. */
    versions: readonly string[];
}

/**
 * Splits the shown charts into titled groups with per-group statistics, or returns null when the
 * active category and tab have no grouping (or nothing to group).
 */
export function groupCharts(input: GroupChartsInput): ChartGroup[] | null {
    const { charts, category, selectedTab, groupBy, versionGroupBy, versions } = input;
    const isRecent = category === SongsCategory.InGame && selectedTab === "最近";
    const isInGame =
        category === SongsCategory.InGame &&
        groupBy !== "none" &&
        selectedTab !== "ALL" &&
        selectedTab !== "最近";
    const isVersion = category === SongsCategory.Version && versionGroupBy !== "none";
    const isFavorite = category === SongsCategory.Favorite && versionGroupBy !== "none";

    if (!isRecent && !isInGame && !isVersion && !isFavorite) return null;

    const activeGroupBy = isRecent ? "recent" : isVersion || isFavorite ? versionGroupBy : groupBy;

    if (!charts.length) return null;

    const groups: Record<string, Chart[]> = {};
    charts.forEach(chart => {
        let key: string;
        if (activeGroupBy === "recent") {
            key = String(chart.score?.lastChangedAt ?? 0);
        } else if (activeGroupBy === "level") {
            key = chart.info.level;
        } else if (activeGroupBy === "version") {
            key = chart.music.info.from as unknown as string;
        } else if (activeGroupBy === "constant") {
            key = chart.info.constant.toFixed(1);
        } else if (activeGroupBy === "difficulty") {
            key = String(chart.info.grade);
        } else if (activeGroupBy === "rank") {
            key = (chart.score?.rankRate as string) || "";
        } else if (activeGroupBy === "combo") {
            key = (chart.score?.comboStatus as string) || "";
        } else {
            key = (chart.score?.syncStatus as string) || "";
        }
        if (!groups[key]) groups[key] = [];
        groups[key].push(chart);
    });

    const sortFn = (a: [string, Chart[]], b: [string, Chart[]]) => {
        if (activeGroupBy === "recent") return Number(b[0]) - Number(a[0]);
        if (activeGroupBy === "level") {
            const ia = DIFFICULTY_TABS.indexOf(a[0]);
            const ib = DIFFICULTY_TABS.indexOf(b[0]);
            return ib - ia;
        }
        if (activeGroupBy === "constant") return Number(b[0]) - Number(a[0]);
        if (activeGroupBy === "version") {
            const orderA = versions.indexOf(a[0]);
            const orderB = versions.indexOf(b[0]);
            return (orderB === -1 ? 999 : orderB) - (orderA === -1 ? 999 : orderA);
        }
        if (activeGroupBy === "difficulty") return Number(a[0]) - Number(b[0]);
        if (activeGroupBy === "rank") {
            const ia = rankOrder.indexOf(a[0] as RankRate),
                ib = rankOrder.indexOf(b[0] as RankRate);
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        }
        if (activeGroupBy === "combo") {
            const ia = comboOrder.indexOf(a[0] as ComboStatus),
                ib = comboOrder.indexOf(b[0] as ComboStatus);
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        }
        const ia = syncOrder.indexOf(a[0] as SyncStatus),
            ib = syncOrder.indexOf(b[0] as SyncStatus);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    };

    const displayNames =
        activeGroupBy === "rank"
            ? rankDisplayNames
            : activeGroupBy === "combo"
              ? comboDisplayNames
              : activeGroupBy === "sync"
                ? syncDisplayNames
                : null;

    return Object.entries(groups)
        .sort(sortFn)
        .map(([key, items]) => {
            let title: string;
            if (activeGroupBy === "recent") {
                title = formatScoreChangedAt(Number(key));
            } else if (displayNames) {
                title = displayNames[key] || key;
            } else if (activeGroupBy === "difficulty") {
                title = getChartDifficultyFullLabel(Number(key));
            } else {
                title = key;
            }

            const sortedItems = activeGroupBy === "recent" ? sortRecentGroupCharts(items) : items;

            return {
                title,
                count: sortedItems.length,
                stats: countChartStats(sortedItems),
                items: sortedItems,
            };
        });
}
