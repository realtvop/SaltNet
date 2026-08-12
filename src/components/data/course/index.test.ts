import { describe, expect, it } from "vitest";
import type { Chart } from "@/components/data/music/type";
import { courseNetOpenId, courses, courseSourceVersion, getCourseCharts } from "./index";

function makeChart(musicId: number, difficulty: number): Chart {
    return {
        id: musicId * 10 + difficulty,
        info: { grade: difficulty },
        music: { id: musicId },
    } as Chart;
}

describe("course data", () => {
    it("contains the complete course155 snapshot", () => {
        expect(courseSourceVersion).toBe(155);
        expect(courseNetOpenId).toBe(260610);
        expect(courses).toHaveLength(22);
        expect(new Set(courses.map(course => course.id))).toHaveProperty("size", courses.length);
        expect(courses.every(course => course.tracks.length === 4)).toBe(true);
        expect(
            courses
                .flatMap(course => course.tracks)
                .every(track => track.difficulty >= 0 && track.difficulty <= 4)
        ).toBe(true);

        expect(courses[0]).toMatchObject({
            id: 551001,
            name: "初段",
            life: { initial: 350, recovery: 20 },
        });
        expect(courses.at(-1)).toMatchObject({
            id: 551112,
            name: "裏皆伝",
            life: { initial: 10, recovery: 0 },
        });
    });

    it("matches music and difficulty while preserving the four-song play order", () => {
        const course = courses[5];
        const expectedCharts = course.tracks.map(track =>
            makeChart(track.musicId, track.difficulty)
        );
        const wrongDifficulty = makeChart(
            course.tracks[0].musicId,
            course.tracks[0].difficulty + 1
        );

        const actual = getCourseCharts(course, [wrongDifficulty, ...[...expectedCharts].reverse()]);

        expect(actual.map(chart => chart.id)).toEqual(expectedCharts.map(chart => chart.id));
    });

    it("omits tracks whose chart metadata is unavailable", () => {
        const course = courses[0];
        const available = makeChart(course.tracks[2].musicId, course.tracks[2].difficulty);

        expect(getCourseCharts(course, [available])).toEqual([available]);
    });
});
