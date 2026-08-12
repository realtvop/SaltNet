import type { Chart } from "@/components/data/music/type";
import { kaleidxscopeGates } from "./data";
import type {
    KaleidxscopeGate,
    KaleidxscopeLifePhase,
    KaleidxscopePhaseStatus,
    KaleidxscopeSong,
} from "./type";

export function getKaleidxscopeGate(shortName: string): KaleidxscopeGate | null {
    return kaleidxscopeGates.find(gate => gate.shortName === shortName) ?? null;
}

export function getKaleidxscopeCurrentPhase(
    gate: KaleidxscopeGate,
    now: Date = new Date()
): KaleidxscopeLifePhase | null {
    const nowTime = now.getTime();
    let current: KaleidxscopeLifePhase | null = null;

    for (const lifePhase of gate.lifePhases) {
        if (new Date(lifePhase.startsAt).getTime() > nowTime) break;
        current = lifePhase;
    }

    return current;
}

export function getKaleidxscopeNextPhase(
    gate: KaleidxscopeGate,
    now: Date = new Date()
): KaleidxscopeLifePhase | null {
    const nowTime = now.getTime();
    return (
        gate.lifePhases.find(lifePhase => new Date(lifePhase.startsAt).getTime() > nowTime) ?? null
    );
}

export function getKaleidxscopePhaseEnd(gate: KaleidxscopeGate, phaseIndex: number): string | null {
    return gate.lifePhases[phaseIndex + 1]?.startsAt ?? null;
}

export function getKaleidxscopePhaseStatus(
    gate: KaleidxscopeGate,
    phaseIndex: number,
    now: Date = new Date()
): KaleidxscopePhaseStatus {
    const startsAt = new Date(gate.lifePhases[phaseIndex].startsAt).getTime();
    const endsAt = gate.lifePhases[phaseIndex + 1]
        ? new Date(gate.lifePhases[phaseIndex + 1].startsAt).getTime()
        : Number.POSITIVE_INFINITY;
    const nowTime = now.getTime();

    if (nowTime < startsAt) return "future";
    if (nowTime >= endsAt) return "past";
    return "current";
}

export function getKaleidxscopePreferredGrade(lifePhase: KaleidxscopeLifePhase | null): number {
    if (lifePhase?.difficulty === "BASIC") return 0;
    if (lifePhase?.difficulty === "EXPERT") return 2;
    return 3;
}

export function formatKaleidxscopeDateTime(value: string | Date, includeYear = false): string {
    const parts = new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    })
        .formatToParts(typeof value === "string" ? new Date(value) : value)
        .reduce<Record<string, string>>((result, part) => {
            result[part.type] = part.value;
            return result;
        }, {});

    const year = includeYear ? `${parts.year}年` : "";
    return `${year}${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`;
}

export function resolveKaleidxscopeSongChart(
    song: KaleidxscopeSong,
    charts: readonly Chart[],
    preferredGrade = 3
): Chart | null {
    const songCharts = charts.filter(chart => chart.music.id === song.musicId);
    return (
        songCharts.find(chart => chart.info.grade === preferredGrade) ??
        songCharts.find(chart => chart.info.grade === 3) ??
        songCharts.find(chart => chart.info.grade === 2) ??
        songCharts[0] ??
        null
    );
}

export { kaleidxscopeGates };
export type {
    KaleidxscopeDifficulty,
    KaleidxscopeGate,
    KaleidxscopeGateId,
    KaleidxscopeKeyCondition,
    KaleidxscopeLifePhase,
    KaleidxscopePhaseStatus,
    KaleidxscopeSelectionPool,
    KaleidxscopeSong,
} from "./type";
