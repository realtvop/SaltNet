import type { Course } from "@core/course";
import { courses } from "@core/course";
import { describe, expect, it } from "vitest";
import { courseInfo, courseTracks } from "../../src/catalog/courseView";
import { fixtureSongCatalog } from "../fixtureCatalog";
import { catalogOf } from "../madeCatalog";

describe("courseInfo", () => {
    const EXPECTED_COURSES = [
        {
            id: 551001,
            name: "初段",
            mode: "段位认定",
            locked: false,
            unlockCourse: null,
            trackCount: 4,
            life: {
                initial: 350,
                recovery: 20,
                damage: { perfect: 0, great: 0, good: 2, miss: 5 },
            },
        },
        {
            id: 551002,
            name: "二段",
            mode: "段位认定",
            locked: false,
            unlockCourse: null,
            trackCount: 4,
            life: {
                initial: 350,
                recovery: 20,
                damage: { perfect: 0, great: 0, good: 2, miss: 5 },
            },
        },
        {
            id: 551003,
            name: "三段",
            mode: "段位认定",
            locked: false,
            unlockCourse: null,
            trackCount: 4,
            life: {
                initial: 600,
                recovery: 50,
                damage: { perfect: 0, great: 1, good: 2, miss: 5 },
            },
        },
        {
            id: 551004,
            name: "四段",
            mode: "段位认定",
            locked: false,
            unlockCourse: null,
            trackCount: 4,
            life: {
                initial: 700,
                recovery: 50,
                damage: { perfect: 0, great: 2, good: 2, miss: 5 },
            },
        },
        {
            id: 551005,
            name: "五段",
            mode: "段位认定",
            locked: false,
            unlockCourse: null,
            trackCount: 4,
            life: {
                initial: 700,
                recovery: 50,
                damage: { perfect: 0, great: 2, good: 2, miss: 5 },
            },
        },
        {
            id: 551006,
            name: "六段",
            mode: "段位认定",
            locked: false,
            unlockCourse: null,
            trackCount: 4,
            life: {
                initial: 700,
                recovery: 50,
                damage: { perfect: 0, great: 2, good: 2, miss: 5 },
            },
        },
        {
            id: 551007,
            name: "七段",
            mode: "段位认定",
            locked: false,
            unlockCourse: null,
            trackCount: 4,
            life: {
                initial: 700,
                recovery: 50,
                damage: { perfect: 0, great: 2, good: 2, miss: 5 },
            },
        },
        {
            id: 551008,
            name: "八段",
            mode: "段位认定",
            locked: false,
            unlockCourse: null,
            trackCount: 4,
            life: {
                initial: 700,
                recovery: 20,
                damage: { perfect: 0, great: 2, good: 2, miss: 5 },
            },
        },
        {
            id: 551009,
            name: "九段",
            mode: "段位认定",
            locked: false,
            unlockCourse: null,
            trackCount: 4,
            life: {
                initial: 800,
                recovery: 30,
                damage: { perfect: 0, great: 2, good: 2, miss: 5 },
            },
        },
        {
            id: 551010,
            name: "十段",
            mode: "段位认定",
            locked: false,
            unlockCourse: null,
            trackCount: 4,
            life: {
                initial: 900,
                recovery: 30,
                damage: { perfect: 0, great: 2, good: 2, miss: 5 },
            },
        },
        {
            id: 551101,
            name: "真初段",
            mode: "真段位认定",
            locked: true,
            unlockCourse: { id: 551010, name: "十段" },
            trackCount: 4,
            life: { initial: 50, recovery: 10, damage: { perfect: 0, great: 2, good: 3, miss: 5 } },
        },
        {
            id: 551102,
            name: "真二段",
            mode: "真段位认定",
            locked: true,
            unlockCourse: { id: 551010, name: "十段" },
            trackCount: 4,
            life: { initial: 50, recovery: 10, damage: { perfect: 0, great: 2, good: 3, miss: 5 } },
        },
        {
            id: 551103,
            name: "真三段",
            mode: "真段位认定",
            locked: true,
            unlockCourse: { id: 551010, name: "十段" },
            trackCount: 4,
            life: { initial: 50, recovery: 10, damage: { perfect: 0, great: 2, good: 3, miss: 5 } },
        },
        {
            id: 551104,
            name: "真四段",
            mode: "真段位认定",
            locked: true,
            unlockCourse: { id: 551010, name: "十段" },
            trackCount: 4,
            life: { initial: 50, recovery: 10, damage: { perfect: 0, great: 2, good: 3, miss: 5 } },
        },
        {
            id: 551105,
            name: "真五段",
            mode: "真段位认定",
            locked: true,
            unlockCourse: { id: 551010, name: "十段" },
            trackCount: 4,
            life: { initial: 50, recovery: 10, damage: { perfect: 0, great: 2, good: 3, miss: 5 } },
        },
        {
            id: 551106,
            name: "真六段",
            mode: "真段位认定",
            locked: true,
            unlockCourse: { id: 551010, name: "十段" },
            trackCount: 4,
            life: { initial: 50, recovery: 10, damage: { perfect: 0, great: 2, good: 3, miss: 5 } },
        },
        {
            id: 551107,
            name: "真七段",
            mode: "真段位认定",
            locked: true,
            unlockCourse: { id: 551010, name: "十段" },
            trackCount: 4,
            life: { initial: 50, recovery: 10, damage: { perfect: 0, great: 2, good: 3, miss: 5 } },
        },
        {
            id: 551108,
            name: "真八段",
            mode: "真段位认定",
            locked: true,
            unlockCourse: { id: 551010, name: "十段" },
            trackCount: 4,
            life: { initial: 50, recovery: 10, damage: { perfect: 0, great: 2, good: 3, miss: 5 } },
        },
        {
            id: 551109,
            name: "真九段",
            mode: "真段位认定",
            locked: true,
            unlockCourse: { id: 551010, name: "十段" },
            trackCount: 4,
            life: { initial: 50, recovery: 10, damage: { perfect: 0, great: 2, good: 3, miss: 5 } },
        },
        {
            id: 551110,
            name: "真十段",
            mode: "真段位认定",
            locked: true,
            unlockCourse: { id: 551010, name: "十段" },
            trackCount: 4,
            life: { initial: 50, recovery: 10, damage: { perfect: 0, great: 2, good: 3, miss: 5 } },
        },
        {
            id: 551111,
            name: "真皆伝",
            mode: "真段位认定",
            locked: true,
            unlockCourse: { id: 551010, name: "十段" },
            trackCount: 4,
            life: { initial: 50, recovery: 5, damage: { perfect: 0, great: 2, good: 3, miss: 5 } },
        },
        {
            id: 551112,
            name: "裏皆伝",
            mode: "真段位认定",
            locked: true,
            unlockCourse: { id: 551111, name: "真皆伝" },
            trackCount: 4,
            life: { initial: 10, recovery: 0, damage: { perfect: 0, great: 1, good: 3, miss: 10 } },
        },
    ];

    it("matches all 22 courses against the literal table", () => {
        expect(courses).toHaveLength(22);
        for (let i = 0; i < courses.length; i++) {
            expect(courseInfo(courses[i])).toEqual(EXPECTED_COURSES[i]);
        }
    });

    it("sets unlockCourse.name to null when all has no matching course", () => {
        const shinNidan = courses.find(c => c.name === "真二段")!;
        expect(courseInfo(shinNidan, [])).toEqual({
            id: 551102,
            name: "真二段",
            mode: "真段位认定",
            locked: true,
            unlockCourse: { id: 551010, name: null },
            trackCount: 4,
            life: { initial: 50, recovery: 10, damage: { perfect: 0, great: 2, good: 3, miss: 5 } },
        });

        expect(courseInfo(shinNidan, courses).unlockCourse).toEqual({
            id: 551010,
            name: "十段",
        });
    });

    it("sets unlockCourse to null when isLocked is false even if unlockCourseId is set", () => {
        const fakeUnlocked = {
            ...courses[0],
            isLocked: false,
            unlockCourseId: 551010,
        };
        const info = courseInfo(fakeUnlocked as Course, courses);
        expect(info.locked).toBe(false);
        expect(info.unlockCourse).toBeNull();
    });

    it("returns a copy of life.damage so mutations do not affect the data", () => {
        const shodan = courses.find(c => c.name === "初段")!;
        const info = courseInfo(shodan);
        (info.life.damage as unknown as { good: number }).good = 99;

        const info2 = courseInfo(shodan);
        expect(info2.life.damage.good).toBe(2);
    });

    it("counts the tracks the course has", () => {
        const threeTracks = { ...courses[0], tracks: courses[0].tracks.slice(0, 3) } as Course;
        expect(courseInfo(threeTracks).trackCount).toBe(3);
    });
});

describe("courseTracks", () => {
    const catalog = fixtureSongCatalog();

    it("resolves tracks for 初段 on the fixture catalog", () => {
        const shodan = courses.find(c => c.name === "初段")!;
        const result = courseTracks(shodan, catalog);

        expect(result.tracks).toEqual([
            {
                track: 1,
                chartKey: "10256-0",
                musicId: 10256,
                title: "いーあるふぁんくらぶ",
                type: "DX",
                difficulty: "BASIC",
                level: "2",
                constant: 2,
                fitConstant: null,
                version: "舞萌DX",
                score: null,
                b50: null,
            },
        ]);
        expect(result.missing).toEqual([
            {
                track: 2,
                chartKey: "11052-0",
                musicId: 11052,
                title: "グリーンライツ・セレナーデ",
                difficulty: "BASIC",
            },
            {
                track: 3,
                chartKey: "10319-0",
                musicId: 10319,
                title: "幻想のサテライト",
                difficulty: "BASIC",
            },
            {
                track: 4,
                chartKey: "617-0",
                musicId: 617,
                title: "オトヒメモリー☆ウタゲーション",
                difficulty: "BASIC",
            },
        ]);
    });

    it("resolves tracks for 真二段 on the fixture catalog", () => {
        const shinNidan = courses.find(c => c.name === "真二段")!;
        const result = courseTracks(shinNidan, catalog);

        expect(result.tracks).toEqual([
            {
                track: 3,
                chartKey: "191-2",
                musicId: 191,
                title: "脳漿炸裂ガール",
                type: "SD",
                difficulty: "EXPERT",
                level: "12+",
                constant: 12.7,
                fitConstant: null,
                version: "maimai GreeN",
                score: null,
                b50: null,
            },
        ]);
        expect(result.missing).toEqual([
            {
                track: 1,
                chartKey: "791-3",
                musicId: 791,
                title: "ロールプレイングゲーム",
                difficulty: "MASTER",
            },
            {
                track: 2,
                chartKey: "11199-3",
                musicId: 11199,
                title: "悪戯センセーション",
                difficulty: "MASTER",
            },
            {
                track: 4,
                chartKey: "11532-3",
                musicId: 11532,
                title: "ヱデン",
                difficulty: "MASTER",
            },
        ]);
    });

    it("resolves tracks for 裏皆伝 on the fixture catalog", () => {
        const urakaiden = courses.find(c => c.name === "裏皆伝")!;
        const result = courseTracks(urakaiden, catalog);

        expect(result.tracks).toEqual([]);
        expect(result.missing).toEqual([
            {
                track: 1,
                chartKey: "834-4",
                musicId: 834,
                title: "PANDORA PARADOXXX",
                difficulty: "Re:MASTER",
            },
            {
                track: 2,
                chartKey: "11612-3",
                musicId: 11612,
                title: "Latent Kingdom",
                difficulty: "MASTER",
            },
            {
                track: 3,
                chartKey: "11662-3",
                musicId: 11662,
                title: "raputa",
                difficulty: "MASTER",
            },
            {
                track: 4,
                chartKey: "11663-4",
                musicId: 11663,
                title: "系ぎて",
                difficulty: "Re:MASTER",
            },
        ]);
    });

    it("resolves tracks for 十段 on the fixture catalog in play order", () => {
        const judan = courses.find(c => c.name === "十段")!;
        const result = courseTracks(judan, catalog);

        expect(result.tracks).toEqual([]);
        expect(result.missing).toEqual([
            {
                track: 1,
                chartKey: "840-3",
                musicId: 840,
                title: "Imperishable Night 2006 (2016 Refine)",
                difficulty: "MASTER",
            },
            {
                track: 2,
                chartKey: "11207-3",
                musicId: 11207,
                title: "Ether Strike",
                difficulty: "MASTER",
            },
            {
                track: 3,
                chartKey: "11412-3",
                musicId: 11412,
                title: "初音天地開闢神話",
                difficulty: "MASTER",
            },
            {
                track: 4,
                chartKey: "227-3",
                musicId: 227,
                title: "Garakuta Doll Play",
                difficulty: "MASTER",
            },
        ]);
    });

    it("writes the track number in front of the chart row", () => {
        const shodan = courses.find(c => c.name === "初段")!;
        const [row] = courseTracks(shodan, catalog).tracks;
        expect(Object.keys(row).slice(0, 3)).toEqual(["track", "chartKey", "musicId"]);
    });

    it("preserves play order and track numbers with a custom catalog", () => {
        const customCatalog = catalogOf([
            { id: 901, title: "Song 901", charters: ["a", "b", "c", "d"] },
            { id: 902, title: "Song 902", charters: ["a", "b", "c", "d"] },
            { id: 903, title: "Song 903", charters: ["a", "b", "c", "d"] },
        ]);

        const customCourse = {
            ...courses[0],
            tracks: [
                { musicId: 903, difficulty: 3, title: "Song 903" },
                { musicId: 901, difficulty: 3, title: "Song 901" },
                { musicId: 902, difficulty: 3, title: "Song 902" },
            ],
        } as unknown as Course;

        const result = courseTracks(customCourse, customCatalog);
        expect(result.missing).toEqual([]);
        expect(result.tracks.map(t => ({ track: t.track, chartKey: t.chartKey }))).toEqual([
            { track: 1, chartKey: "903-3" },
            { track: 2, chartKey: "901-3" },
            { track: 3, chartKey: "902-3" },
        ]);
    });

    it("handles duplicated tracks without de-duplicating", () => {
        const customCatalog = catalogOf([
            { id: 901, title: "Song 901", charters: ["a", "b", "c", "d"] },
        ]);

        const customCourse = {
            ...courses[0],
            tracks: [
                { musicId: 901, difficulty: 3, title: "Song 901" },
                { musicId: 999, difficulty: 3, title: "Song 999" },
                { musicId: 901, difficulty: 3, title: "Song 901" },
            ],
        } as unknown as Course;

        const result = courseTracks(customCourse, customCatalog);
        expect(result.tracks.map(t => ({ track: t.track, chartKey: t.chartKey }))).toEqual([
            { track: 1, chartKey: "901-3" },
            { track: 3, chartKey: "901-3" },
        ]);
        expect(result.missing).toEqual([
            {
                track: 2,
                chartKey: "999-3",
                musicId: 999,
                title: "Song 999",
                difficulty: "MASTER",
            },
        ]);
    });
});
