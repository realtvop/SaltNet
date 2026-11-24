import type { Chart } from "@core/music/type";
import type { ChartsSortCached } from "@core/user/type";
import { findChartPosition } from "@core/chart/position";
import localForage from "localforage";

const CHARTS_SORT_CACHE_KEY = "chartsSortCachedV2";

/**
 * 从songs.vue的缓存中获取谱面的项目位置
 * @param chart 当前谱面信息
 * @param difficulty 难度等级
 * @returns 项目位置字符串，格式为 "位置/总数"
 */
export async function getChartPositionFromCache(chart: Chart, difficulty: string): Promise<string> {
    try {
        // 从缓存中获取排序后的谱面数据
        const cachedData = await localForage.getItem<ChartsSortCached>(CHARTS_SORT_CACHE_KEY);
        if (!cachedData || !cachedData.charts) {
            return "-";
        }

        return findChartPosition(cachedData.charts, chart, difficulty);
    } catch (error) {
        console.error("Failed to get chart position from cache:", error);
        return "-";
    }
}
