import type { DivingFishFullRecord } from "@core/integrations/diving-fish/type";
import type { Chart } from "@core/music/type";
import type { ScoreHistoryEventV1 } from "@core/user/scoreHistory/type";
import type { User } from "@core/user/type";
import type { RuntimePaths } from "../src/runtime/paths";
import { isUtageGrade } from "@core/chart/difficulty";
import { ChartType, ComboStatus, RankRate, SyncStatus } from "@core/mai/types";
import { allChartEntries } from "../src/catalog/chartQuery";
import { openStore } from "../src/store/store";
import { replaceUsers } from "../src/users/repository";
import { commandIn } from "./commandRun";
import { fixtureSongCatalog } from "./fixtureCatalog";

export const SCORE_TIME = new Date("2026-11-10T03:04:05Z").getTime();

export function recordOf(chart: Chart, index: number = 0): DivingFishFullRecord {
    const type = chart.music.info.type === ChartType.Standard ? "SD" : "DX";
    const songId =
        type === "DX" && chart.music.id < 100_000 ? chart.music.id - 10_000 : chart.music.id;
    return {
        song_id: songId,
        title: chart.music.info.title,
        type,
        level: chart.info.level,
        level_index: chart.info.grade,
        level_label: "Made-up",
        ds: chart.info.constant,
        achievements: 100 + index / 10000,
        dxScore: Math.max(0, chart.info.deluxeScoreMax - index),
        fc: ComboStatus.FullCombo,
        fs: SyncStatus.FullSync,
        rate: RankRate.sss,
        ra: 100_000 - index,
        play_count: index + 1,
        lastChangedAt: SCORE_TIME + index,
    };
}

export function allFixtureRecords(): {
    records: Record<string, DivingFishFullRecord>;
    charts: Chart[];
} {
    const entries = allChartEntries(fixtureSongCatalog());
    return {
        charts: entries.map(entry => entry.chart),
        records: Object.fromEntries(
            entries.map((entry, index) => [
                `${entry.chart.music.id}-${entry.chart.info.grade}`,
                recordOf(entry.chart, index),
            ])
        ),
    };
}

export function detailedUser(
    uid: string,
    name: string,
    updatedAt: number | null = SCORE_TIME
): User {
    const { records } = allFixtureRecords();
    return user(uid, name, { updateTime: updatedAt, detailed: records });
}

export function b50User(uid: string, name: string, updatedAt: number | null = SCORE_TIME): User {
    const { charts } = allFixtureRecords();
    const ordinary = charts.filter(chart => !isUtageGrade(chart.info.grade));
    const old = ordinary.filter(chart => !chart.music.info.isNew).slice(0, 40);
    const newer = ordinary.filter(chart => chart.music.info.isNew).slice(0, 20);
    if (old.length < 36 || newer.length === 0) throw new Error("fixture needs B35 and B15 charts");
    return user(uid, name, {
        updateTime: updatedAt,
        b50: {
            sd: old.map((chart, index) => recordOf(chart, index)),
            dx: newer.map((chart, index) => recordOf(chart, 100 + index)),
        },
    });
}

export function user(uid: string, name: string, data: Record<string, unknown> = {}): User {
    return {
        uid,
        remark: null,
        divingFish: { name: null },
        inGame: { id: null, name: null, enabled: false, useFastUpdate: false },
        settings: { manuallyUpdate: false },
        data: { updateTime: null, name, rating: null, ...data },
    } as User;
}

export function scoreEvent(
    id: string,
    uid: string,
    recordKey: string,
    changedMask: number,
    playCount: number | null = null
): ScoreHistoryEventV1 {
    return {
        id,
        schemaVersion: 1,
        generationId: "made-generation",
        batchId: "made-batch",
        userUid: uid,
        chartKey: recordKey,
        observedAt: SCORE_TIME,
        sequence: 0,
        source: "inGame",
        kind: "change",
        changedMask,
        state: {
            achievements: 100,
            dxScore: 1000,
            fc: ComboStatus.None,
            fs: SyncStatus.None,
            playCount,
        },
    };
}

/** Seeds the fixed catalog, then writes made-up users through the sole user repository. */
export async function seedScoreUsers(
    paths: RuntimePaths,
    users: readonly User[],
    events: readonly ScoreHistoryEventV1[] = []
): Promise<void> {
    await commandIn(paths, "charts", ["--limit", "1"]);
    const store = openStore(paths);
    try {
        replaceUsers(store, users, events);
    } finally {
        store.close();
    }
}
