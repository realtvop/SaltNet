import { describe, expect, it } from "vitest";
import type { Chart } from "@/components/data/music/type";
import {
    formatKaleidxscopeDateTime,
    getKaleidxscopeCurrentPhase,
    getKaleidxscopeGate,
    getKaleidxscopeNextPhase,
    getKaleidxscopePhaseStatus,
    kaleidxscopeGates,
    resolveKaleidxscopeSongChart,
} from "./index";

function makeChart(musicId: number, grade: number): Chart {
    return {
        id: musicId * 10 + grade,
        info: { grade },
        music: { id: musicId },
    } as Chart;
}

describe("KALEIDXSCOPE data", () => {
    it("contains all six CN gates with complete life calendars and draw pools", () => {
        expect(kaleidxscopeGates.map(gate => gate.id)).toEqual([
            "blue",
            "white",
            "purple",
            "black",
            "yellow",
            "red",
        ]);
        expect(
            kaleidxscopeGates.map(gate => ({
                id: gate.id,
                keySongs: gate.keyCondition.songs.length,
                poolSizes: gate.selectionPools.map(pool => pool.songs.length),
                bossId: gate.selectionPools[2].songs[0].musicId,
            }))
        ).toEqual([
            { id: "blue", keySongs: 29, poolSizes: [23, 6, 1], bossId: 11740 },
            { id: "white", keySongs: 6, poolSizes: [20, 9, 1], bossId: 11745 },
            { id: "purple", keySongs: 28, poolSizes: [11, 17, 1], bossId: 11749 },
            { id: "black", keySongs: 11, poolSizes: [30, 10, 1], bossId: 11753 },
            { id: "yellow", keySongs: 12, poolSizes: [33, 11, 1], bossId: 11809 },
            { id: "red", keySongs: 10, poolSizes: [14, 4, 1], bossId: 11814 },
        ]);

        for (const gate of kaleidxscopeGates) {
            expect(gate.lifePhases).toHaveLength(6);
            expect(gate.selectionPools.map(pool => pool.track)).toEqual([1, 2, 3]);
            expect(gate.selectionPools[2]).toMatchObject({ selection: "fixed" });
            expect(gate.selectionPools[2].songs).toHaveLength(1);
            expect(gate.keyCondition.songs.length).toBeGreaterThan(0);
            expect(new Set(gate.keyCondition.songs.map(song => song.musicId)).size).toBe(
                gate.keyCondition.songs.length
            );
            expect(
                gate.lifePhases.every(
                    (phase, index, phases) =>
                        index === 0 ||
                        new Date(phase.startsAt).getTime() >
                            new Date(phases[index - 1].startsAt).getTime()
                )
            ).toBe(true);
        }
    });

    it("marks history, current life, and future phases at an exact switch boundary", () => {
        const redGate = getKaleidxscopeGate("红门");
        expect(redGate).not.toBeNull();
        if (!redGate) return;

        const beforeSwitch = new Date("2026-08-11T03:59:59+08:00");
        expect(getKaleidxscopeCurrentPhase(redGate, beforeSwitch)).toMatchObject({ life: 10 });
        expect(getKaleidxscopeNextPhase(redGate, beforeSwitch)).toMatchObject({ life: 30 });

        const atSwitch = new Date("2026-08-11T04:00:00+08:00");
        expect(getKaleidxscopeCurrentPhase(redGate, atSwitch)).toMatchObject({
            difficulty: "MASTER",
            life: 30,
        });
        expect(getKaleidxscopeNextPhase(redGate, atSwitch)).toMatchObject({ life: 50 });
        expect(getKaleidxscopePhaseStatus(redGate, 1, atSwitch)).toBe("past");
        expect(getKaleidxscopePhaseStatus(redGate, 2, atSwitch)).toBe("current");
        expect(getKaleidxscopePhaseStatus(redGate, 3, atSwitch)).toBe("future");
    });

    it("returns no current phase before a gate opens", () => {
        const redGate = getKaleidxscopeGate("红门");
        expect(redGate).not.toBeNull();
        if (!redGate) return;

        const beforeOpening = new Date("2026-08-05T09:59:59+08:00");
        expect(getKaleidxscopeCurrentPhase(redGate, beforeOpening)).toBeNull();
        expect(getKaleidxscopeNextPhase(redGate, beforeOpening)).toEqual(redGate.lifePhases[0]);
        expect(getKaleidxscopePhaseStatus(redGate, 0, beforeOpening)).toBe("future");
    });

    it("formats schedule timestamps in CN time independently of the runtime timezone", () => {
        expect(formatKaleidxscopeDateTime("2026-08-10T20:00:00Z")).toBe("8月11日 04:00");
        expect(formatKaleidxscopeDateTime("2026-08-10T20:00:00Z", true)).toBe(
            "2026年8月11日 04:00"
        );
    });

    it("resolves the preferred chart and falls back to Master", () => {
        const song = { musicId: 11814, title: "FLΛME/FRΦST" };
        const master = makeChart(song.musicId, 3);
        const expert = makeChart(song.musicId, 2);

        expect(resolveKaleidxscopeSongChart(song, [master, expert], 2)).toBe(expert);
        expect(resolveKaleidxscopeSongChart(song, [master, expert], 0)).toBe(master);
        expect(resolveKaleidxscopeSongChart({ musicId: 1, title: "missing" }, [], 3)).toBeNull();
    });
});
