import type { KaleidxscopeGate } from "@core/kaleidxscope";
import { kaleidxscopeGates } from "@core/kaleidxscope";
import { describe, expect, it } from "vitest";
import { allChartEntries } from "../../src/catalog/chartQuery";
import { gateDetail, gateOverview, gatePhases } from "../../src/catalog/gateView";
import { formatLocalTime } from "../../src/util/time";
import { fixtureSongCatalog } from "../fixtureCatalog";
import { catalogOf } from "../madeCatalog";
import { useTimeZone } from "../zone";

// Not UTC and not UTC+8 (where the calendars are published), so a time that was left in the
// zone of the data instead of the machine's shows.
useTimeZone("America/New_York");

describe("gatePhases", () => {
    const blue = kaleidxscopeGates.find(g => g.id === "blue")!;
    const finalGate = kaleidxscopeGates.find(g => g.id === "final")!;

    it("evaluates phases for blue at 2026-02-01T04:00:00+08:00", () => {
        const now = new Date("2026-02-01T04:00:00+08:00");
        const phases = gatePhases(blue, now);

        expect(phases).toHaveLength(6);
        expect(phases.map(p => p.status)).toEqual([
            "past",
            "past",
            "past",
            "current",
            "future",
            "future",
        ]);

        const expectedCalendar = [
            {
                start: "2026-01-23T10:00:00+08:00",
                end: "2026-01-26T04:00:00+08:00",
                difficulty: "MASTER",
                life: 1,
            },
            {
                start: "2026-01-26T04:00:00+08:00",
                end: "2026-01-29T04:00:00+08:00",
                difficulty: "MASTER",
                life: 10,
            },
            {
                start: "2026-01-29T04:00:00+08:00",
                end: "2026-02-01T04:00:00+08:00",
                difficulty: "MASTER",
                life: 30,
            },
            {
                start: "2026-02-01T04:00:00+08:00",
                end: "2026-02-05T04:00:00+08:00",
                difficulty: "MASTER",
                life: 50,
            },
            {
                start: "2026-02-05T04:00:00+08:00",
                end: "2026-02-12T04:00:00+08:00",
                difficulty: "EXPERT",
                life: 100,
            },
            {
                start: "2026-02-12T04:00:00+08:00",
                end: null,
                difficulty: "BASIC",
                life: 999,
            },
        ];

        for (let i = 0; i < phases.length; i++) {
            const exp = expectedCalendar[i];
            expect(new Date(phases[i].startsAt).getTime()).toBe(new Date(exp.start).getTime());
            if (exp.end === null) {
                expect(phases[i].endsAt).toBeNull();
            } else {
                expect(new Date(phases[i].endsAt!).getTime()).toBe(new Date(exp.end).getTime());
            }
            expect(phases[i].difficulty).toBe(exp.difficulty);
            expect(phases[i].life).toBe(exp.life);
        }

        expect(phases[0].startsAt).toBe(formatLocalTime(new Date("2026-01-23T10:00:00+08:00")));
        expect(phases[0].startsAt).toBe("2026-01-22T21:00:00-05:00");
        expect(phases[0].endsAt).toBe(formatLocalTime(new Date("2026-01-26T04:00:00+08:00")));
        expect(phases[0].endsAt).toBe("2026-01-25T15:00:00-05:00");
    });

    it("evaluates phases for final at 2026-10-07T07:00:00+08:00 with copied life", () => {
        const now = new Date("2026-10-07T07:00:00+08:00");
        const phases = gatePhases(finalGate, now);

        expect(phases[3].status).toBe("current");
        expect(phases[3].life).toEqual({ first: 30, second: 500 });
        expect(phases[3].life).not.toBe(finalGate.lifePhases[3].life);
    });

    it("evaluates phases before gate opens and long after", () => {
        const before = gatePhases(blue, new Date("2026-01-01T00:00:00+08:00"));
        expect(before.every(p => p.status === "future")).toBe(true);

        const after = gatePhases(blue, new Date("2027-01-01T00:00:00+08:00"));
        expect(after.slice(0, 5).every(p => p.status === "past")).toBe(true);
        expect(after[5].status).toBe("current");
    });
});

describe("gateOverview", () => {
    it("builds an overview for all gates at 2026-10-05T00:00:00+08:00", () => {
        const now = new Date("2026-10-05T00:00:00+08:00");
        const overview = gateOverview(kaleidxscopeGates, now);

        expect(overview).toHaveLength(10);
        expect(overview.every(g => g.opened)).toBe(true);

        const expectedCounts = [29, 6, 28, 11, 12, 10, 0, 0, 0, 0];
        expect(overview.map(g => g.keyCondition.songCount)).toEqual(expectedCounts);

        const expectedOpenedAt = [
            "2026-01-23T10:00:00+08:00",
            "2026-02-10T07:00:00+08:00",
            "2026-03-25T10:00:00+08:00",
            "2026-04-28T10:00:00+08:00",
            "2026-06-10T10:00:00+08:00",
            "2026-08-05T10:00:00+08:00",
            "2026-10-01T07:00:00+08:00",
            "2026-10-01T07:00:00+08:00",
            "2026-10-02T07:00:00+08:00",
            "2026-10-02T07:00:00+08:00",
        ];
        for (let i = 0; i < overview.length; i++) {
            expect(new Date(overview[i].openedAt).getTime()).toBe(
                new Date(expectedOpenedAt[i]).getTime()
            );
            expect(overview[i].id).toBe(kaleidxscopeGates[i].id);
            expect(overview[i].name).toBe(kaleidxscopeGates[i].name);
            expect(overview[i].shortName).toBe(kaleidxscopeGates[i].shortName);
            expect(overview[i].region).toBe(kaleidxscopeGates[i].region);
        }

        // blue: BASIC 999 from 2026-02-12T04:00+08:00, nextPhase null
        const blue = overview.find(g => g.id === "blue")!;
        expect(blue.currentPhase?.status).toBe("current");
        expect(new Date(blue.currentPhase!.startsAt).getTime()).toBe(
            new Date("2026-02-12T04:00:00+08:00").getTime()
        );
        expect(blue.currentPhase?.difficulty).toBe("BASIC");
        expect(blue.currentPhase?.life).toBe(999);
        expect(blue.nextPhase).toBeNull();

        // white, purple, black, yellow, red all at last phase (BASIC 999), nextPhase null
        for (const id of ["white", "purple", "black", "yellow", "red"]) {
            const gate = overview.find(g => g.id === id)!;
            expect(gate.currentPhase?.status).toBe("current");
            expect(gate.currentPhase?.difficulty).toBe("BASIC");
            expect(gate.currentPhase?.life).toBe(999);
            expect(gate.nextPhase).toBeNull();
        }

        // prism: current 2026-10-04T07:00 MASTER 10, next 2026-10-07T07:00 MASTER 30
        const prism = overview.find(g => g.id === "prism")!;
        expect(prism.currentPhase?.status).toBe("current");
        expect(new Date(prism.currentPhase!.startsAt).getTime()).toBe(
            new Date("2026-10-04T07:00:00+08:00").getTime()
        );
        expect(prism.currentPhase?.difficulty).toBe("MASTER");
        expect(prism.currentPhase?.life).toBe(10);
        expect(prism.nextPhase?.status).toBe("future");
        expect(new Date(prism.nextPhase!.startsAt).getTime()).toBe(
            new Date("2026-10-07T07:00:00+08:00").getTime()
        );
        expect(prism.nextPhase?.difficulty).toBe("MASTER");
        expect(prism.nextPhase?.life).toBe(30);

        // noise: current 2026-10-04T07:00 MASTER 10, next 2026-10-07T07:00 MASTER 30
        const noise = overview.find(g => g.id === "noise")!;
        expect(noise.currentPhase?.status).toBe("current");
        expect(new Date(noise.currentPhase!.startsAt).getTime()).toBe(
            new Date("2026-10-04T07:00:00+08:00").getTime()
        );
        expect(noise.currentPhase?.difficulty).toBe("MASTER");
        expect(noise.currentPhase?.life).toBe(10);
        expect(noise.nextPhase?.status).toBe("future");
        expect(new Date(noise.nextPhase!.startsAt).getTime()).toBe(
            new Date("2026-10-07T07:00:00+08:00").getTime()
        );

        // hope: current 2026-10-02T07:00 MASTER 1, next 2026-10-05T07:00 MASTER 10
        const hope = overview.find(g => g.id === "hope")!;
        expect(hope.currentPhase?.status).toBe("current");
        expect(new Date(hope.currentPhase!.startsAt).getTime()).toBe(
            new Date("2026-10-02T07:00:00+08:00").getTime()
        );
        expect(hope.currentPhase?.difficulty).toBe("MASTER");
        expect(hope.currentPhase?.life).toBe(1);
        expect(hope.nextPhase?.status).toBe("future");
        expect(new Date(hope.nextPhase!.startsAt).getTime()).toBe(
            new Date("2026-10-05T07:00:00+08:00").getTime()
        );
        expect(hope.nextPhase?.difficulty).toBe("MASTER");
        expect(hope.nextPhase?.life).toBe(10);

        // final: current 2026-10-04T07:00 Re:MASTER {5, 300}, next 2026-10-06T07:00 Re:MASTER {10, 500}
        const finalG = overview.find(g => g.id === "final")!;
        expect(finalG.currentPhase?.status).toBe("current");
        expect(new Date(finalG.currentPhase!.startsAt).getTime()).toBe(
            new Date("2026-10-04T07:00:00+08:00").getTime()
        );
        expect(finalG.currentPhase?.difficulty).toBe("Re:MASTER");
        expect(finalG.currentPhase?.life).toEqual({ first: 5, second: 300 });
        expect(finalG.nextPhase?.status).toBe("future");
        expect(new Date(finalG.nextPhase!.startsAt).getTime()).toBe(
            new Date("2026-10-06T07:00:00+08:00").getTime()
        );
        expect(finalG.nextPhase?.difficulty).toBe("Re:MASTER");
        expect(finalG.nextPhase?.life).toEqual({ first: 10, second: 500 });
    });

    it("writes the times in the machine's own offset", () => {
        const overview = gateOverview(kaleidxscopeGates, new Date("2026-10-05T00:00:00+08:00"));
        expect(overview[0].openedAt).toBe("2026-01-22T21:00:00-05:00");
        // Summer time on the other side of the year.
        const prism = overview.find(g => g.id === "prism")!;
        expect(prism.openedAt).toBe("2026-09-30T19:00:00-04:00");
        expect(prism.currentPhase?.startsAt).toBe("2026-10-03T19:00:00-04:00");
        expect(prism.currentPhase?.endsAt).toBe("2026-10-06T19:00:00-04:00");
        expect(prism.nextPhase?.startsAt).toBe("2026-10-06T19:00:00-04:00");
    });

    it("evaluates overview before gates open and at opening boundary", () => {
        const beforeAll = gateOverview(kaleidxscopeGates, new Date("2026-01-01T00:00:00+08:00"));
        expect(beforeAll.every(g => !g.opened)).toBe(true);
        expect(beforeAll.every(g => g.currentPhase === null)).toBe(true);
        for (let i = 0; i < beforeAll.length; i++) {
            expect(beforeAll[i].nextPhase?.status).toBe("future");
            expect(new Date(beforeAll[i].nextPhase!.startsAt).getTime()).toBe(
                new Date(kaleidxscopeGates[i].lifePhases[0].startsAt).getTime()
            );
        }

        const openAtBlue = new Date("2026-01-23T10:00:00+08:00");
        const atOpen = gateOverview(kaleidxscopeGates, openAtBlue);
        const blueAtOpen = atOpen.find(g => g.id === "blue")!;
        expect(blueAtOpen.opened).toBe(true);
        expect(blueAtOpen.currentPhase?.status).toBe("current");
        expect(new Date(blueAtOpen.currentPhase!.startsAt).getTime()).toBe(openAtBlue.getTime());

        const justBeforeOpen = new Date(openAtBlue.getTime() - 1);
        const justBefore = gateOverview(kaleidxscopeGates, justBeforeOpen);
        const blueJustBefore = justBefore.find(g => g.id === "blue")!;
        expect(blueJustBefore.opened).toBe(false);
        expect(blueJustBefore.currentPhase).toBeNull();
    });

    it("checks keyCondition summary for blue and hope", () => {
        const overview = gateOverview(kaleidxscopeGates, new Date("2026-10-05T00:00:00+08:00"));
        expect(overview.find(g => g.id === "blue")?.keyCondition.summary).toBe(
            "游玩全部 29 首青春区域曲目"
        );
        expect(overview.find(g => g.id === "hope")?.keyCondition.summary).toBe(
            "完成乱码阶段，获得希望钥匙"
        );
    });
});

describe("gateDetail", () => {
    const blue = kaleidxscopeGates.find(g => g.id === "blue")!;
    const catalog = fixtureSongCatalog();
    const entries = allChartEntries(catalog);

    it("evaluates gate detail with custom songs on fixture entries at grade: 4", () => {
        const testGate: KaleidxscopeGate = {
            ...blue,
            keyCondition: {
                summary: "测试",
                songs: [
                    { musicId: 58, title: "A" },
                    { musicId: 99999, title: "Gone" },
                ],
            },
            selectionPools: [
                {
                    track: 1,
                    description: "池一",
                    selection: "random",
                    songs: [
                        { musicId: 191, title: "Title 191" },
                        { musicId: 10191, title: "Title 10191" },
                        { musicId: 110851, title: "Title 110851" },
                    ],
                },
                {
                    track: 2,
                    label: "BONUS TRACK",
                    description: "池二",
                    selection: "fixed",
                    songs: [{ musicId: 146, title: "Title 146" }],
                },
                {
                    track: 3,
                    description: "",
                    selection: "fixed",
                    unlistedDescription: "特别版",
                    songs: [{ musicId: 58, title: "Title 58" }],
                },
            ],
        };

        const detail = gateDetail(testGate, entries, {
            now: new Date("2026-02-01T00:00:00+08:00"),
            grade: 4,
        });

        expect(detail.chartDifficulty).toBe("Re:MASTER");
        expect(detail.keyCondition.songCount).toBe(2);
        expect(detail.keyCondition.songs.map(s => s.chartKey)).toEqual(["58-4"]);
        expect(detail.keyCondition.pending).toEqual([{ musicId: 99999, title: "Gone" }]);

        expect(detail.pools[0].songs.map(s => s.chartKey)).toEqual([
            "191-3",
            "10191-3",
            "110851-10",
        ]);
        expect(detail.pools[0].pending).toEqual([]);
        expect(detail.pools[0].label).toBeNull();

        expect(detail.pools[1].songs.map(s => s.chartKey)).toEqual(["146-4"]);
        expect(detail.pools[1].label).toBe("BONUS TRACK");

        expect(detail.pools[2].songs).toEqual([]);
        expect(detail.pools[2].pending).toEqual([]);
        expect(detail.pools[2].unlistedDescription).toBe("特别版");
        expect(detail.pools[2].label).toBeNull();
    });

    it("evaluates grades 0, 2, 3 and checks UTAGE difficulty", () => {
        const testGate: KaleidxscopeGate = {
            ...blue,
            keyCondition: {
                summary: "测试",
                songs: [{ musicId: 58, title: "A" }],
            },
            selectionPools: [
                {
                    track: 1,
                    description: "池一",
                    selection: "random",
                    songs: [
                        { musicId: 191, title: "Title 191" },
                        { musicId: 10191, title: "Title 10191" },
                        { musicId: 110851, title: "Title 110851" },
                    ],
                },
                {
                    track: 2,
                    label: "BONUS TRACK",
                    description: "池二",
                    selection: "fixed",
                    songs: [{ musicId: 146, title: "Title 146" }],
                },
            ],
        };

        const d0 = gateDetail(testGate, entries, {
            now: new Date("2026-02-01T00:00:00+08:00"),
            grade: 0,
        });
        expect(d0.chartDifficulty).toBe("BASIC");
        expect(d0.keyCondition.songs.map(s => s.chartKey)).toEqual(["58-0"]);
        expect(d0.pools[0].songs.map(s => s.chartKey)).toEqual(["191-0", "10191-0", "110851-10"]);
        expect(d0.pools[1].songs.map(s => s.chartKey)).toEqual(["146-0"]);
        expect(d0.pools[0].songs[2].difficulty).toBe("UTAGE");

        const d2 = gateDetail(testGate, entries, {
            now: new Date("2026-02-01T00:00:00+08:00"),
            grade: 2,
        });
        expect(d2.chartDifficulty).toBe("EXPERT");
        expect(d2.keyCondition.songs.map(s => s.chartKey)).toEqual(["58-2"]);

        const d3 = gateDetail(testGate, entries, {
            now: new Date("2026-02-01T00:00:00+08:00"),
            grade: 3,
        });
        expect(d3.chartDifficulty).toBe("MASTER");
        expect(d3.keyCondition.songs.map(s => s.chartKey)).toEqual(["58-3"]);
    });

    it("resolves DX and SD charts correctly for 10146 and 146", () => {
        const testGate: KaleidxscopeGate = {
            ...blue,
            keyCondition: { summary: "测试", songs: [] },
            selectionPools: [
                {
                    track: 1,
                    description: "池一",
                    selection: "fixed",
                    songs: [{ musicId: 10146, title: "DX" }],
                },
                {
                    track: 2,
                    description: "池二",
                    selection: "fixed",
                    songs: [{ musicId: 146, title: "SD" }],
                },
            ],
        };

        const detail = gateDetail(testGate, entries, {
            now: new Date("2026-02-01T00:00:00+08:00"),
            grade: 4,
        });
        expect(detail.pools[0].songs[0].chartKey).toBe("10146-3");
        expect(detail.pools[0].songs[0].type).toBe("DX");
        expect(detail.pools[1].songs[0].chartKey).toBe("146-4");
        expect(detail.pools[1].songs[0].type).toBe("SD");
    });

    it("derives default grade from now when grade is omitted", () => {
        const testGate: KaleidxscopeGate = {
            ...blue,
            keyCondition: { summary: "测试", songs: [{ musicId: 58, title: "A" }] },
            selectionPools: [],
        };

        // 2026-01-23T10:00:00+08:00 -> MASTER (grade 3)
        const d1 = gateDetail(testGate, entries, {
            now: new Date("2026-01-23T10:00:00+08:00"),
        });
        expect(d1.chartDifficulty).toBe("MASTER");
        expect(d1.keyCondition.songs[0].chartKey).toBe("58-3");

        // 2026-02-05T04:00:00+08:00 -> EXPERT (grade 2)
        const d2 = gateDetail(testGate, entries, {
            now: new Date("2026-02-05T04:00:00+08:00"),
        });
        expect(d2.chartDifficulty).toBe("EXPERT");
        expect(d2.keyCondition.songs[0].chartKey).toBe("58-2");

        // 2026-03-01T00:00:00+08:00 -> BASIC (grade 0)
        const d3 = gateDetail(testGate, entries, {
            now: new Date("2026-03-01T00:00:00+08:00"),
        });
        expect(d3.chartDifficulty).toBe("BASIC");
        expect(d3.keyCondition.songs[0].chartKey).toBe("58-0");

        // 2026-01-01T00:00:00+08:00 (before gate opens) -> MASTER (grade 3)
        const d4 = gateDetail(testGate, entries, {
            now: new Date("2026-01-01T00:00:00+08:00"),
        });
        expect(d4.chartDifficulty).toBe("MASTER");
        expect(d4.keyCondition.songs[0].chartKey).toBe("58-3");

        // Explicit grade wins over phase
        const dExplicit = gateDetail(testGate, entries, {
            now: new Date("2026-02-05T04:00:00+08:00"),
            grade: 0,
        });
        expect(dExplicit.chartDifficulty).toBe("BASIC");
        expect(dExplicit.keyCondition.songs[0].chartKey).toBe("58-0");

        // final gate at 2026-10-03T00:00:00+08:00 (Re:MASTER phase) -> grade 4
        const finalGate = kaleidxscopeGates.find(g => g.id === "final")!;
        const testFinal: KaleidxscopeGate = {
            ...finalGate,
            keyCondition: { summary: "测试", songs: [{ musicId: 58, title: "A" }] },
        };
        const dFinal = gateDetail(testFinal, entries, {
            now: new Date("2026-10-03T00:00:00+08:00"),
        });
        expect(dFinal.chartDifficulty).toBe("Re:MASTER");
        expect(dFinal.keyCondition.songs[0].chartKey).toBe("58-4");
    });

    it("preserves pool songs order from the gate data", () => {
        const testGate: KaleidxscopeGate = {
            ...blue,
            keyCondition: { summary: "测试", songs: [] },
            selectionPools: [
                {
                    track: 1,
                    description: "池一",
                    selection: "random",
                    songs: [
                        { musicId: 110851, title: "110851" },
                        { musicId: 10191, title: "10191" },
                        { musicId: 191, title: "191" },
                    ],
                },
            ],
        };

        const detail = gateDetail(testGate, entries, {
            now: new Date("2026-02-01T00:00:00+08:00"),
            grade: 3,
        });
        expect(detail.pools[0].songs.map(s => s.chartKey)).toEqual([
            "110851-10",
            "10191-3",
            "191-3",
        ]);
    });

    it("falls back from the grade asked for to MASTER, EXPERT and then the hardest chart", () => {
        const made = allChartEntries(
            catalogOf([
                { id: 901, title: "Two charts", charters: ["a", "b"] },
                { id: 902, title: "Three charts", charters: ["a", "b", "c"] },
                { id: 903, title: "Four charts", charters: ["a", "b", "c", "d"] },
            ])
        );
        const gate: KaleidxscopeGate = {
            ...blue,
            keyCondition: {
                summary: "测试",
                songs: [901, 902, 903].map(musicId => ({ musicId, title: String(musicId) })),
            },
            selectionPools: [],
        };
        const keysAt = (grade: number) =>
            gateDetail(gate, made, {
                now: new Date("2026-02-01T00:00:00+08:00"),
                grade,
            }).keyCondition.songs.map(song => song.chartKey);

        // The charts come hardest first, so "the first chart" of a song with nothing to match is
        // its hardest one: the song with only grades 0 and 1 gives grade 1 until 0 is asked for.
        expect(keysAt(4)).toEqual(["901-1", "902-2", "903-3"]);
        expect(keysAt(3)).toEqual(["901-1", "902-2", "903-3"]);
        expect(keysAt(2)).toEqual(["901-1", "902-2", "903-2"]);
        expect(keysAt(1)).toEqual(["901-1", "902-1", "903-1"]);
        expect(keysAt(0)).toEqual(["901-0", "902-0", "903-0"]);
    });

    it("lists a song twice when the gate names it twice", () => {
        const gate: KaleidxscopeGate = {
            ...blue,
            keyCondition: {
                summary: "测试",
                songs: [
                    { musicId: 58, title: "A" },
                    { musicId: 58, title: "A" },
                ],
            },
            selectionPools: [],
        };
        const detail = gateDetail(gate, entries, {
            now: new Date("2026-02-01T00:00:00+08:00"),
            grade: 3,
        });
        expect(detail.keyCondition.songs.map(song => song.chartKey)).toEqual(["58-3", "58-3"]);
        expect(detail.keyCondition.songCount).toBe(2);
    });

    it("includes opened status and phases in detail", () => {
        const detail = gateDetail(blue, entries, {
            now: new Date("2026-02-01T00:00:00+08:00"),
        });
        expect(detail.opened).toBe(true);
        expect(detail.phases).toHaveLength(6);
    });

    it("puts every song into pending when entries is empty", () => {
        const now = new Date("2026-10-05T00:00:00+08:00");
        const blueDetail = gateDetail(blue, [], { now });
        expect(blueDetail.keyCondition.songs).toEqual([]);
        expect(blueDetail.keyCondition.pending).toHaveLength(29);
        expect(blueDetail.pools[0].pending).toHaveLength(23);
        expect(blueDetail.pools[1].pending).toHaveLength(6);
        expect(blueDetail.pools[2].pending).toHaveLength(1);

        const expectedCounts: Record<string, { key: number; p1: number; p2: number; p3?: number }> =
            {
                blue: { key: 29, p1: 23, p2: 6, p3: 1 },
                white: { key: 6, p1: 20, p2: 9, p3: 1 },
                purple: { key: 28, p1: 11, p2: 17, p3: 1 },
                black: { key: 11, p1: 30, p2: 10, p3: 1 },
                yellow: { key: 12, p1: 33, p2: 11, p3: 1 },
                red: { key: 10, p1: 11, p2: 4, p3: 1 },
                prism: { key: 0, p1: 10, p2: 4, p3: 1 },
                noise: { key: 0, p1: 6, p2: 7, p3: 0 },
                hope: { key: 0, p1: 1, p2: 1, p3: 1 },
                final: { key: 0, p1: 1, p2: 1 },
            };

        for (const gate of kaleidxscopeGates) {
            const d = gateDetail(gate, [], { now });
            const exp = expectedCounts[gate.id];
            expect(d.keyCondition.pending).toHaveLength(exp.key);
            expect(d.pools[0].pending).toHaveLength(exp.p1);
            expect(d.pools[1].pending).toHaveLength(exp.p2);
            if (exp.p3 !== undefined) {
                expect(d.pools[2].pending).toHaveLength(exp.p3);
            }
        }
    });

    it("populates description and lifeNote for noise, blue, and final", () => {
        const now = new Date("2026-10-05T00:00:00+08:00");
        const noise = kaleidxscopeGates.find(g => g.id === "noise")!;
        const noiseDetail = gateDetail(noise, [], { now });

        expect(noiseDetail.description).toBe(
            "完成第三曲的乱码演出后获得希望钥匙；提前结束或跳过第三曲不会获得。"
        );
        expect(noiseDetail.lifeNote).toBe(
            "按开放首日 LIFE 1、每 3 天放宽一次推算，生效时间统一为 07:00。"
        );
        expect(noiseDetail.pools[2]).toEqual({
            track: 3,
            label: null,
            description: "",
            selection: "fixed",
            unlistedDescription: "乱码版 Xaleid◆scopiX",
            songs: [],
            pending: [],
        });

        const blueDetail = gateDetail(blue, [], { now });
        expect(blueDetail.description).toBeNull();
        expect(blueDetail.lifeNote).toBeNull();

        const finalGate = kaleidxscopeGates.find(g => g.id === "final")!;
        const finalDetail = gateDetail(finalGate, [], { now });
        expect(detailOfPool(finalDetail.pools, 2).label).toBe("BONUS TRACK");
        expect(detailOfPool(finalDetail.pools, 2).description).toBe(
            "首次通关后追加，强制游玩且不可跳过"
        );
        expect(detailOfPool(finalDetail.pools, 2).selection).toBe("fixed");
    });

    it("lists expected pending songs for white gate", () => {
        const white = kaleidxscopeGates.find(g => g.id === "white")!;
        const whiteDetail = gateDetail(white, [], { now: new Date("2026-10-05T00:00:00+08:00") });

        expect(whiteDetail.keyCondition.pending).toEqual([
            { musicId: 11102, title: "封焔の135秒" },
            { musicId: 11234, title: "ほしぞらスペクタクル" },
            { musicId: 11300, title: "U&iVERSE -銀河鸞翔-" },
            { musicId: 11529, title: "ツムギボシ" },
            { musicId: 11542, title: "ここからはじまるプロローグ。 (Kanon Remix)" },
            { musicId: 11612, title: "Latent Kingdom" },
        ]);
        expect(whiteDetail.pools[2].pending).toEqual([{ musicId: 11745, title: "氷滅の135小節" }]);
    });
});

function detailOfPool<T extends { track: number }>(pools: readonly T[], track: number): T {
    return pools.find(p => p.track === track)!;
}
