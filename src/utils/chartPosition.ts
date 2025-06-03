import type { Chart, ChartExtended } from "@/types/music";
import type { User, ChartsSortCached } from "@/types/user";
import MusicSort from "@/assets/MusicSort";
import localForage from "localforage";

/**
 * 计算谱面在特定难度下的项目位置
 * @param chart 当前谱面信息
 * @param difficulty 难度等级（如 "ALL", "8+", "13" 等）
 * @param allCharts 所有谱面数据
 * @param userData 用户数据
 * @returns 项目位置字符串，格式为 "位置/总数"
 */
export function getChartPositionByDifficulty(
    chart: Chart,
    difficulty: string,
    allCharts: ChartExtended[],
    userData?: User | null
): string {
    if (!allCharts.length) return "-";

    // 按照songs.vue中的逻辑进行排序
    let sortedCharts = [...allCharts];

    // 基础排序：按MusicSort索引和难度等级排序
    sortedCharts.sort(
        (a, b) =>
            MusicSort.indexOf(b.music.id) +
            b.grade * 100000 -
            MusicSort.indexOf(a.music.id) -
            a.grade * 100000
    );

    // 如果有用户数据，按达成率排序
    if (userData?.data?.detailed) {
        sortedCharts.sort((a, b) => {
            const chartDataA = userData?.data?.detailed?.[`${a.music.id}-${a.grade}`];
            const chartDataB = userData?.data?.detailed?.[`${b.music.id}-${b.grade}`];
            if (chartDataA?.achievements && chartDataB?.achievements)
                return chartDataB.achievements - chartDataA.achievements;
            if (chartDataA?.achievements) return -1;
            if (chartDataB?.achievements) return 1;
            return 0;
        });
    }

    // 根据难度筛选
    let filteredCharts: ChartExtended[];
    if (difficulty === "ALL") {
        filteredCharts = sortedCharts.filter(c => c.grade === 3); // Master难度
    } else {
        filteredCharts = sortedCharts.filter(c => c.level === difficulty);
    }

    // 找到当前谱面在筛选后列表中的位置
    const chartIndex = filteredCharts.findIndex(
        c => c.music.id === chart.music.id && c.grade === chart.grade
    );

    if (chartIndex === -1) return "-";

    // 计算位置（从1开始计数，索引越小位置越靠后）
    const position = filteredCharts.length - chartIndex;
    const total = filteredCharts.length;

    return `${position}/${total}`;
}

/**
 * 为谱面列表添加项目位置信息
 * @param charts 谱面列表
 * @returns 带有项目位置信息的谱面列表
 */
export function addPositionToCharts(charts: ChartExtended[]): ChartExtended[] {
    // 给所有符合难度条件的曲目添加原始排序索引
    const chartsWithOriginalIndex = charts.map((chart, index) => ({
        ...chart,
        originalIndex: charts.length - index,
        totalInDifficulty: charts.length,
        index: `${charts.length - index}/${charts.length}`,
    }));

    return chartsWithOriginalIndex;
}

/**
 * 从songs.vue的缓存中获取谱面的项目位置
 * @param chart 当前谱面信息
 * @param difficulty 难度等级
 * @returns 项目位置字符串，格式为 "位置/总数"
 */
export async function getChartPositionFromCache(chart: Chart, difficulty: string): Promise<string> {
    try {
        // 从缓存中获取排序后的谱面数据
        const cachedData = await localForage.getItem<ChartsSortCached>("chartsSortCached");
        if (!cachedData || !cachedData.charts) {
            return "-";
        }

        const allCharts = cachedData.charts;

        // 根据难度筛选
        let filteredCharts: ChartExtended[];
        if (difficulty === "ALL") {
            filteredCharts = allCharts.filter(c => c.grade === 3); // Master难度
        } else {
            filteredCharts = allCharts.filter(c => c.level === difficulty);
        }

        // 找到当前谱面在筛选后列表中的位置
        const chartIndex = filteredCharts.findIndex(
            c => c.music.id === chart.music.id && c.grade === chart.grade
        );

        if (chartIndex === -1) return "-";

        // 计算位置（从1开始计数，索引越小位置越靠后）
        const position = filteredCharts.length - chartIndex;
        const total = filteredCharts.length;

        return `${position}/${total}`;
    } catch (error) {
        console.error("Failed to get chart position from cache:", error);
        return "-";
    }
}
