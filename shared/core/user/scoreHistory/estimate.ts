import type { DetailedData } from "../type";
import { ScoreHistoryChange, type ScoreHistoryEventV1 } from "./type";

export interface PlayCountEstimate {
    recordedPlayCount: number | null;
    uncountedScoreChanges: number;
    playCount: number | null;
    isEstimated: boolean;
    displayText: string;
}

export function formatPlayCount(
    playCount: number | null | undefined,
    isEstimated?: boolean
): string {
    if (playCount === null || playCount === undefined) return "未知";
    return isEstimated ? `≥ ${playCount} 次` : `${playCount} 次`;
}

export function calculatePlayCountEstimate(
    events: ScoreHistoryEventV1[],
    currentPlayCount?: number | null
): PlayCountEstimate {
    const sorted = [...events].sort(
        (a, b) => a.observedAt - b.observedAt || a.sequence - b.sequence
    );

    let uncountedScoreChanges = 0;
    let lastKnownPlayCount: number | null =
        typeof currentPlayCount === "number" && Number.isFinite(currentPlayCount)
            ? currentPlayCount
            : null;

    for (const event of sorted) {
        if (typeof event.state.playCount === "number" && Number.isFinite(event.state.playCount)) {
            lastKnownPlayCount = event.state.playCount;
        }

        if (event.kind === "change") {
            const hasScoreChange =
                (event.changedMask &
                    (ScoreHistoryChange.Achievements |
                        ScoreHistoryChange.DxScore |
                        ScoreHistoryChange.ComboStatus |
                        ScoreHistoryChange.SyncStatus)) !==
                0;
            const hasPlayCountChange = (event.changedMask & ScoreHistoryChange.PlayCount) !== 0;

            if (hasPlayCountChange) {
                uncountedScoreChanges = 0;
            } else if (hasScoreChange) {
                uncountedScoreChanges++;
            }
        }
    }

    if (uncountedScoreChanges > 0) {
        const base = lastKnownPlayCount ?? 1;
        const total = base + uncountedScoreChanges;
        return {
            recordedPlayCount: lastKnownPlayCount,
            uncountedScoreChanges,
            playCount: total,
            isEstimated: true,
            displayText: formatPlayCount(total, true),
        };
    }

    if (lastKnownPlayCount !== null) {
        return {
            recordedPlayCount: lastKnownPlayCount,
            uncountedScoreChanges: 0,
            playCount: lastKnownPlayCount,
            isEstimated: false,
            displayText: formatPlayCount(lastKnownPlayCount, false),
        };
    }

    return {
        recordedPlayCount: null,
        uncountedScoreChanges: 0,
        playCount: null,
        isEstimated: false,
        displayText: "未知",
    };
}

export function calculateUserPlayCountEstimates(
    events: ScoreHistoryEventV1[],
    currentDetailed?: DetailedData
): Map<string, PlayCountEstimate> {
    const eventsByChart = new Map<string, ScoreHistoryEventV1[]>();
    for (const event of events) {
        let chartEvents = eventsByChart.get(event.chartKey);
        if (!chartEvents) {
            chartEvents = [];
            eventsByChart.set(event.chartKey, chartEvents);
        }
        chartEvents.push(event);
    }

    const result = new Map<string, PlayCountEstimate>();

    for (const [chartKey, chartEvents] of eventsByChart) {
        const currentRecord = currentDetailed?.[chartKey];
        const estimate = calculatePlayCountEstimate(chartEvents, currentRecord?.play_count);
        result.set(chartKey, estimate);
    }

    if (currentDetailed) {
        for (const [chartKey, record] of Object.entries(currentDetailed)) {
            if (!result.has(chartKey)) {
                const estimate = calculatePlayCountEstimate([], record.play_count);
                result.set(chartKey, estimate);
            }
        }
    }

    return result;
}
