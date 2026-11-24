import type { Store } from "../../src/store/store";
import { characters, partners } from "@core/collection/static";
import { courseNetOpenId, courses, courseSourceVersion, getCourseCharts } from "@core/course";
import { getFixtureLXNSCollections } from "@core/fixtures/lxns";
import { getFixtureSaltMetaCompacted } from "@core/fixtures/saltmeta";
import { buildSaltMetaMusicList } from "@core/music/fetch";
import { afterEach, describe, expect, it } from "vitest";
import { loadCollectionLists } from "../../src/catalog/load";
import { ensureStaticData, staticBuilder } from "../../src/catalog/static";
import { readMetaState, replaceCollections, replaceMusic } from "../../src/catalog/store";
import { openStore } from "../../src/store/store";
import { useTempHome } from "../tempHome";

const home = useTempHome();
const opened: Store[] = [];

afterEach(() => {
    for (const store of opened.splice(0)) store.close();
});

function open(): Store {
    const store = openStore(home());
    opened.push(store);
    return store;
}

function all<T = Record<string, unknown>>(store: Store, sql: string, ...params: string[]): T[] {
    return store.db.prepare(sql).all(...params) as T[];
}

function count(store: Store, sql: string): number {
    return all<{ n: number }>(store, `SELECT count(*) AS n FROM ${sql}`)[0].n;
}

const AT = new Date("2026-11-11T01:00:00Z");

describe("the builder", () => {
    it("names the layout and a fingerprint of the data", () => {
        expect(staticBuilder()).toMatch(/^static-1\/[0-9a-f]{12}$/);
        expect(staticBuilder()).toBe(staticBuilder());
    });
});

describe("writing the static data", () => {
    it("writes every course with its life rule, and its tracks in order", () => {
        const store = open();
        expect(ensureStaticData(store, AT)).toBe(true);

        expect(count(store, "courses")).toBe(courses.length);
        expect(count(store, "course_tracks")).toBe(
            courses.reduce((total, course) => total + course.tracks.length, 0)
        );
        expect(courses.length).toBeGreaterThan(0);

        const [first] = courses;
        expect(all(store, "SELECT * FROM courses WHERE id = ?", String(first.id))).toEqual([
            {
                id: first.id,
                position: 0,
                name: first.name,
                mode_id: first.mode.id,
                mode_name: first.mode.name,
                base_dani_id: first.baseDaniId,
                is_locked: first.isLocked ? 1 : 0,
                unlock_course_id: first.unlockCourseId,
                life_initial: first.life.initial,
                life_recovery: first.life.recovery,
                damage_perfect: first.life.damage.perfect,
                damage_great: first.life.damage.great,
                damage_good: first.life.damage.good,
                damage_miss: first.life.damage.miss,
            },
        ]);
        expect(
            all(
                store,
                "SELECT position, chart_key, music_id, title, difficulty FROM course_tracks WHERE course_id = ? ORDER BY position",
                String(first.id)
            )
        ).toEqual(
            first.tracks.map((track, position) => ({
                position,
                chart_key: `${track.musicId}-${track.difficulty}`,
                music_id: track.musicId,
                title: track.title,
                difficulty: track.difficulty,
            }))
        );
    });

    it("writes the travel companions and the partners as collections", () => {
        const store = open();
        ensureStaticData(store, AT);

        expect(count(store, "collections WHERE kind = 'character'")).toBe(characters.length);
        expect(count(store, "collections WHERE kind = 'partner'")).toBe(partners.length);
        expect(characters.length).toBeGreaterThan(0);
        expect(partners.length).toBeGreaterThan(0);

        const [character] = all<{ id: number; name: string; genre: string; raw: string }>(
            store,
            "SELECT * FROM collections WHERE kind = 'character' ORDER BY position LIMIT 1"
        );
        expect(character).toMatchObject({
            id: characters[0].id,
            name: characters[0].name,
            genre: characters[0].genre,
        });
        expect(JSON.parse(character.raw)).toEqual(characters[0]);

        const stored = all<{ raw: string }>(
            store,
            "SELECT raw FROM collections WHERE kind = 'partner' ORDER BY position"
        );
        expect(stored.map(row => JSON.parse(row.raw))).toEqual(partners);
    });

    it("lets a course track join its chart by chart_key", () => {
        const store = open();
        const built = buildSaltMetaMusicList(getFixtureSaltMetaCompacted(), {
            mergeDuplicates: true,
        });
        replaceMusic(store, built, { fetchedAt: 1000, upstreamVersion: "1" });
        ensureStaticData(store, AT);

        // The web app's own matching of a track to a chart is the reference.
        const charts = Object.values(built.music.chartList);
        const expected = courses.reduce(
            (total, course) => total + getCourseCharts(course, charts).length,
            0
        );
        expect(expected).toBeGreaterThan(0);
        expect(count(store, "course_tracks t JOIN charts c ON c.chart_key = t.chart_key")).toBe(
            expected
        );
    });

    it("records what was written and when", () => {
        const store = open();
        ensureStaticData(store, AT);

        expect(readMetaState(store, "static")).toEqual({
            source: "static",
            fetchedAt: AT.getTime(),
            upstreamVersion: null,
            builder: staticBuilder(),
            detail: {
                courses: courses.length,
                courseTracks: count(store, "course_tracks"),
                characters: characters.length,
                partners: partners.length,
                courseSourceVersion,
                courseNetOpenId,
            },
        });
    });
});

describe("writing it again", () => {
    it("does nothing while the data is the same", () => {
        const store = open();
        expect(ensureStaticData(store, AT)).toBe(true);
        expect(ensureStaticData(store, new Date(AT.getTime() + 60_000))).toBe(false);

        expect(readMetaState(store, "static")?.fetchedAt).toBe(AT.getTime());
        expect(count(store, "courses")).toBe(courses.length);
    });

    it("replaces the rows when the database was written from other data", () => {
        const store = open();
        ensureStaticData(store, AT);
        // What an older CLI would have left: another builder, and rows that are not the current ones.
        store.db.exec(
            "UPDATE meta_state SET builder = 'static-1/000000000000' WHERE source = 'static'"
        );
        store.db.exec("DELETE FROM course_tracks");
        store.db.exec("UPDATE courses SET name = 'old'");
        store.db.exec("DELETE FROM collections WHERE kind = 'partner'");

        const later = new Date(AT.getTime() + 60_000);
        expect(ensureStaticData(store, later)).toBe(true);

        expect(count(store, "courses WHERE name = 'old'")).toBe(0);
        expect(count(store, "course_tracks")).toBeGreaterThan(0);
        expect(count(store, "collections WHERE kind = 'partner'")).toBe(partners.length);
        expect(readMetaState(store, "static")?.fetchedAt).toBe(later.getTime());
    });
});

describe("next to the downloaded collections", () => {
    it("is left alone by a refresh of the LXNS lists", () => {
        const store = open();
        ensureStaticData(store, AT);
        replaceCollections(store, getFixtureLXNSCollections(), { fetchedAt: 2000 });
        replaceCollections(store, getFixtureLXNSCollections(), { fetchedAt: 3000 });

        expect(count(store, "collections WHERE kind = 'character'")).toBe(characters.length);
        expect(count(store, "collections WHERE kind = 'partner'")).toBe(partners.length);
        expect(count(store, "collections WHERE kind IN ('title', 'icon', 'plate', 'frame')")).toBe(
            27
        );
    });

    it("does not leak into the LXNS lists that are loaded back", () => {
        const store = open();
        ensureStaticData(store, AT);
        replaceCollections(store, getFixtureLXNSCollections(), { fetchedAt: 2000 });

        expect(loadCollectionLists(store)).toEqual(getFixtureLXNSCollections());
    });

    it("leaves the downloaded collections alone when it writes", () => {
        const store = open();
        replaceCollections(store, getFixtureLXNSCollections(), { fetchedAt: 2000 });
        ensureStaticData(store, AT);

        expect(count(store, "collections WHERE kind IN ('title', 'icon', 'plate', 'frame')")).toBe(
            27
        );
        expect(readMetaState(store, "lxns-collections")?.fetchedAt).toBe(2000);
    });
});
