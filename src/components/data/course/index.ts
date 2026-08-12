import type { Chart } from "@/components/data/music/type";
import rawCourseData from "./courses.json";
import type { Course, CourseDataSet, CourseTrack } from "./type";

const courseData: CourseDataSet = rawCourseData;

export const courseSourceVersion = courseData.sourceVersion;
export const courseNetOpenId = courseData.netOpenId;
export const courses: readonly Course[] = courseData.courses;

export function getCourseTrackKey(track: Pick<CourseTrack, "musicId" | "difficulty">): string {
    return `${track.musicId}-${track.difficulty}`;
}

/**
 * Resolves the charts for a course while preserving the source play order.
 * Missing charts are omitted so callers can decide how to present unavailable metadata.
 */
export function getCourseCharts(course: Course, charts: readonly Chart[]): Chart[] {
    const chartsByTrack = new Map(
        charts.map(chart => [
            getCourseTrackKey({
                musicId: chart.music.id,
                difficulty: chart.info.grade,
            }),
            chart,
        ])
    );

    return course.tracks.flatMap(track => {
        const chart = chartsByTrack.get(getCourseTrackKey(track));
        return chart ? [chart] : [];
    });
}

export type {
    Course,
    CourseDataSet,
    CourseDamage,
    CourseLifeRule,
    CourseMode,
    CourseTrack,
} from "./type";
