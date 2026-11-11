import type { Chart, Music } from "@core/music/type";
import type { ChartEntry, Song } from "../src/catalog/songs";
import { ChartType } from "@core/mai/types";

/**
 * Builds one made-up chart for unit tests.
 * A constant of 0 means no constant (constantOf returns null).
 */
export function entryOf(spec: {
    id: number;
    grade: number;
    level?: string;
    constant?: number;
    from?: string;
}): ChartEntry {
    const music: Music = {
        id: spec.id,
        info: {
            id: spec.id,
            title: String(spec.id),
            artist: "someone",
            genre: "舞萌" as never,
            bpm: 120,
            from: (spec.from ?? "舞萌DX") as never,
            isNew: false,
            type: ChartType.Standard,
        },
        charts: [],
    };
    const chart: Chart = {
        id: spec.id * 10 + spec.grade,
        info: {
            notes: [0, 0, 0, 0],
            charter: "",
            level: spec.level ?? "1",
            grade: spec.grade,
            constant: spec.constant !== undefined ? spec.constant : 1,
            deluxeScoreMax: 0,
        },
        music,
    };
    music.charts.push(chart);
    const song: Song = {
        id: spec.id,
        musicId: spec.id,
        title: String(spec.id),
        artist: "someone",
        genre: "舞萌",
        bpm: 120,
        aliases: [],
        sd: music,
    };
    return { chart, song };
}
