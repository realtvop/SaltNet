/**
 * The data that ships with the CLI (design 2.2): the travel companions and the partners, and the
 * dan courses. The commands read the same data straight from core; it is also written into the
 * database so that SQL can join it with the charts. It is written again whenever its content
 * changes, so a database never keeps rows from older data than the CLI that reads it.
 */
import type { Store } from "../store/store";
import { createHash } from "node:crypto";
import { characterGenres, characters, partners } from "@core/collection/static";
import { courseNetOpenId, courses, courseSourceVersion, getCourseTrackKey } from "@core/course";
import { readMetaState, writeMetaState } from "./store";

let builder: string | undefined;

/**
 * Names the data that is compiled into this CLI: the number in front is the layout of the rows
 * written here, and the rest is a fingerprint of the data itself, so a change to the data files
 * is noticed without anyone having to remember to raise a version.
 */
export function staticBuilder(): string {
    builder ??= `static-1/${createHash("sha256")
        .update(
            JSON.stringify({
                courseSourceVersion,
                courseNetOpenId,
                courses,
                characters,
                characterGenres,
                partners,
            })
        )
        .digest("hex")
        .slice(0, 12)}`;
    return builder;
}

/**
 * Writes the courses, characters and partners unless the database already has the data this CLI
 * ships with. It returns whether it wrote anything.
 */
export function ensureStaticData(store: Store, now: Date): boolean {
    const wanted = staticBuilder();
    if (readMetaState(store, "static")?.builder === wanted) return false;

    const { db } = store;
    return store.transaction(() => {
        // Another process may have written it while this one waited for the write lock.
        if (readMetaState(store, "static")?.builder === wanted) return false;

        db.exec("DELETE FROM course_tracks");
        db.exec("DELETE FROM courses");
        db.exec("DELETE FROM collections WHERE kind IN ('character', 'partner')");

        const insertCourse = db.prepare(
            `INSERT INTO courses (id, position, name, mode_id, mode_name, base_dani_id, is_locked, unlock_course_id,
                                  life_initial, life_recovery, damage_perfect, damage_great, damage_good, damage_miss)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        const insertTrack = db.prepare(
            `INSERT INTO course_tracks (course_id, position, chart_key, music_id, title, difficulty)
             VALUES (?, ?, ?, ?, ?, ?)`
        );
        let tracks = 0;
        courses.forEach((course, position) => {
            const { life } = course;
            insertCourse.run(
                course.id,
                position,
                course.name,
                course.mode.id,
                course.mode.name,
                course.baseDaniId,
                course.isLocked ? 1 : 0,
                course.unlockCourseId,
                life.initial,
                life.recovery,
                life.damage.perfect,
                life.damage.great,
                life.damage.good,
                life.damage.miss
            );
            course.tracks.forEach((track, index) => {
                insertTrack.run(
                    course.id,
                    index,
                    getCourseTrackKey(track),
                    track.musicId,
                    track.title,
                    track.difficulty
                );
                tracks++;
            });
        });

        const insertCollection = db.prepare(
            `INSERT INTO collections (kind, id, position, name, genre, description, color, required, raw)
             VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)`
        );
        characters.forEach((character, position) =>
            insertCollection.run(
                "character",
                character.id,
                position,
                character.name,
                character.genre,
                null,
                JSON.stringify(character)
            )
        );
        partners.forEach((partner, position) =>
            insertCollection.run(
                "partner",
                partner.id,
                position,
                partner.name,
                null,
                partner.description,
                JSON.stringify(partner)
            )
        );

        writeMetaState(store, {
            source: "static",
            fetchedAt: now.getTime(),
            upstreamVersion: null,
            builder: wanted,
            detail: {
                courses: courses.length,
                courseTracks: tracks,
                characters: characters.length,
                partners: partners.length,
                courseSourceVersion,
                courseNetOpenId,
            },
        });
        return true;
    });
}
