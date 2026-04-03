import type { Chart } from "@/components/data/music/type";

type ChartLike = Pick<Chart, "music" | "info">;

export function getChartStatsIdentity(chart: ChartLike): string {
    const notes = chart.info.notes.map(note => note ?? 0).join(",");
    const constant =
        typeof chart.info.constant === "number" && Number.isFinite(chart.info.constant)
            ? chart.info.constant.toFixed(1)
            : "";

    return [chart.music.id, chart.info.level, constant, notes].join("|");
}
