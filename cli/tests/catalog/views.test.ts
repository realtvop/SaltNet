import type { MetadataKind } from "../../src/catalog/ensure";
import type { PublicView, ViewColumnType } from "../../src/catalog/views";
import type { RuntimePaths } from "../../src/runtime/paths";
import type { Sandbox } from "../../src/store/sandbox";
import { mapLXNSCollections } from "@core/collection/map";
import { courses, getCourseTrackKey } from "@core/course";
import { getFixtureLXNSCollections } from "@core/fixtures/lxns";
import { getFixtureSaltMetaCompacted } from "@core/fixtures/saltmeta";
import { buildSaltMetaMusicList } from "@core/music/fetch";
import { getSaltNetMusicIdForChartType } from "@core/music/saltmeta";
import { afterEach, describe, expect, it } from "vitest";
import { chartDetails, chartRow } from "../../src/catalog/chartRow";
import { collectionDetail, collectionRow } from "../../src/catalog/collectionView";
import { ensureStaticData } from "../../src/catalog/static";
import { replaceCollections, replaceMusic } from "../../src/catalog/store";
import {
    fetchedAtOf,
    PUBLIC_VIEW_NAMES,
    PUBLIC_VIEWS,
    VIEWS_VERSION,
    viewsMentionedIn,
} from "../../src/catalog/views";
import { collectionRef, listCollections } from "../../src/refs/collection";
import { difficultyLabel } from "../../src/refs/difficulty";
import { runQuery } from "../../src/store/query";
import { openSandbox } from "../../src/store/sandbox";
import { openStore } from "../../src/store/store";
import { caught } from "../caught";
import { NOW } from "../commandRun";
import { fixtureSongCatalog } from "../fixtureCatalog";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();
const openedSandboxes: Sandbox<unknown>[] = [];

afterEach(() => {
    for (const sb of openedSandboxes.splice(0)) sb.close();
});

function populate(
    paths: RuntimePaths,
    parts: { music?: boolean; collections?: boolean; static?: boolean }
): void {
    const store = openStore(paths);
    if (parts.music) {
        replaceMusic(
            store,
            buildSaltMetaMusicList(getFixtureSaltMetaCompacted(), { mergeDuplicates: true }),
            { fetchedAt: 1000, upstreamVersion: "1" }
        );
    }
    if (parts.collections) {
        replaceCollections(store, getFixtureLXNSCollections(), { fetchedAt: 2000 });
    }
    if (parts.static) {
        ensureStaticData(store, NOW);
    }
    store.close();
}

function sandboxOf<T = undefined>(
    paths: RuntimePaths,
    views: readonly PublicView[],
    readAlso?: (db: Sandbox<T>["db"]) => T
): Sandbox<T> {
    const sb = openSandbox<T>({ database: paths.database, views, readAlso });
    openedSandboxes.push(sb as unknown as Sandbox<unknown>);
    return sb;
}

describe("views contract", () => {
    const EXPECTED_VIEWS: readonly {
        readonly name: string;
        readonly needs: readonly MetadataKind[];
        readonly columns: readonly { readonly name: string; readonly type: ViewColumnType }[];
    }[] = [
        {
            name: "v_charts",
            needs: ["catalog"],
            columns: [
                { name: "chart_key", type: "TEXT" },
                { name: "music_id", type: "INTEGER" },
                { name: "song_id", type: "INTEGER" },
                { name: "title", type: "TEXT" },
                { name: "artist", type: "TEXT" },
                { name: "genre", type: "TEXT" },
                { name: "bpm", type: "REAL" },
                { name: "type", type: "TEXT" },
                { name: "difficulty", type: "TEXT" },
                { name: "grade", type: "INTEGER" },
                { name: "level", type: "TEXT" },
                { name: "constant", type: "REAL" },
                { name: "fit_constant", type: "REAL" },
                { name: "version", type: "TEXT" },
                { name: "is_new", type: "INTEGER" },
                { name: "charter", type: "TEXT" },
                { name: "notes_tap", type: "INTEGER" },
                { name: "notes_hold", type: "INTEGER" },
                { name: "notes_slide", type: "INTEGER" },
                { name: "notes_touch", type: "INTEGER" },
                { name: "notes_break", type: "INTEGER" },
                { name: "notes_total", type: "INTEGER" },
                { name: "stat_samples", type: "INTEGER" },
                { name: "stat_avg_achievements", type: "REAL" },
                { name: "stat_avg_dx_score", type: "REAL" },
                { name: "stat_std_dev_achievements", type: "REAL" },
                { name: "stat_rank_dist", type: "TEXT" },
                { name: "stat_combo_dist", type: "TEXT" },
            ],
        },
        {
            name: "v_collections",
            needs: ["collections"],
            columns: [
                { name: "ref", type: "TEXT" },
                { name: "kind", type: "TEXT" },
                { name: "id", type: "INTEGER" },
                { name: "name", type: "TEXT" },
                { name: "genre", type: "TEXT" },
                { name: "color", type: "TEXT" },
                { name: "description", type: "TEXT" },
                { name: "song_count", type: "INTEGER" },
            ],
        },
        {
            name: "v_collection_targets",
            needs: ["collections"],
            columns: [
                { name: "collection_ref", type: "TEXT" },
                { name: "collection_kind", type: "TEXT" },
                { name: "collection_id", type: "INTEGER" },
                { name: "condition", type: "INTEGER" },
                { name: "music_id", type: "INTEGER" },
                { name: "song_title", type: "TEXT" },
                { name: "difficulty", type: "TEXT" },
                { name: "rank", type: "TEXT" },
                { name: "combo", type: "TEXT" },
                { name: "sync", type: "TEXT" },
            ],
        },
        {
            name: "v_course_tracks",
            needs: [],
            columns: [
                { name: "course_id", type: "INTEGER" },
                { name: "course_name", type: "TEXT" },
                { name: "course_mode", type: "TEXT" },
                { name: "course_locked", type: "INTEGER" },
                { name: "unlock_course_id", type: "INTEGER" },
                { name: "life_initial", type: "INTEGER" },
                { name: "life_recovery", type: "INTEGER" },
                { name: "damage_perfect", type: "INTEGER" },
                { name: "damage_great", type: "INTEGER" },
                { name: "damage_good", type: "INTEGER" },
                { name: "damage_miss", type: "INTEGER" },
                { name: "track", type: "INTEGER" },
                { name: "chart_key", type: "TEXT" },
                { name: "music_id", type: "INTEGER" },
                { name: "track_title", type: "TEXT" },
                { name: "difficulty", type: "TEXT" },
            ],
        },
    ];

    it("matches the declared names, versions, and dependencies", () => {
        expect(PUBLIC_VIEWS.map(v => v.name)).toEqual([
            "v_charts",
            "v_collections",
            "v_collection_targets",
            "v_course_tracks",
        ]);
        expect(PUBLIC_VIEW_NAMES).toEqual([
            "v_charts",
            "v_collections",
            "v_collection_targets",
            "v_course_tracks",
        ]);
        expect(VIEWS_VERSION).toBe(1);

        for (let i = 0; i < EXPECTED_VIEWS.length; i++) {
            const exp = EXPECTED_VIEWS[i];
            const actual = PUBLIC_VIEWS[i];
            expect(actual.name).toBe(exp.name);
            expect(actual.needs).toEqual(exp.needs);
            expect(actual.summary.trim().length).toBeGreaterThan(0);
            expect(actual.columns.map(c => ({ name: c.name, type: c.type }))).toEqual(exp.columns);
            for (const col of actual.columns) {
                expect(col.description.trim().length).toBeGreaterThan(0);
            }
        }
    });

    it("produces exact declared column names when run on fully populated database", () => {
        const paths = makeHome();
        populate(paths, { music: true, collections: true, static: true });
        const sb = sandboxOf(paths, PUBLIC_VIEWS);
        for (const view of EXPECTED_VIEWS) {
            const res = runQuery(sb.db, `SELECT * FROM ${view.name} LIMIT 0`, 10);
            expect(res.columns).toEqual(view.columns.map(c => c.name));
        }
    });
});

describe("viewsMentionedIn", () => {
    const CASES: readonly [string, readonly string[]][] = [
        ["v_charts2", []],
        ["my_v_charts", []],
        ["v_charts_x", []],
        ["xv_charts", []],
        ["v_chartsv_charts", []],
        ["main.v_charts", ["v_charts"]],
        ['"v_charts"', ["v_charts"]],
        ["[v_charts]", ["v_charts"]],
        ["`v_charts`", ["v_charts"]],
        ["'v_charts'", ["v_charts"]],
        ["-- v_charts", ["v_charts"]],
        ["/* v_charts */", ["v_charts"]],
        ["V_cHaRtS", ["v_charts"]],
        ["SELECT * FROM v_course_tracks, v_charts", ["v_charts", "v_course_tracks"]],
        ["SELECT * FROM v_collections", ["v_collections"]],
        ["SELECT * FROM v_collection_targets", ["v_collection_targets"]],
        [
            "SELECT * FROM v_collections, v_collection_targets",
            ["v_collections", "v_collection_targets"],
        ],
        ["", []],
    ];

    it.each(CASES)("detects views in '%s' -> %j", (sql, expectedNames) => {
        const views = viewsMentionedIn(sql);
        expect(views.map(v => v.name)).toEqual(expectedNames);
        for (const view of views) {
            expect(PUBLIC_VIEWS).toContain(view);
        }
    });
});

describe("fetchedAtOf", () => {
    it("reads download times from meta_state within readAlso", () => {
        const paths = makeHome();
        populate(paths, { music: true, collections: true });
        const chartsView = PUBLIC_VIEWS.find(v => v.name === "v_charts")!;

        const sb1 = sandboxOf(paths, [chartsView], db =>
            fetchedAtOf(db, ["catalog", "collections"])
        );
        expect(sb1.also).toEqual({ catalog: 1000, collections: 2000 });

        const sb2 = sandboxOf(paths, [chartsView], db => fetchedAtOf(db, ["catalog"]));
        expect(sb2.also).toEqual({ catalog: 1000 });

        const sb3 = sandboxOf(paths, [chartsView], db => fetchedAtOf(db, []));
        expect(sb3.also).toEqual({});
    });

    it("throws INTERNAL when a requested source is missing from meta_state", () => {
        const paths1 = makeHome();
        populate(paths1, { music: true });
        const chartsView = PUBLIC_VIEWS.find(v => v.name === "v_charts")!;
        const err1 = caught(() =>
            sandboxOf(paths1, [chartsView], db => fetchedAtOf(db, ["collections"]))
        );
        expect(err1.code).toBe("INTERNAL");
        expect(err1.message).toBe("收藏品（落雪）刚才还在，现在读不到了");

        const paths2 = makeHome();
        populate(paths2, { collections: true });
        const collectionsView = PUBLIC_VIEWS.find(v => v.name === "v_collections")!;
        const err2 = caught(() =>
            sandboxOf(paths2, [collectionsView], db => fetchedAtOf(db, ["catalog"]))
        );
        expect(err2.code).toBe("INTERNAL");
        expect(err2.message).toBe("曲库（SaltMeta）刚才还在，现在读不到了");
    });
});

describe("v_charts", () => {
    it("matches chartRow and chartDetails row builders for all 183 charts", () => {
        const paths = makeHome();
        populate(paths, { music: true, static: true });
        const chartsView = PUBLIC_VIEWS.find(v => v.name === "v_charts")!;
        const sb = sandboxOf(paths, [chartsView]);

        const catalog = fixtureSongCatalog();
        const expectedRows = [...catalog.chartByKey.values()].map(entry => {
            const row = chartRow(entry);
            const details = chartDetails(entry.chart);
            return {
                chart_key: row.chartKey,
                music_id: row.musicId,
                song_id: entry.song.id,
                title: row.title,
                artist: entry.song.artist,
                genre: entry.song.genre,
                bpm: entry.song.bpm,
                type: row.type,
                difficulty: row.difficulty,
                grade: entry.chart.info.grade,
                level: row.level,
                constant: row.constant,
                fit_constant: row.fitConstant,
                version: row.version,
                is_new: entry.chart.music.info.isNew ? 1 : 0,
                charter: details.charter,
                notes_tap: details.notes.tap,
                notes_hold: details.notes.hold,
                notes_slide: details.notes.slide,
                notes_touch: details.notes.touch,
                notes_break: details.notes.break,
                notes_total: details.notes.total,
                stat_samples: details.stats?.samples ?? null,
                stat_avg_achievements: details.stats?.avgAchievements ?? null,
                stat_avg_dx_score: details.stats?.avgDxScore ?? null,
                stat_std_dev_achievements: details.stats?.stdDevAchievements ?? null,
                stat_rank_dist: details.stats ? JSON.stringify(details.stats.rankDist) : null,
                stat_combo_dist: details.stats ? JSON.stringify(details.stats.comboDist) : null,
            };
        });

        expectedRows.sort((a, b) => a.music_id - b.music_id || a.grade - b.grade);

        const res = runQuery(sb.db, "SELECT * FROM v_charts", 1000);
        expect(res.rows).toHaveLength(183);

        const rankKeys = [
            "D",
            "C",
            "B",
            "BB",
            "BBB",
            "A",
            "AA",
            "AAA",
            "S",
            "S+",
            "SS",
            "SS+",
            "SSS",
            "SSS+",
        ];
        const comboKeys = ["none", "FC", "FC+", "AP", "AP+"];

        for (let i = 0; i < res.rows.length; i++) {
            const actual = res.rows[i];
            const expected = expectedRows[i];

            if (actual.stat_rank_dist !== null) {
                const parsed = JSON.parse(actual.stat_rank_dist as string);
                expect(Object.keys(parsed)).toEqual(rankKeys);
            }
            if (actual.stat_combo_dist !== null) {
                const parsed = JSON.parse(actual.stat_combo_dist as string);
                expect(Object.keys(parsed)).toEqual(comboKeys);
            }

            expect(actual).toEqual(expected);
        }
    });

    it("matches the four exact literal fixture rows", () => {
        const paths = makeHome();
        populate(paths, { music: true });
        const chartsView = PUBLIC_VIEWS.find(v => v.name === "v_charts")!;
        const sb = sandboxOf(paths, [chartsView]);

        const expected8_0 = {
            chart_key: "8-0",
            music_id: 8,
            song_id: 8,
            title: "True Love Song",
            artist: "Kai/クラシック「G線上のアリア」",
            genre: "舞萌",
            bpm: 150,
            type: "SD",
            difficulty: "BASIC",
            grade: 0,
            level: "5",
            constant: 5,
            fit_constant: 5.021,
            version: "maimai",
            is_new: 0,
            charter: null,
            notes_tap: 63,
            notes_hold: 23,
            notes_slide: 8,
            notes_touch: null,
            notes_break: 2,
            notes_total: 96,
            stat_samples: 5456,
            stat_avg_achievements: 100.057,
            stat_avg_dx_score: 11195.5,
            stat_std_dev_achievements: 0.981,
            stat_rank_dist:
                '{"D":21,"C":2,"B":3,"BB":0,"BBB":2,"A":47,"AA":45,"AAA":25,"S":25,"S+":28,"SS":27,"SS+":27,"SSS":1263,"SSS+":3941}',
            stat_combo_dist: '{"none":228,"FC":1241,"FC+":846,"AP":1375,"AP+":1766}',
        };

        const expected12025_3 = {
            chart_key: "12025-3",
            music_id: 12025,
            song_id: 2025,
            title: "魔法仕掛けのファンタジア",
            artist: "igel",
            genre: "舞萌",
            bpm: 280,
            type: "DX",
            difficulty: "MASTER",
            grade: 3,
            level: "14+",
            constant: 14.8,
            fit_constant: null,
            version: "舞萌DX 2026",
            is_new: 1,
            charter: "lynx magical symphony",
            notes_tap: 620,
            notes_hold: 97,
            notes_slide: 87,
            notes_touch: 105,
            notes_break: 146,
            notes_total: 1055,
            stat_samples: null,
            stat_avg_achievements: null,
            stat_avg_dx_score: null,
            stat_std_dev_achievements: null,
            stat_rank_dist: null,
            stat_combo_dist: null,
        };

        const expected110018_10 = {
            chart_key: "110018-10",
            music_id: 110018,
            song_id: 100018,
            title: "[協]Love You",
            artist: "Q;indivi [cover]",
            genre: "宴会場",
            bpm: null,
            type: "DX",
            difficulty: "UTAGE",
            grade: 10,
            level: "12?",
            constant: null,
            fit_constant: null,
            version: "舞萌DX 2024",
            is_new: 0,
            charter: null,
            notes_tap: null,
            notes_hold: null,
            notes_slide: null,
            notes_touch: null,
            notes_break: null,
            notes_total: null,
            stat_samples: null,
            stat_avg_achievements: null,
            stat_avg_dx_score: null,
            stat_std_dev_achievements: null,
            stat_rank_dist: null,
            stat_combo_dist: null,
        };

        const expected10070_3 = {
            chart_key: "10070-3",
            music_id: 10070,
            song_id: 70,
            title: "ジングルベル",
            artist: "SEGA Sound Unit [H.]",
            genre: "舞萌",
            bpm: 100,
            type: "DX",
            difficulty: "MASTER",
            grade: 3,
            level: "14+",
            constant: 14.6,
            fit_constant: null,
            version: "舞萌DX 2023",
            is_new: 0,
            charter: "舞舞10年ズ ～ファイナル～",
            notes_tap: 377,
            notes_hold: 99,
            notes_slide: 26,
            notes_touch: 302,
            notes_break: 125,
            notes_total: 929,
            stat_samples: null,
            stat_avg_achievements: null,
            stat_avg_dx_score: null,
            stat_std_dev_achievements: null,
            stat_rank_dist: null,
            stat_combo_dist: null,
        };

        const [r8_0] = runQuery(sb.db, "SELECT * FROM v_charts WHERE chart_key = '8-0'", 10).rows;
        expect(r8_0).toEqual(expected8_0);

        const [r12025_3] = runQuery(
            sb.db,
            "SELECT * FROM v_charts WHERE chart_key = '12025-3'",
            10
        ).rows;
        expect(r12025_3).toEqual(expected12025_3);

        const [r110018_10] = runQuery(
            sb.db,
            "SELECT * FROM v_charts WHERE chart_key = '110018-10'",
            10
        ).rows;
        expect(r110018_10).toEqual(expected110018_10);

        const [r10070_3] = runQuery(
            sb.db,
            "SELECT * FROM v_charts WHERE chart_key = '10070-3'",
            10
        ).rows;
        expect(r10070_3).toEqual(expected10070_3);
    });

    it("verifies fixture counts, NULL counts, versions, genres, and dual-chart songs", () => {
        const paths = makeHome();
        populate(paths, { music: true });
        const chartsView = PUBLIC_VIEWS.find(v => v.name === "v_charts")!;
        const sb = sandboxOf(paths, [chartsView]);

        const typeDiffCounts = runQuery(
            sb.db,
            "SELECT type, difficulty, count(*) AS c FROM v_charts GROUP BY type, difficulty ORDER BY type, difficulty",
            50
        ).rows;
        const typeDiffMap = Object.fromEntries(
            typeDiffCounts.map(r => [`${r.type} ${r.difficulty}`, r.c])
        );
        expect(typeDiffMap["DX BASIC"]).toBe(13);
        expect(typeDiffMap["DX ADVANCED"]).toBe(13);
        expect(typeDiffMap["DX EXPERT"]).toBe(13);
        expect(typeDiffMap["DX MASTER"]).toBe(13);
        expect(typeDiffMap["DX UTAGE"]).toBe(8);
        expect(typeDiffMap["SD BASIC"]).toBe(29);
        expect(typeDiffMap["SD ADVANCED"]).toBe(29);
        expect(typeDiffMap["SD EXPERT"]).toBe(29);
        expect(typeDiffMap["SD MASTER"]).toBe(29);
        expect(typeDiffMap["SD Re:MASTER"]).toBe(7);

        const [nulls] = runQuery(
            sb.db,
            `SELECT
                sum(CASE WHEN bpm IS NULL THEN 1 ELSE 0 END) AS bpm_null,
                sum(CASE WHEN constant IS NULL THEN 1 ELSE 0 END) AS constant_null,
                sum(CASE WHEN fit_constant IS NULL THEN 1 ELSE 0 END) AS fit_constant_null,
                sum(CASE WHEN charter IS NULL THEN 1 ELSE 0 END) AS charter_null,
                sum(is_new) AS is_new_sum
             FROM v_charts`,
            10
        ).rows;
        expect(nulls.bpm_null).toBe(8);
        expect(nulls.constant_null).toBe(8);
        expect(nulls.fit_constant_null).toBe(161);
        expect(nulls.charter_null).toBe(92);
        expect(nulls.is_new_sum).toBe(9);

        const versionRows = runQuery(
            sb.db,
            "SELECT version, count(*) AS c FROM v_charts GROUP BY version",
            50
        ).rows;
        const versionMap = Object.fromEntries(versionRows.map(r => [r.version as string, r.c]));
        expect(versionMap).toEqual({
            maimai: 30,
            "maimai PLUS": 19,
            "maimai GreeN": 22,
            "maimai GreeN PLUS": 4,
            "maimai ORANGE": 8,
            "maimai ORANGE PLUS": 4,
            "maimai PiNK": 4,
            "maimai PiNK PLUS": 4,
            "maimai MURASAKi": 8,
            "maimai MURASAKi PLUS": 4,
            "maimai MiLK": 8,
            "maimai MiLK PLUS": 4,
            "maimai FiNALE": 4,
            舞萌DX: 12,
            "舞萌DX 2021": 4,
            "舞萌DX 2022": 4,
            "舞萌DX 2023": 4,
            "舞萌DX 2024": 15,
            "舞萌DX 2025": 12,
            "舞萌DX 2026": 9,
        });

        const genreRows = runQuery(
            sb.db,
            "SELECT genre, count(*) AS c FROM v_charts GROUP BY genre",
            50
        ).rows;
        const genreMap = Object.fromEntries(genreRows.map(r => [r.genre as string, r.c]));
        expect(genreMap).toEqual({
            "niconico & VOCALOID": 66,
            东方Project: 16,
            其他游戏: 21,
            宴会場: 8,
            "流行&动漫": 5,
            舞萌: 63,
            "音击&中二节奏": 4,
        });

        const sharedSongs = runQuery(
            sb.db,
            "SELECT song_id FROM v_charts GROUP BY song_id HAVING count(DISTINCT type) > 1",
            50
        ).rows;
        expect(sharedSongs).toHaveLength(11);
    });

    it("handles odd or edge-case chart data correctly", () => {
        const paths = makeHome();
        populate(paths, { music: true });
        const store = openStore(paths);

        const charterCases = [
            ["  lynx  ", "lynx"],
            ["-", null],
            [" - ", null],
            ["", null],
            ["\u3000x\u00A0", "x"],
            ["\t y \n", "y"],
            ["a - b", "a - b"],
            [null, null],
        ] as const;

        for (const [input, expected] of charterCases) {
            store.db.prepare("UPDATE charts SET charter = ? WHERE chart_key = '8-0'").run(input);
            const sb = sandboxOf(paths, [PUBLIC_VIEWS.find(v => v.name === "v_charts")!]);
            const [row] = runQuery(
                sb.db,
                "SELECT charter FROM v_charts WHERE chart_key = '8-0'",
                1
            ).rows;
            expect(row.charter, `charter ${JSON.stringify(input)}`).toBe(expected);
            sb.close();
        }

        const constantCases = [
            [0, null],
            [-1, null],
            [14.8, 14.8],
            [null, null],
        ] as const;

        for (const [input, expected] of constantCases) {
            store.db.prepare("UPDATE charts SET constant = ? WHERE chart_key = '8-0'").run(input);
            const sb = sandboxOf(paths, [PUBLIC_VIEWS.find(v => v.name === "v_charts")!]);
            const [row] = runQuery(
                sb.db,
                "SELECT constant FROM v_charts WHERE chart_key = '8-0'",
                1
            ).rows;
            expect(row.constant, `constant ${input}`).toBe(expected);
            sb.close();
        }

        const noteCases = [
            [JSON.stringify([63, 23, 8, 2]), [63, 23, 8, null, 2, 96]],
            [JSON.stringify([620, 97, 87, 105, 146]), [620, 97, 87, 105, 146, 1055]],
            [JSON.stringify([null, null, 0, 0, null]), [null, null, null, null, null, null]],
            [JSON.stringify([1, null, 3, 4]), [1, null, 3, null, 4, null]],
            [JSON.stringify([1, 2, 3, null, 5]), [1, 2, 3, null, 5, null]],
            [JSON.stringify([0, 0, 0, 0]), [0, 0, 0, null, 0, 0]],
            [JSON.stringify([0, 0, 0, 0, 0]), [0, 0, 0, 0, 0, 0]],
            [JSON.stringify([null, null, 3, null]), [null, null, null, null, null, null]],
            [JSON.stringify([5, null, null, null]), [5, null, null, null, null, null]],
            // Any one of tap, hold and break being known is enough for the others to be counts.
            [JSON.stringify([null, null, 3, 4]), [null, null, 3, null, 4, null]],
            [JSON.stringify([null, 5, 3, null]), [null, 5, 3, null, null, null]],
            [JSON.stringify([null, null, 3, 4, 5]), [null, null, 3, 4, 5, null]],
            // Tap alone is enough too: the slide and touch counts that go with it are counts.
            [JSON.stringify([5, null, 3, null]), [5, null, 3, null, null, null]],
            [JSON.stringify([5, null, 3, 4, null]), [5, null, 3, 4, null, null]],
        ] as const;

        for (const [notesJson, expected] of noteCases) {
            store.db.prepare("UPDATE charts SET notes = ? WHERE chart_key = '8-0'").run(notesJson);
            const sb = sandboxOf(paths, [PUBLIC_VIEWS.find(v => v.name === "v_charts")!]);
            const [row] = runQuery(
                sb.db,
                "SELECT notes_tap, notes_hold, notes_slide, notes_touch, notes_break, notes_total FROM v_charts WHERE chart_key = '8-0'",
                1
            ).rows;
            expect(
                [
                    row.notes_tap,
                    row.notes_hold,
                    row.notes_slide,
                    row.notes_touch,
                    row.notes_break,
                    row.notes_total,
                ],
                `notes ${notesJson}`
            ).toEqual(expected);
            sb.close();
        }

        const fullStat = JSON.stringify({
            cnt: 10,
            fit_diff: 13.123456789,
            avg: 99.123456,
            avg_dx: 1234.5678,
            std_dev: 1.23456789,
            dist: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
            fc_dist: [1, 2, 3, 4, 5],
        });
        store.db.prepare("UPDATE charts SET stat = ? WHERE chart_key = '8-0'").run(fullStat);
        let sb = sandboxOf(paths, [PUBLIC_VIEWS.find(v => v.name === "v_charts")!]);
        let [sRow] = runQuery(
            sb.db,
            "SELECT stat_samples, fit_constant, stat_avg_achievements, stat_avg_dx_score, stat_std_dev_achievements, stat_rank_dist, stat_combo_dist FROM v_charts WHERE chart_key = '8-0'",
            1
        ).rows;
        expect(sRow.stat_samples).toBe(10);
        expect(sRow.fit_constant).toBe(13.1235);
        expect(sRow.stat_avg_achievements).toBe(99.1235);
        expect(sRow.stat_avg_dx_score).toBe(1234.57);
        expect(sRow.stat_std_dev_achievements).toBe(1.2346);
        expect(sRow.stat_rank_dist).toBe(
            '{"D":1,"C":2,"B":3,"BB":4,"BBB":5,"A":6,"AA":7,"AAA":8,"S":9,"S+":10,"SS":11,"SS+":12,"SSS":13,"SSS+":14}'
        );
        expect(sRow.stat_combo_dist).toBe('{"none":1,"FC":2,"FC+":3,"AP":4,"AP+":5}');
        sb.close();

        const zeroFitStat = JSON.stringify({
            cnt: 1,
            fit_diff: 0,
            avg: 1,
            avg_dx: 1,
            std_dev: 1,
        });
        store.db.prepare("UPDATE charts SET stat = ? WHERE chart_key = '8-0'").run(zeroFitStat);
        sb = sandboxOf(paths, [PUBLIC_VIEWS.find(v => v.name === "v_charts")!]);
        [sRow] = runQuery(
            sb.db,
            "SELECT fit_constant, stat_rank_dist, stat_combo_dist FROM v_charts WHERE chart_key = '8-0'",
            1
        ).rows;
        expect(sRow.fit_constant).toBeNull();
        expect(sRow.stat_rank_dist).toBe(
            '{"D":0,"C":0,"B":0,"BB":0,"BBB":0,"A":0,"AA":0,"AAA":0,"S":0,"S+":0,"SS":0,"SS+":0,"SSS":0,"SSS+":0}'
        );
        expect(sRow.stat_combo_dist).toBe('{"none":0,"FC":0,"FC+":0,"AP":0,"AP+":0}');
        sb.close();

        const negFitStat = JSON.stringify({ cnt: 1, fit_diff: -1 });
        store.db.prepare("UPDATE charts SET stat = ? WHERE chart_key = '8-0'").run(negFitStat);
        sb = sandboxOf(paths, [PUBLIC_VIEWS.find(v => v.name === "v_charts")!]);
        [sRow] = runQuery(
            sb.db,
            "SELECT fit_constant FROM v_charts WHERE chart_key = '8-0'",
            1
        ).rows;
        expect(sRow.fit_constant).toBeNull();
        sb.close();

        store.db.prepare("UPDATE charts SET stat = NULL WHERE chart_key = '8-0'").run();
        sb = sandboxOf(paths, [PUBLIC_VIEWS.find(v => v.name === "v_charts")!]);
        [sRow] = runQuery(
            sb.db,
            "SELECT fit_constant, stat_samples, stat_avg_achievements, stat_avg_dx_score, stat_std_dev_achievements, stat_rank_dist, stat_combo_dist FROM v_charts WHERE chart_key = '8-0'",
            1
        ).rows;
        expect(sRow.fit_constant).toBeNull();
        expect(sRow.stat_samples).toBeNull();
        expect(sRow.stat_avg_achievements).toBeNull();
        expect(sRow.stat_avg_dx_score).toBeNull();
        expect(sRow.stat_std_dev_achievements).toBeNull();
        expect(sRow.stat_rank_dist).toBeNull();
        expect(sRow.stat_combo_dist).toBeNull();
        sb.close();

        store.db.prepare("UPDATE charts SET grade = 7 WHERE chart_key = '8-0'").run();
        sb = sandboxOf(paths, [PUBLIC_VIEWS.find(v => v.name === "v_charts")!]);
        const [gRow] = runQuery(
            sb.db,
            "SELECT difficulty, grade FROM v_charts WHERE chart_key = '8-0'",
            1
        ).rows;
        expect(gRow.difficulty).toBe("7");
        expect(gRow.grade).toBe(7);
        sb.close();

        store.close();
    });
});

describe("v_collections", () => {
    it("matches listCollections and collectionRow across all 966 items", () => {
        const paths = makeHome();
        populate(paths, { collections: true, static: true });
        const vCols = PUBLIC_VIEWS.find(v => v.name === "v_collections")!;
        const sb = sandboxOf(paths, [vCols]);

        const mapped = mapLXNSCollections(getFixtureLXNSCollections());
        const entries = listCollections(mapped);
        expect(entries).toHaveLength(966);

        const expectedRows = entries.map(entry => {
            const row = collectionRow(entry);
            return {
                ref: row.ref,
                kind: row.kind,
                id: row.id,
                name: row.name,
                genre: row.genre,
                color: row.color,
                description: row.description,
                song_count: row.songCount,
            };
        });

        const res = runQuery(sb.db, "SELECT * FROM v_collections", 1500);
        expect(res.rows).toHaveLength(966);
        expect(res.rows).toEqual(expectedRows);

        const expectedLiteralPlate1 = {
            ref: "plate:1",
            kind: "plate",
            id: 1,
            name: "デフォルト",
            genre: "デフォルト",
            color: null,
            description: "はじめから所持",
            song_count: 0,
        };
        const expectedLiteralPlate6101 = {
            ref: "plate:6101",
            kind: "plate",
            id: 6101,
            name: "真極",
            genre: "実績",
            color: null,
            description: "maimai PLUSまでの全曲/BASIC～MASTER/FULL COMBO",
            song_count: 5,
        };
        const expectedLiteralTitle5101 = {
            ref: "title:5101",
            kind: "title",
            id: 5101,
            name: "千本桜",
            genre: "niconicoボーカロイド",
            color: "Gold",
            description: "千本桜[でらっくす]/全難易度/ALL PERFECT",
            song_count: 1,
        };
        const expectedLiteralTitle158511 = {
            ref: "title:158511",
            kind: "title",
            id: 158511,
            name: "MEGA+MEGAはGIGAじゃないぞ。オレたちはMEGA+MEGAでTERAだ！10倍だぞ10倍",
            genre: "オンゲキCHUNITHM",
            color: "Gold",
            description:
                "MEGATON KICK[でらっくす]/MEGATON BLAST[でらっくす]/MASTER/一回のクレジットでFULL SYNC DX",
            song_count: 2,
        };
        const expectedLiteralIcon209502 = {
            ref: "icon:209502",
            kind: "icon",
            id: 209502,
            name: "UNiVERSE しゃま＆みるく",
            genre: "その他",
            color: null,
            description:
                "とびだせ！TO THE COSMIC!![でらっくす]/ミルキースター・シューティングスター[でらっくす]/一回のクレジットでプレイ",
            song_count: 2,
        };
        const expectedLiteralFrame109101 = {
            ref: "frame:109101",
            kind: "frame",
            id: 109101,
            name: "PERFECT Jewel [Diamond]",
            genre: "実績",
            color: null,
            description: "舞萌DX 全曲/BASIC～MASTER/ALL PERFECT",
            song_count: 2,
        };
        const expectedLiteralChar101 = {
            ref: "character:101",
            kind: "character",
            id: 101,
            name: "でらっくま",
            genre: "はじまりのちほー",
            color: null,
            description: "",
            song_count: 0,
        };
        const expectedLiteralPartner1 = {
            ref: "partner:1",
            kind: "partner",
            id: 1,
            name: "でらっくま",
            genre: null,
            color: null,
            description: "",
            song_count: 0,
        };

        const byRef = Object.fromEntries(res.rows.map(r => [r.ref as string, r]));
        expect(byRef["plate:1"]).toEqual(expectedLiteralPlate1);
        expect(byRef["plate:6101"]).toEqual(expectedLiteralPlate6101);
        expect(byRef["title:5101"]).toEqual(expectedLiteralTitle5101);
        expect(byRef["title:158511"]).toEqual(expectedLiteralTitle158511);
        expect(byRef["icon:209502"]).toEqual(expectedLiteralIcon209502);
        expect(byRef["frame:109101"]).toEqual(expectedLiteralFrame109101);
        expect(byRef["character:101"]).toEqual(expectedLiteralChar101);
        expect(byRef["partner:1"]).toEqual(expectedLiteralPartner1);

        const kindCounts = runQuery(
            sb.db,
            "SELECT kind, count(*) AS c FROM v_collections GROUP BY kind",
            20
        ).rows;
        const kindMap = Object.fromEntries(kindCounts.map(r => [r.kind as string, r.c]));
        expect(kindMap).toEqual({
            plate: 12,
            title: 9,
            icon: 3,
            frame: 3,
            character: 917,
            partner: 22,
        });

        const titleColors = runQuery(
            sb.db,
            "SELECT color, count(*) AS c FROM v_collections WHERE kind = 'title' GROUP BY color",
            10
        ).rows;
        const colorMap = Object.fromEntries(titleColors.map(r => [r.color as string, r.c]));
        expect(colorMap).toEqual({
            Normal: 2,
            Bronze: 1,
            Silver: 1,
            Gold: 3,
            Rainbow: 2,
        });

        const plateRefs = runQuery(
            sb.db,
            "SELECT ref FROM v_collections WHERE kind = 'plate'",
            50
        ).rows.map(r => r.ref);
        expect(plateRefs).toEqual([
            "plate:1",
            "plate:2",
            "plate:6101",
            "plate:6102",
            "plate:6103",
            "plate:6104",
            "plate:6105",
            "plate:6106",
            "plate:6107",
            "plate:6148",
            "plate:409506",
            "plate:101",
        ]);

        const titleRefs = runQuery(
            sb.db,
            "SELECT ref FROM v_collections WHERE kind = 'title'",
            50
        ).rows.map(r => r.ref);
        expect(titleRefs).toEqual([
            "title:1",
            "title:2",
            "title:5101",
            "title:5102",
            "title:5502",
            "title:5501",
            "title:158511",
            "title:458582",
            "title:20",
        ]);
    });

    it("handles odd or edge-case collection data correctly", () => {
        const paths = makeHome();
        populate(paths, { collections: true, static: true });
        const store = openStore(paths);

        store.db
            .prepare("UPDATE collections SET color = 'GOLD' WHERE kind = 'title' AND id = 1")
            .run();
        let sb = sandboxOf(paths, [PUBLIC_VIEWS.find(v => v.name === "v_collections")!]);
        let [row] = runQuery(
            sb.db,
            "SELECT color FROM v_collections WHERE ref = 'title:1'",
            1
        ).rows;
        expect(row.color).toBe("Gold");
        sb.close();

        store.db
            .prepare("UPDATE collections SET color = 'weird' WHERE kind = 'title' AND id = 1")
            .run();
        sb = sandboxOf(paths, [PUBLIC_VIEWS.find(v => v.name === "v_collections")!]);
        [row] = runQuery(sb.db, "SELECT color FROM v_collections WHERE ref = 'title:1'", 1).rows;
        expect(row.color).toBe("Normal");
        sb.close();

        store.db
            .prepare("UPDATE collections SET color = NULL WHERE kind = 'title' AND id = 1")
            .run();
        sb = sandboxOf(paths, [PUBLIC_VIEWS.find(v => v.name === "v_collections")!]);
        [row] = runQuery(sb.db, "SELECT color FROM v_collections WHERE ref = 'title:1'", 1).rows;
        expect(row.color).toBe("Normal");
        sb.close();

        store.db
            .prepare("UPDATE collections SET color = 'gold' WHERE kind = 'plate' AND id = 1")
            .run();
        sb = sandboxOf(paths, [PUBLIC_VIEWS.find(v => v.name === "v_collections")!]);
        [row] = runQuery(sb.db, "SELECT color FROM v_collections WHERE ref = 'plate:1'", 1).rows;
        expect(row.color).toBeNull();
        sb.close();

        store.db
            .prepare(
                "UPDATE collections SET genre = NULL, description = NULL WHERE kind = 'plate' AND id = 1"
            )
            .run();
        sb = sandboxOf(paths, [PUBLIC_VIEWS.find(v => v.name === "v_collections")!]);
        [row] = runQuery(
            sb.db,
            "SELECT genre, description FROM v_collections WHERE ref = 'plate:1'",
            1
        ).rows;
        expect(row.genre).toBe("");
        expect(row.description).toBe("");
        sb.close();

        sb = sandboxOf(paths, [PUBLIC_VIEWS.find(v => v.name === "v_collections")!]);
        [row] = runQuery(sb.db, "SELECT genre FROM v_collections WHERE ref = 'partner:1'", 1).rows;
        expect(row.genre).toBeNull();
        sb.close();

        store.db
            .prepare("UPDATE collections SET kind = 'zzz' WHERE kind = 'title' AND id = 1")
            .run();
        sb = sandboxOf(paths, [PUBLIC_VIEWS.find(v => v.name === "v_collections")!]);
        const allCols = runQuery(sb.db, "SELECT ref FROM v_collections", 1000).rows;
        expect(allCols[allCols.length - 1].ref).toBe("zzz:1");
        sb.close();

        store.close();
    });
});

describe("v_collection_targets", () => {
    it("matches requirement rows from collectionDetail across all 176 targets", () => {
        const paths = makeHome();
        populate(paths, { music: true, collections: true, static: true });
        const vTargets = PUBLIC_VIEWS.find(v => v.name === "v_collection_targets")!;
        const sb = sandboxOf(paths, [vTargets]);

        const mapped = mapLXNSCollections(getFixtureLXNSCollections());
        const entries = listCollections(mapped);

        interface TargetRow {
            collection_ref: string;
            collection_kind: string;
            collection_id: number;
            condition: number;
            music_id: number;
            song_title: string;
            difficulty: string | null;
            rank: string | null;
            combo: string | null;
            sync: string | null;
        }

        const expectedRows: TargetRow[] = [];
        for (const entry of entries) {
            const detail = collectionDetail(entry);
            const reqs = entry.collection.required ?? [];
            for (let i = 0; i < reqs.length; i++) {
                const req = reqs[i];
                const reqRow = detail.requirements[i];
                const songs = req.songs ?? [];
                for (const song of songs) {
                    const musicId = getSaltNetMusicIdForChartType(song.id, song.type);
                    const diffs =
                        reqRow.difficulties && reqRow.difficulties.length > 0
                            ? reqRow.difficulties
                            : [null];
                    for (const diff of diffs) {
                        expectedRows.push({
                            collection_ref: collectionRef(entry),
                            collection_kind: entry.kind,
                            collection_id: entry.collection.id,
                            condition: i + 1,
                            music_id: musicId,
                            song_title: song.title,
                            difficulty: diff,
                            rank: reqRow.rank,
                            combo: reqRow.combo,
                            sync: reqRow.sync,
                        });
                    }
                }
            }
        }

        const res = runQuery(sb.db, "SELECT * FROM v_collection_targets", 500);
        expect(res.rows).toHaveLength(176);
        expect(res.rows).toEqual(expectedRows);

        const kindCounts = runQuery(
            sb.db,
            "SELECT collection_kind, count(*) AS c FROM v_collection_targets GROUP BY collection_kind",
            20
        ).rows;
        const kindMap = Object.fromEntries(kindCounts.map(r => [r.collection_kind as string, r.c]));
        expect(kindMap).toEqual({
            frame: 8,
            icon: 2,
            plate: 149,
            title: 17,
        });

        const reqPatterns = runQuery(
            sb.db,
            "SELECT collection_kind, rank, combo, sync, count(*) AS c FROM v_collection_targets GROUP BY collection_kind, rank, combo, sync",
            50
        ).rows;
        const patternMap = Object.fromEntries(
            reqPatterns.map(r => [`${r.collection_kind} (${r.rank}, ${r.combo}, ${r.sync})`, r.c])
        );
        expect(patternMap["frame (null, AP, null)"]).toBe(8);
        expect(patternMap["icon (null, null, null)"]).toBe(2);
        expect(patternMap["plate (null, null, FDX)"]).toBe(36);
        expect(patternMap["plate (null, null, FS)"]).toBe(1);
        expect(patternMap["plate (null, AP, null)"]).toBe(36);
        expect(patternMap["plate (null, FC, null)"]).toBe(36);
        expect(patternMap["plate (A, null, null)"]).toBe(24);
        expect(patternMap["plate (SSS, null, null)"]).toBe(16);
        expect(patternMap["title (null, null, FDX)"]).toBe(2);
        expect(patternMap["title (null, AP, null)"]).toBe(8);
        expect(patternMap["title (null, AP+, null)"]).toBe(5);
        expect(patternMap["title (S, null, null)"]).toBe(2);

        const multiCond = runQuery(
            sb.db,
            "SELECT collection_ref, count(DISTINCT condition) AS conds, count(*) AS c FROM v_collection_targets GROUP BY collection_ref HAVING conds > 1",
            10
        ).rows;
        const multiMap = Object.fromEntries(
            multiCond.map(r => [r.collection_ref as string, { conds: r.conds, c: r.c }])
        );
        expect(multiMap["plate:6148"]).toEqual({ conds: 2, c: 24 });
        expect(multiMap["title:458582"]).toEqual({ conds: 2, c: 5 });

        const plateRowsSongs = runQuery(
            sb.db,
            "SELECT collection_ref, count(*) AS rows, count(DISTINCT music_id) AS songs FROM v_collection_targets WHERE collection_kind = 'plate' GROUP BY collection_ref",
            50
        ).rows;
        const plateMap = Object.fromEntries(
            plateRowsSongs.map(r => [r.collection_ref as string, { rows: r.rows, songs: r.songs }])
        );
        expect(plateMap["plate:6101"]).toEqual({ rows: 20, songs: 5 });
        expect(plateMap["plate:6102"]).toEqual({ rows: 20, songs: 5 });
        expect(plateMap["plate:6103"]).toEqual({ rows: 20, songs: 5 });
        expect(plateMap["plate:6104"]).toEqual({ rows: 16, songs: 4 });
        expect(plateMap["plate:6105"]).toEqual({ rows: 16, songs: 4 });
        expect(plateMap["plate:6106"]).toEqual({ rows: 16, songs: 4 });
        expect(plateMap["plate:6107"]).toEqual({ rows: 16, songs: 4 });
        expect(plateMap["plate:6148"]).toEqual({ rows: 24, songs: 7 });
        expect(plateMap["plate:409506"]).toEqual({ rows: 1, songs: 1 });

        const sbCharts = sandboxOf(paths, [
            vTargets,
            PUBLIC_VIEWS.find(v => v.name === "v_charts")!,
        ]);
        const missingChartRows = runQuery(
            sbCharts.db,
            "SELECT count(*) AS rows, count(DISTINCT music_id) AS songs FROM v_collection_targets t WHERE NOT EXISTS (SELECT 1 FROM v_charts c WHERE c.music_id = t.music_id)",
            10
        ).rows;
        expect(missingChartRows[0].rows).toBe(16);
        expect(missingChartRows[0].songs).toBe(8);

        const first4 = res.rows.slice(0, 4);
        expect(first4).toEqual([
            {
                collection_ref: "plate:6101",
                collection_kind: "plate",
                collection_id: 6101,
                condition: 1,
                music_id: 8,
                song_title: "True Love Song",
                difficulty: "BASIC",
                rank: null,
                combo: "FC",
                sync: null,
            },
            {
                collection_ref: "plate:6101",
                collection_kind: "plate",
                collection_id: 6101,
                condition: 1,
                music_id: 8,
                song_title: "True Love Song",
                difficulty: "ADVANCED",
                rank: null,
                combo: "FC",
                sync: null,
            },
            {
                collection_ref: "plate:6101",
                collection_kind: "plate",
                collection_id: 6101,
                condition: 1,
                music_id: 8,
                song_title: "True Love Song",
                difficulty: "EXPERT",
                rank: null,
                combo: "FC",
                sync: null,
            },
            {
                collection_ref: "plate:6101",
                collection_kind: "plate",
                collection_id: 6101,
                condition: 1,
                music_id: 8,
                song_title: "True Love Song",
                difficulty: "MASTER",
                rank: null,
                combo: "FC",
                sync: null,
            },
        ]);

        const [p409506] = runQuery(
            sb.db,
            "SELECT * FROM v_collection_targets WHERE collection_ref = 'plate:409506'",
            10
        ).rows;
        expect(p409506).toEqual({
            collection_ref: "plate:409506",
            collection_kind: "plate",
            collection_id: 409506,
            condition: 1,
            music_id: 11591,
            song_title: "ULTRA SYNERGY MATRIX",
            difficulty: null,
            rank: null,
            combo: null,
            sync: "FS",
        });

        const icon209502 = runQuery(
            sb.db,
            "SELECT * FROM v_collection_targets WHERE collection_ref = 'icon:209502'",
            10
        ).rows;
        expect(icon209502).toEqual([
            {
                collection_ref: "icon:209502",
                collection_kind: "icon",
                collection_id: 209502,
                condition: 1,
                music_id: 11296,
                song_title: "とびだせ！TO THE COSMIC!!",
                difficulty: null,
                rank: null,
                combo: null,
                sync: null,
            },
            {
                collection_ref: "icon:209502",
                collection_kind: "icon",
                collection_id: 209502,
                condition: 1,
                music_id: 11375,
                song_title: "ミルキースター・シューティングスター",
                difficulty: null,
                rank: null,
                combo: null,
                sync: null,
            },
        ]);

        const [t5502] = runQuery(
            sb.db,
            "SELECT * FROM v_collection_targets WHERE collection_ref = 'title:5502'",
            10
        ).rows;
        expect(t5502).toEqual({
            collection_ref: "title:5502",
            collection_kind: "title",
            collection_id: 5502,
            condition: 1,
            music_id: 11036,
            song_title: "U.S.A.",
            difficulty: "EXPERT",
            rank: "S",
            combo: null,
            sync: null,
        });
    });

    it("evaluates custom and synthetic requirement rules correctly", () => {
        const paths = makeHome();
        populate(paths, { collections: true, static: true });
        const store = openStore(paths);

        const syntheticRequired = [
            {
                difficulties: [0, 3],
                rate: "sssp",
                fc: "fcp",
                fs: "fsdp",
                songs: [
                    { id: 1590, title: "A", type: "dx" },
                    { id: 11590, title: "B", type: "dx" },
                ],
            },
            {
                songs: [
                    { id: 1590, title: "C", type: "standard" },
                    { id: 100018, title: "D", type: "utage" },
                ],
            },
            {
                difficulties: [],
                rate: "",
                fc: "",
                fs: "",
                songs: [{ id: 7, title: "E", type: "standard" }],
            },
            {
                songs: [],
            },
        ];

        store.db
            .prepare("UPDATE collections SET required = ? WHERE kind = 'title' AND id = 1")
            .run(JSON.stringify(syntheticRequired));

        let sb = sandboxOf(paths, [
            PUBLIC_VIEWS.find(v => v.name === "v_collections")!,
            PUBLIC_VIEWS.find(v => v.name === "v_collection_targets")!,
        ]);

        const targetRows = runQuery(
            sb.db,
            "SELECT condition, music_id, song_title, difficulty, rank, combo, sync FROM v_collection_targets WHERE collection_ref = 'title:1'",
            50
        ).rows.map(r => [
            r.condition,
            r.music_id,
            r.song_title,
            r.difficulty,
            r.rank,
            r.combo,
            r.sync,
        ]);

        expect(targetRows).toEqual([
            [1, 11590, "A", "BASIC", "SSS+", "FC+", "FDX+"],
            [1, 11590, "A", "MASTER", "SSS+", "FC+", "FDX+"],
            [1, 11590, "B", "BASIC", "SSS+", "FC+", "FDX+"],
            [1, 11590, "B", "MASTER", "SSS+", "FC+", "FDX+"],
            [2, 1590, "C", null, null, null, null],
            [2, 100018, "D", null, null, null, null],
            [3, 7, "E", null, null, null, null],
        ]);

        const [t1Count] = runQuery(
            sb.db,
            "SELECT song_count FROM v_collections WHERE ref = 'title:1'",
            1
        ).rows;
        expect(t1Count.song_count).toBe(4);
        sb.close();

        const rankCodes = [
            "d",
            "c",
            "b",
            "bb",
            "bbb",
            "a",
            "aa",
            "aaa",
            "s",
            "sp",
            "ss",
            "ssp",
            "sss",
            "sssp",
        ];
        const rankConditions = rankCodes.map(code => ({
            rate: code,
            songs: [{ id: 1, title: "S", type: "standard" }],
        }));
        store.db
            .prepare("UPDATE collections SET required = ? WHERE kind = 'title' AND id = 1")
            .run(JSON.stringify(rankConditions));
        sb = sandboxOf(paths, [PUBLIC_VIEWS.find(v => v.name === "v_collection_targets")!]);
        const rankResults = runQuery(
            sb.db,
            "SELECT rank FROM v_collection_targets WHERE collection_ref = 'title:1' ORDER BY condition",
            50
        ).rows.map(r => r.rank);
        expect(rankResults).toEqual([
            "D",
            "C",
            "B",
            "BB",
            "BBB",
            "A",
            "AA",
            "AAA",
            "S",
            "S+",
            "SS",
            "SS+",
            "SSS",
            "SSS+",
        ]);
        sb.close();

        const comboCodes = ["fc", "fcp", "ap", "app"];
        const comboConditions = comboCodes.map(code => ({
            fc: code,
            songs: [{ id: 1, title: "S", type: "standard" }],
        }));
        store.db
            .prepare("UPDATE collections SET required = ? WHERE kind = 'title' AND id = 1")
            .run(JSON.stringify(comboConditions));
        sb = sandboxOf(paths, [PUBLIC_VIEWS.find(v => v.name === "v_collection_targets")!]);
        const comboResults = runQuery(
            sb.db,
            "SELECT combo FROM v_collection_targets WHERE collection_ref = 'title:1' ORDER BY condition",
            50
        ).rows.map(r => r.combo);
        expect(comboResults).toEqual(["FC", "FC+", "AP", "AP+"]);
        sb.close();

        const syncCodes = ["sync", "fs", "fsp", "fsd", "fsdp"];
        const syncConditions = syncCodes.map(code => ({
            fs: code,
            songs: [{ id: 1, title: "S", type: "standard" }],
        }));
        store.db
            .prepare("UPDATE collections SET required = ? WHERE kind = 'title' AND id = 1")
            .run(JSON.stringify(syncConditions));
        sb = sandboxOf(paths, [PUBLIC_VIEWS.find(v => v.name === "v_collection_targets")!]);
        const syncResults = runQuery(
            sb.db,
            "SELECT sync FROM v_collection_targets WHERE collection_ref = 'title:1' ORDER BY condition",
            50
        ).rows.map(r => r.sync);
        expect(syncResults).toEqual(["SYNC", "FS", "FS+", "FDX", "FDX+"]);
        sb.close();

        const diffCondition = [
            {
                difficulties: [0, 1, 2, 3, 4, 10, 7],
                songs: [{ id: 1, title: "S", type: "standard" }],
            },
        ];
        store.db
            .prepare("UPDATE collections SET required = ? WHERE kind = 'title' AND id = 1")
            .run(JSON.stringify(diffCondition));
        sb = sandboxOf(paths, [PUBLIC_VIEWS.find(v => v.name === "v_collection_targets")!]);
        const diffResults = runQuery(
            sb.db,
            "SELECT difficulty FROM v_collection_targets WHERE collection_ref = 'title:1'",
            50
        ).rows.map(r => r.difficulty);
        expect(diffResults).toEqual([
            "BASIC",
            "ADVANCED",
            "EXPERT",
            "MASTER",
            "Re:MASTER",
            "UTAGE",
            "7",
        ]);
        sb.close();

        store.close();
    });
});

describe("v_course_tracks", () => {
    it("reads course tracks correctly with static data only and matches course definitions", () => {
        const paths = makeHome();
        populate(paths, { static: true });
        const vCourse = PUBLIC_VIEWS.find(v => v.name === "v_course_tracks")!;
        const sb = sandboxOf(paths, [vCourse]);

        const expectedRows = courses.flatMap(course => {
            const isLocked = course.isLocked;
            return course.tracks.map((track, t) => ({
                course_id: course.id,
                course_name: course.name,
                course_mode: course.mode.name,
                course_locked: isLocked ? 1 : 0,
                unlock_course_id: isLocked ? course.unlockCourseId : null,
                life_initial: course.life.initial,
                life_recovery: course.life.recovery,
                damage_perfect: course.life.damage.perfect,
                damage_great: course.life.damage.great,
                damage_good: course.life.damage.good,
                damage_miss: course.life.damage.miss,
                track: t + 1,
                chart_key: getCourseTrackKey(track),
                music_id: track.musicId,
                track_title: track.title,
                difficulty: difficultyLabel(track.difficulty),
            }));
        });

        const res = runQuery(sb.db, "SELECT * FROM v_course_tracks", 200);
        expect(res.rows).toHaveLength(88);
        expect(res.rows).toEqual(expectedRows);

        const first = res.rows[0];
        expect(first).toEqual({
            course_id: 551001,
            course_name: "初段",
            course_mode: "段位认定",
            course_locked: 0,
            unlock_course_id: null,
            life_initial: 350,
            life_recovery: 20,
            damage_perfect: 0,
            damage_great: 0,
            damage_good: 2,
            damage_miss: 5,
            track: 1,
            chart_key: "10256-0",
            music_id: 10256,
            track_title: "いーあるふぁんくらぶ",
            difficulty: "BASIC",
        });

        const tracks2To4 = res.rows.slice(1, 4).map(r => ({
            key: r.chart_key,
            title: r.track_title,
            diff: r.difficulty,
        }));
        expect(tracks2To4).toEqual([
            { key: "11052-0", title: "グリーンライツ・セレナーデ", diff: "BASIC" },
            { key: "10319-0", title: "幻想のサテライト", diff: "BASIC" },
            { key: "617-0", title: "オトヒメモリー☆ウタゲーション", diff: "BASIC" },
        ]);

        const [shinShodan] = runQuery(
            sb.db,
            "SELECT * FROM v_course_tracks WHERE course_id = 551101 LIMIT 1",
            1
        ).rows;
        expect(shinShodan.course_locked).toBe(1);
        expect(shinShodan.unlock_course_id).toBe(551010);
        expect(shinShodan.life_initial).toBe(50);
        expect(shinShodan.life_recovery).toBe(10);
        expect(shinShodan.damage_perfect).toBe(0);
        expect(shinShodan.damage_great).toBe(2);
        expect(shinShodan.damage_good).toBe(3);
        expect(shinShodan.damage_miss).toBe(5);
    });

    it("joins with v_charts on fully populated database to yield exactly the 2 present chart keys", () => {
        const paths = makeHome();
        populate(paths, { music: true, static: true });
        const sb = sandboxOf(paths, [
            PUBLIC_VIEWS.find(v => v.name === "v_course_tracks")!,
            PUBLIC_VIEWS.find(v => v.name === "v_charts")!,
        ]);
        const joined = runQuery(
            sb.db,
            "SELECT t.chart_key FROM v_course_tracks t JOIN v_charts c ON c.chart_key = t.chart_key ORDER BY t.chart_key",
            10
        ).rows.map(r => r.chart_key);
        expect(joined).toEqual(["10256-0", "191-2"]);
    });
});

describe("views independence", () => {
    it("operates independently when only specific tables have data", () => {
        const pathsMusic = makeHome();
        populate(pathsMusic, { music: true });
        const sbMusic = sandboxOf(pathsMusic, [PUBLIC_VIEWS.find(v => v.name === "v_charts")!]);
        expect(runQuery(sbMusic.db, "SELECT count(*) AS n FROM v_charts", 1).rows[0].n).toBe(183);

        const pathsCol = makeHome();
        populate(pathsCol, { collections: true });
        const sbCol = sandboxOf(pathsCol, [
            PUBLIC_VIEWS.find(v => v.name === "v_collections")!,
            PUBLIC_VIEWS.find(v => v.name === "v_collection_targets")!,
        ]);
        expect(runQuery(sbCol.db, "SELECT count(*) AS n FROM v_collections", 1).rows[0].n).toBe(27);
        expect(
            runQuery(sbCol.db, "SELECT count(*) AS n FROM v_collection_targets", 1).rows[0].n
        ).toBe(176);

        const pathsEmpty = makeHome();
        const store = openStore(pathsEmpty);
        store.close();
        const sbEmpty = sandboxOf(pathsEmpty, PUBLIC_VIEWS);
        expect(runQuery(sbEmpty.db, "SELECT count(*) AS n FROM v_charts", 1).rows[0].n).toBe(0);
        expect(runQuery(sbEmpty.db, "SELECT count(*) AS n FROM v_collections", 1).rows[0].n).toBe(
            0
        );
        expect(
            runQuery(sbEmpty.db, "SELECT count(*) AS n FROM v_collection_targets", 1).rows[0].n
        ).toBe(0);
        expect(runQuery(sbEmpty.db, "SELECT count(*) AS n FROM v_course_tracks", 1).rows[0].n).toBe(
            0
        );
    });
});

/** The rows `sql` would give for one query over the named views, read from a fresh sandbox. */
function readViews(
    paths: RuntimePaths,
    names: readonly string[],
    sql: string
): readonly Record<string, unknown>[] {
    const views = names.map(name => PUBLIC_VIEWS.find(view => view.name === name)!);
    const sandbox = sandboxOf(paths, views);
    return runQuery(sandbox.db, sql, 2000).rows;
}

describe("the order of the rows follows the stored data", () => {
    it("lists the charts of a song by the grade stored, not by the order they were written", () => {
        const paths = makeHome();
        populate(paths, { music: true });
        const store = openStore(paths);
        store.db.prepare("UPDATE charts SET grade = 9 WHERE chart_key = '8-0'").run();
        store.close();

        const rows = readViews(
            paths,
            ["v_charts"],
            "SELECT chart_key FROM v_charts WHERE song_id = 8"
        );
        expect(rows.map(row => row.chart_key)).toEqual(["8-1", "8-2", "8-3", "8-0"]);
    });

    it("lists the collections of a kind by position, and an unknown kind after the known ones", () => {
        const paths = makeHome();
        populate(paths, { collections: true, static: true });
        const store = openStore(paths);
        store.db
            .prepare("UPDATE collections SET position = 100 WHERE kind = 'plate' AND id = 1")
            .run();
        store.db
            .prepare(
                "UPDATE collections SET kind = 'zzz', position = -1 WHERE kind = 'icon' AND id = 209502"
            )
            .run();
        store.close();

        const rows = readViews(paths, ["v_collections"], "SELECT ref FROM v_collections");
        const refs = rows.map(row => row.ref as string);
        const plates = refs.filter(ref => ref.startsWith("plate:"));
        expect(plates).toEqual([
            "plate:2",
            "plate:6101",
            "plate:6102",
            "plate:6103",
            "plate:6104",
            "plate:6105",
            "plate:6106",
            "plate:6107",
            "plate:6148",
            "plate:409506",
            "plate:101",
            "plate:1",
        ]);
        // The kinds keep the order of `collection list`; one it does not know is listed last.
        const kinds = [...new Set(refs.map(ref => ref.split(":")[0]))];
        expect(kinds).toEqual(["plate", "title", "icon", "frame", "character", "partner", "zzz"]);
        expect(refs[refs.length - 1]).toBe("zzz:209502");
    });

    it("lists the targets of a kind by the collection's position, then the condition, song and difficulty as stored", () => {
        const paths = makeHome();
        populate(paths, { collections: true });
        const store = openStore(paths);
        store.db
            .prepare("UPDATE collections SET position = 100 WHERE kind = 'plate' AND id = 6101")
            .run();
        // Conditions, songs and difficulties are listed as they are stored, not sorted by value.
        store.db.prepare("UPDATE collections SET required = ? WHERE kind = 'title' AND id = 1").run(
            JSON.stringify([
                {
                    difficulties: [3, 0],
                    songs: [
                        { id: 9, title: "Z", type: "standard" },
                        { id: 2, title: "Y", type: "standard" },
                    ],
                },
                { songs: [{ id: 1, title: "X", type: "standard" }] },
            ])
        );
        store.close();

        const rows = readViews(
            paths,
            ["v_collection_targets"],
            "SELECT collection_ref, condition, song_title, difficulty FROM v_collection_targets"
        );
        const plateRefs = [
            ...new Set(
                rows
                    .map(row => row.collection_ref as string)
                    .filter(ref => ref.startsWith("plate:"))
            ),
        ];
        expect(plateRefs).toEqual([
            "plate:6102",
            "plate:6103",
            "plate:6104",
            "plate:6105",
            "plate:6106",
            "plate:6107",
            "plate:6148",
            "plate:409506",
            "plate:6101",
        ]);
        // Titles come after plates, and `title:1` is the first title by position.
        const title1 = rows
            .filter(row => row.collection_ref === "title:1")
            .map(row => [row.condition, row.song_title, row.difficulty]);
        expect(title1).toEqual([
            [1, "Z", "MASTER"],
            [1, "Z", "BASIC"],
            [1, "Y", "MASTER"],
            [1, "Y", "BASIC"],
            [2, "X", null],
        ]);
        expect(rows.findIndex(row => row.collection_ref === "title:1")).toBeGreaterThan(
            rows.findIndex(row => row.collection_ref === "plate:6101")
        );
    });

    it("lists the tracks of a course by position, and the courses by their position", () => {
        const paths = makeHome();
        populate(paths, { static: true });
        const store = openStore(paths);
        store.db
            .prepare(
                "UPDATE course_tracks SET position = 9 WHERE course_id = 551001 AND position = 0"
            )
            .run();
        store.db.prepare("UPDATE courses SET position = 99 WHERE id = 551002").run();
        store.close();

        const rows = readViews(
            paths,
            ["v_course_tracks"],
            "SELECT course_id, track, chart_key FROM v_course_tracks"
        );
        expect(rows).toHaveLength(88);
        expect(rows.slice(0, 4).map(row => [row.course_id, row.track, row.chart_key])).toEqual([
            [551001, 2, "11052-0"],
            [551001, 3, "10319-0"],
            [551001, 4, "617-0"],
            [551001, 10, "10256-0"],
        ]);
        // 551002 now comes after every other course.
        expect(rows.slice(-4).map(row => row.course_id)).toEqual([551002, 551002, 551002, 551002]);
        expect(rows[4].course_id).toBe(551003);
    });
});

describe("what the views make of odd collection data", () => {
    it("gives every song the music id the catalog uses, whatever case its type is written in", () => {
        const paths = makeHome();
        populate(paths, { collections: true });
        const store = openStore(paths);
        const song = (id: number, title: string, type: string): object => ({ id, title, type });
        store.db.prepare("UPDATE collections SET required = ? WHERE kind = 'title' AND id = 1").run(
            JSON.stringify([
                {
                    songs: [
                        song(1590, "dx", "dx"),
                        song(1590, "DX upper", "DX"),
                        song(1590, "Dx mixed", "Dx"),
                        song(10000, "dx at the offset", "dx"),
                        song(9999, "dx below the offset", "dx"),
                        song(10000, "standard at the offset", "standard"),
                        song(1590, "standard", "standard"),
                        song(100018, "utage", "utage"),
                        song(7, "utage small", "utage"),
                    ],
                },
            ])
        );
        store.close();

        const rows = readViews(
            paths,
            ["v_collection_targets"],
            "SELECT song_title, music_id FROM v_collection_targets WHERE collection_ref = 'title:1'"
        );
        expect(rows.map(row => [row.song_title, row.music_id])).toEqual([
            ["dx", 11590],
            ["DX upper", 11590],
            ["Dx mixed", 11590],
            ["dx at the offset", 10000],
            ["dx below the offset", 19999],
            ["standard at the offset", 10000],
            ["standard", 1590],
            ["utage", 100018],
            ["utage small", 7],
        ]);
    });

    it.each([
        ["plate", 12],
        ["title", 9],
        ["icon", 3],
        ["frame", 3],
    ])("gives an empty genre, not NULL, to a %s that has none", (kind, count) => {
        const paths = makeHome();
        populate(paths, { collections: true });
        const store = openStore(paths);
        store.db.prepare("UPDATE collections SET genre = NULL WHERE kind = ?").run(kind);
        store.close();

        const rows = readViews(
            paths,
            ["v_collections"],
            `SELECT genre, count(*) AS n FROM v_collections WHERE kind = '${kind}' GROUP BY genre`
        );
        expect(rows).toEqual([{ genre: "", n: count }]);
    });

    it("leaves the genre of a character without one as NULL", () => {
        const paths = makeHome();
        populate(paths, { collections: true, static: true });
        const store = openStore(paths);
        store.db.prepare("UPDATE collections SET genre = NULL WHERE kind = 'character'").run();
        store.close();

        const rows = readViews(
            paths,
            ["v_collections"],
            "SELECT genre, count(*) AS n FROM v_collections WHERE kind = 'character' GROUP BY genre"
        );
        expect(rows).toEqual([{ genre: null, n: 917 }]);
    });

    it("gives a locked course the course that unlocks it, and an unlocked one none", () => {
        const paths = makeHome();
        populate(paths, { static: true });
        const store = openStore(paths);
        // The stored column cannot be NULL, so an unlocked course keeps whatever number it has.
        store.db.prepare("UPDATE courses SET unlock_course_id = 551010 WHERE id = 551001").run();
        store.db
            .prepare(
                "UPDATE courses SET is_locked = 1, unlock_course_id = 551003 WHERE id = 551002"
            )
            .run();
        store.close();

        const rows = readViews(
            paths,
            ["v_course_tracks"],
            "SELECT course_id, course_locked, unlock_course_id FROM v_course_tracks WHERE track = 1 AND course_id IN (551001, 551002)"
        );
        expect(rows).toEqual([
            { course_id: 551001, course_locked: 0, unlock_course_id: null },
            { course_id: 551002, course_locked: 1, unlock_course_id: 551003 },
        ]);
    });
});
