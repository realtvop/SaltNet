import type { DivingFishFullRecord } from "@/components/integrations/diving-fish/type";
import type { Chart } from "@/components/data/music/type";
import type { DetailedData } from "@/components/data/user/type";
import { getSaltNetMusicIdForChartType } from "@/components/data/music/saltmeta";
import { isUtageGrade } from "./difficulty";

function isSameConstant(a: number, b: number): boolean {
    return Math.abs(a - b) < 0.05;
}

function getRecordMusicId(record: DivingFishFullRecord): number {
    return getSaltNetMusicIdForChartType(record.song_id, record.type);
}

export function findDetailedScoreForChart(
    detailed: DetailedData | undefined,
    chart: Chart | null | undefined
): DivingFishFullRecord | undefined {
    if (!detailed || !chart) return undefined;

    const exact = detailed[`${chart.music.id}-${chart.info.grade}`];
    if (exact && getRecordMusicId(exact) === chart.music.id) return exact;

    const sameChart = Object.values(detailed).find(
        record =>
            getRecordMusicId(record) === chart.music.id && record.level_index === chart.info.grade
    );
    if (sameChart) return sameChart;

    if (!isUtageGrade(chart.info.grade)) return undefined;

    const candidates = Object.values(detailed).filter(
        record => getRecordMusicId(record) === chart.music.id && record.type === "DX"
    );
    if (candidates.length === 0) return undefined;

    const sameLevel = candidates.filter(record => record.level === chart.info.level);
    const levelMatched = sameLevel.length > 0 ? sameLevel : candidates;

    const sameConstant = levelMatched.filter(record =>
        isSameConstant(record.ds, chart.info.constant)
    );
    const narrowed = sameConstant.length > 0 ? sameConstant : levelMatched;

    const utageCharts = chart.music.charts.filter(sibling => isUtageGrade(sibling.info.grade));
    const siblingIndex = utageCharts.findIndex(sibling => sibling.id === chart.id);
    if (siblingIndex === -1) return narrowed[0];

    const orderedCandidates = [...narrowed].sort(
        (a, b) => a.level_index - b.level_index || a.ds - b.ds
    );

    return orderedCandidates[siblingIndex] ?? orderedCandidates[0];
}
