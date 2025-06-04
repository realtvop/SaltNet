import type { DivingFishFullRecord } from "@/divingfish/type";
import type { Chart } from "@/types/music";

export enum ChartDataType {
    Chart,
    DivingFishFullRecord,
}
export function checkChartDataType(chart: Chart | DivingFishFullRecord) {
    return "song_id" in chart ? ChartDataType.DivingFishFullRecord : ChartDataType.Chart;
}
export const getChartInfo = {
    // 信息
    musicIdString: (chart: Chart | DivingFishFullRecord) => {
        const id =
            checkChartDataType(chart) === ChartDataType.Chart
                ? (chart as Chart).music.info.id
                : (chart as DivingFishFullRecord).song_id;
        return `${"0".repeat(5 - id.toString().length)}${id}`;
    },
    title: (chart: Chart | DivingFishFullRecord) =>
        checkChartDataType(chart) === ChartDataType.Chart
            ? (chart as Chart).music.info.title
            : (chart as DivingFishFullRecord).title,
    type: (chart: Chart | DivingFishFullRecord) =>
        checkChartDataType(chart) === ChartDataType.Chart
            ? (chart as Chart).music.info.type
            : (chart as DivingFishFullRecord).type,
    constant: (chart: Chart | DivingFishFullRecord) =>
        checkChartDataType(chart) === ChartDataType.Chart
            ? (chart as Chart).info.constant
            : (chart as DivingFishFullRecord).ds,
    grade: (chart: Chart | DivingFishFullRecord) =>
        checkChartDataType(chart) === ChartDataType.Chart
            ? (chart as Chart).info.grade
            : (chart as DivingFishFullRecord).level_index,
    // 成绩
    deluxeRating: (chart: Chart | DivingFishFullRecord) =>
        checkChartDataType(chart) === ChartDataType.Chart
            ? ((chart as Chart).score?.deluxeRating ?? null)
            : (chart as DivingFishFullRecord).ra,
    achievements: (chart: Chart | DivingFishFullRecord) =>
        checkChartDataType(chart) === ChartDataType.Chart
            ? ((chart as Chart).score?.achievements ?? null)
            : (chart as DivingFishFullRecord).achievements,
    rankRate: (chart: Chart | DivingFishFullRecord) =>
        checkChartDataType(chart) === ChartDataType.Chart
            ? ((chart as Chart).score?.rankRate ?? null)
            : (chart as DivingFishFullRecord).rate,
    comboStatus: (chart: Chart | DivingFishFullRecord) =>
        checkChartDataType(chart) === ChartDataType.Chart
            ? ((chart as Chart).score?.comboStatus ?? null)
            : (chart as DivingFishFullRecord).fc,
    syncStatus: (chart: Chart | DivingFishFullRecord) =>
        checkChartDataType(chart) === ChartDataType.Chart
            ? ((chart as Chart).score?.syncStatus ?? null)
            : (chart as DivingFishFullRecord).fs,
};
