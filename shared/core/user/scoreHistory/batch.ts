import type { ScoreHistoryBatch, ScoreHistoryEventV1 } from "./type";
import { SCORE_HISTORY_SCHEMA_VERSION } from "./type";

export function buildScoreHistoryBatchEvents(
    batch: ScoreHistoryBatch,
    generationId: string,
    existingChartKeys: ReadonlySet<string>
): ScoreHistoryEventV1[] {
    const events: ScoreHistoryEventV1[] = [];

    for (const candidate of batch.candidates) {
        let sequence = 0;
        if (
            candidate.kind === "change" &&
            candidate.before &&
            !existingChartKeys.has(candidate.chartKey)
        ) {
            const baselineTime = candidate.previousObservedAt ?? candidate.observedAt;
            const baseline: ScoreHistoryEventV1 = {
                id: `${generationId}:${batch.batchId}:${candidate.chartKey}:baseline`,
                schemaVersion: SCORE_HISTORY_SCHEMA_VERSION,
                generationId,
                batchId: batch.batchId,
                userUid: batch.userUid,
                chartKey: candidate.chartKey,
                observedAt: baselineTime,
                sequence: 0,
                source: batch.source,
                kind: "initial",
                changedMask: 0,
                state: candidate.before,
            };
            events.push(baseline);
            sequence = baselineTime === candidate.observedAt ? 1 : 0;
        }

        const event: ScoreHistoryEventV1 = {
            id: `${generationId}:${batch.batchId}:${candidate.chartKey}:${candidate.kind}`,
            schemaVersion: SCORE_HISTORY_SCHEMA_VERSION,
            generationId,
            batchId: batch.batchId,
            userUid: batch.userUid,
            chartKey: candidate.chartKey,
            observedAt: candidate.observedAt,
            sequence,
            source: batch.source,
            kind: candidate.kind,
            changedMask: candidate.changedMask,
            state: candidate.after,
        };
        events.push(event);
    }

    return events;
}
