/**
 * Dan courses as the commands print them (design 3.2): the rule a course is played under, and
 * its tracks as the chart rows every command shares. The courses ship with the CLI; only the
 * tracks need the catalog, and a track the catalog lacks is reported instead of dropped.
 */
import type { Course, CourseDamage } from "@core/course";
import type { ChartRow } from "./chartRow";
import type { SongCatalog } from "./songs";
import { courses as allCourses } from "@core/course";
import { difficultyLabel } from "../refs/difficulty";
import { chartRow } from "./chartRow";
import { chartKey } from "./songs";

export interface CourseInfo {
    readonly id: number;
    readonly name: string;
    /** `段位认定` or `真段位认定`. */
    readonly mode: string;
    /** Whether the course has to be unlocked by clearing another one first. */
    readonly locked: boolean;
    /** The course that unlocks this one; null for a course that is open from the start. */
    readonly unlockCourse: { readonly id: number; readonly name: string | null } | null;
    readonly trackCount: number;
    readonly life: {
        /** The life the course starts with. */
        readonly initial: number;
        /** The life given back after each track, as the web app shows it (`恢复 +20`). */
        readonly recovery: number;
        /** The life each judgment takes away. */
        readonly damage: CourseDamage;
    };
}

export function courseInfo(course: Course, all: readonly Course[] = allCourses): CourseInfo {
    return {
        id: course.id,
        name: course.name,
        mode: course.mode.name,
        locked: course.isLocked,
        unlockCourse: course.isLocked
            ? {
                  id: course.unlockCourseId,
                  name: all.find(other => other.id === course.unlockCourseId)?.name ?? null,
              }
            : null,
        trackCount: course.tracks.length,
        life: {
            initial: course.life.initial,
            recovery: course.life.recovery,
            damage: { ...course.life.damage },
        },
    };
}

/** A track as a chart row, with its place in the order the course is played. */
export interface CourseTrackRow extends ChartRow {
    /** From 1. */
    readonly track: number;
}

/** A track whose chart is not in the catalog (a song the loaded metadata does not have yet). */
export interface MissingCourseTrack {
    readonly track: number;
    readonly chartKey: string;
    readonly musicId: number;
    readonly title: string;
    readonly difficulty: string;
}

export interface CourseTracks {
    /** The tracks the catalog has, in play order. */
    readonly tracks: readonly CourseTrackRow[];
    readonly missing: readonly MissingCourseTrack[];
}

export function courseTracks(course: Course, catalog: SongCatalog): CourseTracks {
    const tracks: CourseTrackRow[] = [];
    const missing: MissingCourseTrack[] = [];
    course.tracks.forEach((track, index) => {
        const key = chartKey(track.musicId, track.difficulty);
        const entry = catalog.chartByKey.get(key);
        if (entry) {
            tracks.push({ track: index + 1, ...chartRow(entry) });
        } else {
            missing.push({
                track: index + 1,
                chartKey: key,
                musicId: track.musicId,
                title: track.title,
                difficulty: difficultyLabel(track.difficulty),
            });
        }
    });
    return { tracks, missing };
}
