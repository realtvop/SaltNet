import type { DivingFishFullRecord } from "@/components/integrations/diving-fish/type";
import type { DetailedData } from "../type";
import { getSaltNetMusicIdForChartType } from "../../music/saltmeta";
import { ScoreHistoryChange, type ScoreHistoryCandidate, type ScoreHistoryStateV1 } from "./type";

export function getScoreHistoryChartKey(record: DivingFishFullRecord): string {
    const musicId = getSaltNetMusicIdForChartType(record.song_id, record.type);
    return `${musicId}-${record.level_index}`;
}

export function toScoreHistoryState(record: DivingFishFullRecord): ScoreHistoryStateV1 {
    return {
        achievements: record.achievements,
        dxScore: record.dxScore,
        fc: record.fc,
        fs: record.fs,
        playCount:
            typeof record.play_count === "number" && Number.isFinite(record.play_count)
                ? record.play_count
                : null,
    };
}

export function getScoreHistoryChangedMask(
    before: ScoreHistoryStateV1,
    after: ScoreHistoryStateV1
): number {
    let mask = 0;
    if (before.achievements !== after.achievements) mask |= ScoreHistoryChange.Achievements;
    if (before.dxScore !== after.dxScore) mask |= ScoreHistoryChange.DxScore;
    if (before.fc !== after.fc) mask |= ScoreHistoryChange.ComboStatus;
    if (before.fs !== after.fs) mask |= ScoreHistoryChange.SyncStatus;
    if (before.playCount !== after.playCount) mask |= ScoreHistoryChange.PlayCount;
    return mask;
}

export function createScoreHistoryCandidates(
    existing: DetailedData | undefined,
    incoming: DivingFishFullRecord[],
    observedAt: number
): ScoreHistoryCandidate[] {
    const candidates: ScoreHistoryCandidate[] = [];
    const seen = new Set<string>();

    for (const record of incoming) {
        const chartKey = getScoreHistoryChartKey(record);
        if (seen.has(chartKey)) continue;
        seen.add(chartKey);

        const after = toScoreHistoryState(record);
        const previous = existing?.[chartKey];
        if (!previous) {
            candidates.push({
                chartKey,
                observedAt,
                kind: "initial",
                changedMask: 0,
                before: null,
                after,
                previousObservedAt: null,
            });
            continue;
        }

        const before = toScoreHistoryState(previous);
        const changedMask = getScoreHistoryChangedMask(before, after);
        if (!changedMask) continue;
        candidates.push({
            chartKey,
            observedAt,
            kind: "change",
            changedMask,
            before,
            after,
            previousObservedAt:
                typeof previous.lastChangedAt === "number" &&
                Number.isFinite(previous.lastChangedAt)
                    ? previous.lastChangedAt
                    : null,
        });
    }

    return candidates;
}

export function getExistingScoreData(
    detailed: DetailedData | undefined,
    b50: { sd: DivingFishFullRecord[]; dx: DivingFishFullRecord[] } | undefined
): DetailedData | undefined {
    if (!detailed && !b50) return undefined;

    const result: DetailedData = { ...detailed };
    for (const record of [...(b50?.sd ?? []), ...(b50?.dx ?? [])]) {
        const chartKey = getScoreHistoryChartKey(record);
        if (!result[chartKey]) result[chartKey] = record;
    }
    return result;
}
