/**
 * KALEIDXSCOPE gates as the commands print them (design 3.2): the overview of all gates, and one
 * gate with its life calendar, key songs and the pools its tracks are drawn from. The gate data
 * ships with the CLI and is worked out by the same core functions the web app uses; only the
 * charts of the songs need the catalog. Times are written in the machine's own offset like every
 * time in the output (design 4.5), whatever zone the schedule was published in.
 */
import type {
    KaleidxscopeDifficulty,
    KaleidxscopeGate,
    KaleidxscopeLife,
    KaleidxscopePhaseStatus,
    KaleidxscopeSong,
} from "@core/kaleidxscope";
import type { ChartRow } from "./chartRow";
import type { ChartEntry } from "./songs";
import {
    getKaleidxscopeCurrentPhase,
    getKaleidxscopeNextPhase,
    getKaleidxscopePhaseEnd,
    getKaleidxscopePhaseStatus,
    getKaleidxscopePreferredGrade,
    resolveKaleidxscopeSongChart,
} from "@core/kaleidxscope";
import { difficultyLabel } from "../refs/difficulty";
import { formatLocalTime } from "../util/time";
import { chartRow } from "./chartRow";

function localTime(value: string): string {
    return formatLocalTime(new Date(value));
}

export interface PhaseRow {
    readonly startsAt: string;
    /** Where the next phase starts; null for the last one. */
    readonly endsAt: string | null;
    /** The difficulty the gate's songs are played at in this phase. */
    readonly difficulty: KaleidxscopeDifficulty;
    /** One life bar, or two for the final gate: `{first, second}`. */
    readonly life: KaleidxscopeLife;
    /** Relative to the time asked about: `past`, `current` or `future`. */
    readonly status: KaleidxscopePhaseStatus;
}

function phaseRow(gate: KaleidxscopeGate, index: number, now: Date): PhaseRow {
    const phase = gate.lifePhases[index];
    const endsAt = getKaleidxscopePhaseEnd(gate, index);
    return {
        startsAt: localTime(phase.startsAt),
        endsAt: endsAt === null ? null : localTime(endsAt),
        difficulty: phase.difficulty,
        life: typeof phase.life === "number" ? phase.life : { ...phase.life },
        status: getKaleidxscopePhaseStatus(gate, index, now),
    };
}

/** The whole life calendar, in time order. */
export function gatePhases(gate: KaleidxscopeGate, now: Date): PhaseRow[] {
    return gate.lifePhases.map((_, index) => phaseRow(gate, index, now));
}

function phaseRowOf(
    gate: KaleidxscopeGate,
    phase: KaleidxscopeGate["lifePhases"][number] | null,
    now: Date
): PhaseRow | null {
    return phase ? phaseRow(gate, gate.lifePhases.indexOf(phase), now) : null;
}

interface GateBase {
    readonly id: string;
    readonly name: string;
    readonly shortName: string;
    readonly region: string;
    /** Whether the gate is open at the time asked about. */
    readonly opened: boolean;
    readonly openedAt: string;
    /** The phase in force; null before the gate opens. */
    readonly currentPhase: PhaseRow | null;
    /** The phase that follows; null when the current one is the last. */
    readonly nextPhase: PhaseRow | null;
}

function gateBase(gate: KaleidxscopeGate, now: Date): GateBase {
    return {
        id: gate.id,
        name: gate.name,
        shortName: gate.shortName,
        region: gate.region,
        // The web app's own test for the gates it lists (`getOpenedKaleidxscopeGates`).
        opened: new Date(gate.openedAt).getTime() <= now.getTime(),
        openedAt: localTime(gate.openedAt),
        currentPhase: phaseRowOf(gate, getKaleidxscopeCurrentPhase(gate, now), now),
        nextPhase: phaseRowOf(gate, getKaleidxscopeNextPhase(gate, now), now),
    };
}

export interface GateOverviewRow extends GateBase {
    readonly keyCondition: {
        readonly summary: string;
        /** How many songs the condition names; 0 when it is not about particular songs. */
        readonly songCount: number;
    };
}

/** One row for each gate, the ones not open yet included. */
export function gateOverview(gates: readonly KaleidxscopeGate[], now: Date): GateOverviewRow[] {
    return gates.map(gate => ({
        ...gateBase(gate, now),
        keyCondition: {
            summary: gate.keyCondition.summary,
            songCount: gate.keyCondition.songs.length,
        },
    }));
}

/** A song the gate names that the loaded catalog does not have (yet). */
export interface PendingSong {
    readonly musicId: number;
    readonly title: string;
}

interface GateSongs {
    /** One chart for each song the catalog has. */
    readonly songs: readonly ChartRow[];
    readonly pending: readonly PendingSong[];
}

export interface GatePoolRow {
    readonly track: number;
    readonly label: string | null;
    readonly description: string;
    readonly selection: "random" | "fixed";
    /** Set when the chart played is not an ordinary one, so no songs are listed. */
    readonly unlistedDescription: string | null;
    readonly songs: readonly ChartRow[];
    readonly pending: readonly PendingSong[];
}

export interface GateDetail extends GateBase {
    readonly description: string | null;
    readonly lifeNote: string | null;
    readonly phases: readonly PhaseRow[];
    /** The difficulty the songs below were looked up at; a song without it has its MASTER. */
    readonly chartDifficulty: string;
    readonly keyCondition: GateSongs & {
        readonly summary: string;
        readonly songCount: number;
    };
    readonly pools: readonly GatePoolRow[];
}

export interface GateDetailOptions {
    readonly now: Date;
    /** The grade (0–4) to look the songs up at; the current phase's difficulty when omitted. */
    readonly grade?: number;
}

function entriesByMusic(entries: readonly ChartEntry[]): Map<number, ChartEntry[]> {
    const byMusic = new Map<number, ChartEntry[]>();
    for (const entry of entries) {
        const list = byMusic.get(entry.chart.music.id);
        if (list) list.push(entry);
        else byMusic.set(entry.chart.music.id, [entry]);
    }
    return byMusic;
}

/**
 * The web app's choice of chart for a gate song: the grade asked for, else MASTER, else EXPERT,
 * else any. A song that has no chart in the catalog at all is pending.
 */
function resolveSongs(
    songs: readonly KaleidxscopeSong[],
    byMusic: ReadonlyMap<number, readonly ChartEntry[]>,
    grade: number
): GateSongs {
    const rows: ChartRow[] = [];
    const pending: PendingSong[] = [];
    for (const song of songs) {
        const candidates = byMusic.get(song.musicId) ?? [];
        const chart = resolveKaleidxscopeSongChart(
            song,
            candidates.map(({ chart: candidate }) => candidate),
            grade
        );
        const entry = candidates.find(candidate => candidate.chart === chart);
        if (entry) rows.push(chartRow(entry));
        else pending.push({ musicId: song.musicId, title: song.title });
    }
    return { songs: rows, pending };
}

/** One gate with its calendar and its songs, looked up in the charts of the catalog. */
export function gateDetail(
    gate: KaleidxscopeGate,
    entries: readonly ChartEntry[],
    options: GateDetailOptions
): GateDetail {
    const { now } = options;
    const base = gateBase(gate, now);
    const grade =
        options.grade ?? getKaleidxscopePreferredGrade(getKaleidxscopeCurrentPhase(gate, now));
    const byMusic = entriesByMusic(entries);
    const key = resolveSongs(gate.keyCondition.songs, byMusic, grade);

    return {
        ...base,
        description: gate.description ?? null,
        lifeNote: gate.lifeNote ?? null,
        phases: gatePhases(gate, now),
        chartDifficulty: difficultyLabel(grade),
        keyCondition: {
            summary: gate.keyCondition.summary,
            songCount: gate.keyCondition.songs.length,
            ...key,
        },
        pools: gate.selectionPools.map(pool => ({
            track: pool.track,
            label: pool.label ?? null,
            description: pool.description,
            selection: pool.selection,
            unlistedDescription: pool.unlistedDescription ?? null,
            // Like the web app: the songs of a pool whose chart is not an ordinary one are not
            // the ones that will be played, so none are listed.
            ...(pool.unlistedDescription
                ? { songs: [], pending: [] }
                : resolveSongs(pool.songs, byMusic, grade)),
        })),
    };
}
