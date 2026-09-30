import { describe, expect, it } from "vitest";
import type { Chart } from "@/components/data/music/type";
import {
    formatKaleidxscopeDateTime,
    getKaleidxscopeCurrentPhase,
    getKaleidxscopeGate,
    getKaleidxscopeNextPhase,
    getKaleidxscopePhaseStatus,
    getOpenedKaleidxscopeGates,
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
    it("only exposes gates at or after their opening time", () => {
        const idsAt = (timestamp: string) =>
            getOpenedKaleidxscopeGates(new Date(timestamp)).map(gate => gate.id);
        expect(idsAt("2026-09-30T23:59:59+08:00")).toEqual([
            "blue",
            "white",
            "purple",
            "black",
            "yellow",
            "red",
        ]);
        expect(idsAt("2026-10-01T06:59:59+08:00")).not.toContain("prism");
        expect(idsAt("2026-10-01T07:00:00+08:00").slice(6)).toEqual(["prism", "noise"]);
        expect(idsAt("2026-10-02T06:59:59+08:00")).not.toContain("hope");
        expect(idsAt("2026-10-02T07:00:00+08:00").slice(6)).toEqual([
            "prism",
            "noise",
            "hope",
            "final",
        ]);
        expect(idsAt("2025-01-01T00:00:00+08:00")).toEqual([]);
    });

    it("contains all six CN gates with complete life calendars and draw pools", () => {
        const colorGates = kaleidxscopeGates.slice(0, 6);
        expect(colorGates.map(gate => gate.id)).toEqual([
            "blue",
            "white",
            "purple",
            "black",
            "yellow",
            "red",
        ]);
        expect(
            colorGates.map(gate => ({
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
            { id: "red", keySongs: 10, poolSizes: [11, 4, 1], bossId: 11814 },
        ]);

        for (const gate of colorGates) {
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

    it("contains the tower, noise stage, hope gate and single-track final sequence", () => {
        expect(kaleidxscopeGates.slice(6).map(gate => [gate.name, gate.shortName])).toEqual([
            ["棱镜塔", "棱镜塔"],
            ["乱码", "乱码"],
            ["希望之门", "希望之门"],
            ["KALEIDXSCOPE", "KALEIDXSCOPE"],
        ]);
        expect(
            kaleidxscopeGates.slice(6).map(gate => ({
                id: gate.id,
                keySongs: gate.keyCondition.songs.length,
                poolSizes: gate.selectionPools.map(pool => pool.songs.length),
                bossId: gate.selectionPools.at(-1)?.songs[0].musicId,
            }))
        ).toEqual([
            { id: "prism", keySongs: 0, poolSizes: [10, 4, 1], bossId: 11818 },
            { id: "noise", keySongs: 0, poolSizes: [6, 7, 1], bossId: 11879 },
            { id: "hope", keySongs: 0, poolSizes: [1, 1, 1], bossId: 1819 },
            { id: "final", keySongs: 0, poolSizes: [1], bossId: 11820 },
        ]);
        expect(new Set(kaleidxscopeGates.map(gate => gate.shortName)).size).toBe(
            kaleidxscopeGates.length
        );
        for (const gate of kaleidxscopeGates) {
            if (gate.lifePhases.length) {
                expect(gate.lifePhases[0].startsAt).toBe(gate.openedAt);
            } else {
                expect(gate.lifeNote).toBeTruthy();
            }
            for (const [index, current] of gate.lifePhases.entries()) {
                if (index > 0) {
                    expect(new Date(current.startsAt).getTime()).toBeGreaterThan(
                        new Date(gate.lifePhases[index - 1].startsAt).getTime()
                    );
                }
            }
        }
    });

    it("keeps the noise calendar unconfirmed and distinguishes its special chart", () => {
        const noise = getKaleidxscopeGate("乱码")!;
        expect(noise.openedAt).toBe("2026-10-01T07:00:00+08:00");
        expect(noise.keyCondition.summary).toBe("通关棱镜塔");
        expect(noise.lifePhases).toEqual([]);
        expect(noise.lifeNote).toContain("各阶段生效日期待确认");
        expect(getKaleidxscopeCurrentPhase(noise, new Date(noise.openedAt))).toBeNull();
        expect(getKaleidxscopeNextPhase(noise, new Date(noise.openedAt))).toBeNull();
        expect(noise.selectionPools[2].songs).toEqual([
            { musicId: 11879, title: "Xaleid◆scopiX (2)" },
        ]);
        expect(noise.selectionPools[2].unlistedDescription).toBe("乱码版 Xaleid◆scopiX");
        expect(getKaleidxscopeGate("希望之门")!.keyCondition.summary).toBe(
            "完成乱码阶段，获得希望钥匙"
        );
    });

    it("uses 07:00 for new schedules and shifts the hope and final calendars by one day", () => {
        const [prism, , hope, final] = kaleidxscopeGates.slice(6);
        expect(prism.lifePhases.map(phase => phase.startsAt)).toEqual(
            ["01", "04", "07", "10", "14", "21"].map(day => `2026-10-${day}T07:00:00+08:00`)
        );
        expect(hope.lifePhases.map(phase => phase.startsAt)).toEqual(
            ["02", "05", "08", "11", "15", "22"].map(day => `2026-10-${day}T07:00:00+08:00`)
        );
        expect(final.lifePhases.map(phase => phase.startsAt)).toEqual(
            ["02", "04", "06", "07", "08", "12", "14", "16", "23"].map(
                day => `2026-10-${day}T07:00:00+08:00`
            )
        );
        expect(final.lifePhases.map(phase => [phase.difficulty, phase.life])).toEqual([
            ["Re:MASTER", 1],
            ["Re:MASTER", 5],
            ["Re:MASTER", 10],
            ["Re:MASTER", 30],
            ["MASTER", 30],
            ["MASTER", 50],
            ["MASTER", 100],
            ["EXPERT", "100 / 999"],
            ["BASIC", 999],
        ]);
        expect(getKaleidxscopeCurrentPhase(hope, new Date("2026-10-02T06:59:59+08:00"))).toBeNull();
        expect(getKaleidxscopeCurrentPhase(hope, new Date(hope.openedAt))).toMatchObject({
            life: 1,
        });
        expect(
            getKaleidxscopeCurrentPhase(hope, new Date("2026-10-05T06:59:59+08:00"))
        ).toMatchObject({ life: 1 });
        expect(
            getKaleidxscopeCurrentPhase(hope, new Date("2026-10-05T07:00:00+08:00"))
        ).toMatchObject({ life: 10 });
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
