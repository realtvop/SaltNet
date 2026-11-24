import {
    ScoreHistoryChange,
    type ScoreHistorySource,
    type ScoreHistoryTimelineEntry,
} from "./type";

export interface ScoreHistoryDisplayChange {
    label: string;
    before: string | null;
    after: string;
}

function formatValue(
    field: "achievements" | "dxScore" | "fc" | "fs" | "playCount",
    value: number | string | null
): string {
    if (field === "achievements" && typeof value === "number") return `${value.toFixed(4)}%`;
    if (field === "playCount") return value === null ? "未知" : `${value} 次`;
    if (field === "fc" || field === "fs") return value ? String(value).toUpperCase() : "无";
    return String(value);
}

export function getScoreHistoryDisplayChanges(
    entry: ScoreHistoryTimelineEntry
): ScoreHistoryDisplayChange[] {
    const fields = [
        ["achievements", "达成率", ScoreHistoryChange.Achievements],
        ["dxScore", "DX 分", ScoreHistoryChange.DxScore],
        ["fc", "FC", ScoreHistoryChange.ComboStatus],
        ["fs", "FS", ScoreHistoryChange.SyncStatus],
        ["playCount", "游玩次数", ScoreHistoryChange.PlayCount],
    ] as const;
    return fields
        .filter(
            ([, , bit]) => entry.event.kind === "initial" || (entry.event.changedMask & bit) > 0
        )
        .map(([field, label]) => ({
            label,
            before:
                entry.event.kind === "initial" || !entry.before
                    ? null
                    : formatValue(field, entry.before[field]),
            after: formatValue(field, entry.after[field]),
        }));
}

export function formatScoreHistorySource(source: ScoreHistorySource): string {
    return {
        inGame: "游戏内更新",
        lxns: "落雪更新",
        divingFishImport: "水鱼导入令牌更新",
        divingFishPublic: "水鱼公开数据更新",
    }[source];
}

export function isPlayCountOnlyHistory(entry: ScoreHistoryTimelineEntry): boolean {
    return (
        entry.event.kind === "change" && entry.event.changedMask === ScoreHistoryChange.PlayCount
    );
}
