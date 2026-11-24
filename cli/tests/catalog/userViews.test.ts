import type { PublicView } from "../../src/catalog/views";
import type { RuntimePaths } from "../../src/runtime/paths";
import type { Sandbox } from "../../src/store/sandbox";
import type { MadeRecord } from "../madeUsers";
import { getFixtureSaltMetaCompacted } from "@core/fixtures/saltmeta";
import { buildSaltMetaMusicList } from "@core/music/fetch";
import { afterEach, describe, expect, it } from "vitest";
import { replaceMusic } from "../../src/catalog/store";
import { PUBLIC_VIEWS } from "../../src/catalog/views";
import { runQuery } from "../../src/store/query";
import { openSandbox, REAL_SCHEMA } from "../../src/store/sandbox";
import { loadSqlite } from "../../src/store/sqlite";
import { openStore } from "../../src/store/store";
import { insertMadeUsers } from "../madeUsers";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();
const sandboxes: Sandbox<unknown>[] = [];

afterEach(() => {
    for (const sandbox of sandboxes.splice(0)) sandbox.close();
});

function named(name: string): PublicView {
    return PUBLIC_VIEWS.find(view => view.name === name)!;
}

function sandbox(paths: RuntimePaths, names: readonly string[]): Sandbox<unknown> {
    const opened = openSandbox({ database: paths.database, views: names.map(named) });
    sandboxes.push(opened);
    return opened;
}

function seedCatalog(paths: RuntimePaths): ReturnType<typeof openStore> {
    const store = openStore(paths);
    replaceMusic(
        store,
        buildSaltMetaMusicList(getFixtureSaltMetaCompacted(), { mergeDuplicates: true }),
        { fetchedAt: 1000, upstreamVersion: "1" }
    );
    return store;
}

const RANKS = [
    ["d", "D"],
    ["c", "C"],
    ["b", "B"],
    ["bb", "BB"],
    ["bbb", "BBB"],
    ["a", "A"],
    ["aa", "AA"],
    ["aaa", "AAA"],
    ["s", "S"],
    ["sp", "S+"],
    ["ss", "SS"],
    ["ssp", "SS+"],
    ["sss", "SSS"],
    ["sssp", "SSS+"],
] as const;
const COMBOS = [
    ["", null],
    ["fc", "FC"],
    ["fcp", "FC+"],
    ["ap", "AP"],
    ["app", "AP+"],
] as const;
const SYNCS = [
    ["", null],
    ["sync", "SYNC"],
    ["fs", "FS"],
    ["fsp", "FS+"],
    ["fsd", "FDX"],
    ["fsdp", "FDX+"],
] as const;

function madeScores(): MadeRecord[] {
    return RANKS.map(([rate], index) => ({
        recordKey: `record-${index}`,
        chartKey: index === 0 ? "8-0" : index === 1 ? null : `made-${index}`,
        songId: index === 4 ? 1590 : index + 1,
        type: index === 4 ? "DX" : "SD",
        title: `score ${index}`,
        level: index === 2 ? "?" : String(index + 1),
        levelIndex: index === 2 ? 99 : index % 5,
        levelLabel: "made",
        ds: index === 1 ? 0 : index + 0.1,
        achievements: 50 + index,
        dxScore: 1000 + index,
        fc: COMBOS[index % COMBOS.length][0],
        fs: SYNCS[index % SYNCS.length][0],
        rate,
        ra: 100 + index,
        playCount: index === 3 ? null : index,
        lastChangedAt: [0, 999, 1000, 1700000000123][index % 4],
    }));
}

function seedUsers(paths: RuntimePaths): void {
    const store = openStore(paths);
    insertMadeUsers(store.db, [
        {
            uid: "default",
            position: 0,
            scores: [
                ...madeScores(),
                {
                    recordKey: "110018-3",
                    chartKey: "110018-10",
                    songId: 100018,
                    type: "DX",
                    title: "banquet",
                    level: "12?",
                    levelIndex: 3,
                    ds: 12,
                    achievements: 100,
                    dxScore: 2000,
                    fc: "app",
                    fs: "fsdp",
                    rate: "sss",
                    ra: 200,
                },
            ],
            items: [1, 2, 3, 9, 10, 11, 42].map((listIndex, position) => ({
                listIndex,
                position,
                itemKind: listIndex,
                itemId: 100 + position,
                stock: position % 2,
                isValid: position === 6 ? null : position % 2,
            })),
            characters: [
                {
                    position: 0,
                    characterId: 7,
                    level: 12,
                    awakening: 3,
                    point: 400,
                    useCount: 5,
                    nextAwake: 600,
                    nextAwakePercent: 66.67,
                },
            ],
            ratingHistory: [
                { position: 0, time: 1000, rating: 15000 },
                { position: 1, time: 0, rating: 14000 },
                { position: 2, time: 999, rating: 14500 },
            ],
            scoreEvents: [
                {
                    id: "event-change",
                    recordKey: "record-0",
                    observedAt: 1700000000123,
                    sequence: 1,
                    source: "lxns",
                    kind: "change",
                    changedMask: 31,
                    achievements: 100.5,
                    dxScore: 1234,
                    fc: "app",
                    fs: "fsdp",
                    playCount: 9,
                },
                {
                    id: "event-initial",
                    recordKey: "missing-record",
                    observedAt: 999,
                    sequence: 0,
                    source: "divingFishPublic",
                    kind: "initial",
                    achievements: 1,
                    dxScore: 2,
                    fc: "",
                    fs: "",
                },
            ],
        },
        {
            uid: "second",
            position: 1,
            scores: [
                {
                    recordKey: "8-0",
                    chartKey: "8-0",
                    songId: 8,
                    type: "SD",
                    levelIndex: 0,
                    achievements: 1,
                    dxScore: 2,
                    fc: "fc",
                    fs: "fs",
                    rate: "d",
                    ra: 3,
                    playCount: 4,
                    lastChangedAt: 1000,
                },
            ],
            items: [{ listIndex: 1, position: 0, itemId: 999, stock: 1, isValid: 1 }],
        },
    ]);
    store.close();
}

describe("user read-only views", () => {
    it("renders every score code, nullable record field, unknown difficulty, and banquet key", () => {
        const paths = makeHome();
        seedUsers(paths);
        const sb = sandbox(paths, ["v_scores"]);
        const rows = runQuery(sb.db, "SELECT * FROM v_scores", 100).rows;

        expect(rows).toHaveLength(16);
        expect(rows.map(row => row.user_index)).toEqual([
            ...Array.from({ length: 15 }, () => 0),
            1,
        ]);
        const byKey = new Map(rows.map(row => [`${row.user_uid}:${row.record_key}`, row]));
        for (const [index, [, label]] of RANKS.entries()) {
            const row = byKey.get(`default:record-${index}`)!;
            expect(row.rank).toBe(label);
            expect(row.combo).toBe(COMBOS[index % COMBOS.length][1]);
            expect(row.sync).toBe(SYNCS[index % SYNCS.length][1]);
            expect(row.changed_at).toBe(
                new Date([0, 999, 1000, 1700000000123][index % 4]).toISOString()
            );
        }
        expect(byKey.get("default:record-1")).toMatchObject({ chart_key: null, constant: null });
        expect(byKey.get("default:record-2")).toMatchObject({ difficulty: "99" });
        expect(byKey.get("default:record-3")).toMatchObject({ play_count: null });
        expect(byKey.get("default:record-4")).toMatchObject({ music_id: 11590 });
        expect(byKey.get("default:110018-3")).toMatchObject({
            chart_key: "110018-10",
            record_key: "110018-3",
            music_id: 100018,
        });
    });

    it("renders score events, rating history, items, and characters in their fixed order", () => {
        const paths = makeHome();
        seedUsers(paths);
        const sb = sandbox(paths, [
            "v_score_events",
            "v_rating_history",
            "v_user_items",
            "v_user_characters",
        ]);

        expect(runQuery(sb.db, "SELECT * FROM v_score_events", 10).rows).toEqual([
            {
                user_index: 0,
                user_uid: "default",
                event_id: "event-initial",
                record_key: "missing-record",
                chart_key: null,
                observed_at: new Date(999).toISOString(),
                sequence: 0,
                source: "divingFishPublic",
                kind: "initial",
                changed_mask: 0,
                batch_id: "batch",
                achievements: 1,
                dx_score: 2,
                combo: null,
                sync: null,
                play_count: null,
            },
            {
                user_index: 0,
                user_uid: "default",
                event_id: "event-change",
                record_key: "record-0",
                chart_key: "8-0",
                observed_at: new Date(1700000000123).toISOString(),
                sequence: 1,
                source: "lxns",
                kind: "change",
                changed_mask: 31,
                batch_id: "batch",
                achievements: 100.5,
                dx_score: 1234,
                combo: "AP+",
                sync: "FDX+",
                play_count: 9,
            },
        ]);
        expect(runQuery(sb.db, "SELECT * FROM v_rating_history", 10).rows).toEqual([
            { user_index: 0, user_uid: "default", time: new Date(0).toISOString(), rating: 14000 },
            {
                user_index: 0,
                user_uid: "default",
                time: new Date(999).toISOString(),
                rating: 14500,
            },
            {
                user_index: 0,
                user_uid: "default",
                time: new Date(1000).toISOString(),
                rating: 15000,
            },
        ]);

        const items = runQuery(sb.db, "SELECT * FROM v_user_items", 20).rows;
        expect(
            items.map(row => [
                row.user_index,
                row.user_uid,
                row.kind,
                row.item_id,
                row.ref,
                row.stock,
                row.is_valid,
            ])
        ).toEqual([
            [0, "default", "plate", 100, "plate:100", 0, 0],
            [0, "default", "title", 101, "title:101", 1, 1],
            [0, "default", "icon", 102, "icon:102", 0, 0],
            [0, "default", "character", 103, "character:103", 1, 1],
            [0, "default", "partner", 104, "partner:104", 0, 0],
            [0, "default", "frame", 105, "frame:105", 1, 1],
            [0, "default", "42", 106, "42:106", 0, null],
            [1, "second", "plate", 999, "plate:999", 1, 1],
        ]);
        expect(runQuery(sb.db, "SELECT * FROM v_user_characters", 10).rows).toEqual([
            {
                user_index: 0,
                user_uid: "default",
                character_id: 7,
                ref: "character:7",
                level: 12,
                awakening: 3,
                point: 400,
                use_count: 5,
                next_awake: 600,
                next_awake_percent: 66.67,
            },
        ]);
    });

    it("keeps v_charts rows and old columns unchanged and joins only the default user's score", () => {
        const paths = makeHome();
        const store = seedCatalog(paths);
        store.close();
        const before = sandbox(paths, ["v_charts"]);
        const chartColumns = named("v_charts").columns;
        const oldColumns = chartColumns.slice(0, 28).map(column => column.name);
        const selectOld = oldColumns.join(", ");
        const oldRows = runQuery(before.db, `SELECT ${selectOld} FROM v_charts`, 1000).rows;

        seedUsers(paths);
        const after = sandbox(paths, ["v_charts"]);
        expect(runQuery(after.db, `SELECT ${selectOld} FROM v_charts`, 1000).rows).toEqual(oldRows);
        expect(runQuery(after.db, "SELECT count(*) AS n FROM v_charts", 1).rows).toEqual([
            { n: 183 },
        ]);
        expect(
            runQuery(
                after.db,
                "SELECT score_achievements, score_rank, score_combo, score_sync, score_dx_score, score_rating, score_play_count, score_changed_at FROM v_charts WHERE chart_key = '8-0'",
                1
            ).rows
        ).toEqual([
            {
                score_achievements: 50,
                score_rank: "D",
                score_combo: null,
                score_sync: null,
                score_dx_score: 1000,
                score_rating: 100,
                score_play_count: 0,
                score_changed_at: new Date(0).toISOString(),
            },
        ]);
        expect(
            runQuery(after.db, "SELECT score_achievements FROM v_charts WHERE chart_key = '8-1'", 1)
                .rows
        ).toEqual([{ score_achievements: null }]);
    });

    it("copies v_charts, v_scores, and companion reads from one database snapshot", () => {
        const paths = makeHome();
        const store = seedCatalog(paths);
        insertMadeUsers(store.db, [{ uid: "default", position: 0 }]);
        store.close();

        const { DatabaseSync } = loadSqlite();
        const writer = new DatabaseSync(paths.database);
        try {
            const opened = openSandbox({
                database: paths.database,
                views: [named("v_charts"), named("v_scores")],
                readAlso: db => {
                    writer.exec(
                        "INSERT INTO scores (user_uid, record_key, chart_key, achievements) VALUES ('default', '8-0', '8-0', 99)"
                    );
                    return db.prepare(`SELECT count(*) AS n FROM ${REAL_SCHEMA}.scores`).get() as {
                        n: number;
                    };
                },
            });
            sandboxes.push(opened);
            expect(opened.also).toEqual({ n: 0 });
            expect(runQuery(opened.db, "SELECT count(*) AS n FROM v_scores", 1).rows).toEqual([
                { n: 0 },
            ]);
            expect(
                runQuery(
                    opened.db,
                    "SELECT score_achievements FROM v_charts WHERE chart_key = '8-0'",
                    1
                ).rows
            ).toEqual([{ score_achievements: null }]);
        } finally {
            writer.close();
        }
    });

    it("shows every field of a score row", () => {
        const paths = makeHome();
        seedUsers(paths);
        const rows = runQuery(
            sandbox(paths, ["v_scores"]).db,
            "SELECT * FROM v_scores WHERE record_key = 'record-4'",
            10
        ).rows;

        expect(rows).toEqual([
            {
                user_index: 0,
                user_uid: "default",
                chart_key: "made-4",
                record_key: "record-4",
                music_id: 11590,
                title: "score 4",
                type: "DX",
                difficulty: "Re:MASTER",
                level: "5",
                constant: 4.1,
                achievements: 54,
                rank: "BBB",
                combo: "AP+",
                sync: "FDX",
                dx_score: 1004,
                rating: 104,
                play_count: 4,
                changed_at: "1970-01-01T00:00:00.000Z",
            },
        ]);
    });

    it("writes the catalog music id of every kind of record", () => {
        const paths = makeHome();
        const store = openStore(paths);
        insertMadeUsers(store.db, [
            {
                uid: "default",
                position: 0,
                scores: [
                    { recordKey: "sd", songId: 5, type: "SD" },
                    { recordKey: "dx-low", songId: 1590, type: "DX" },
                    { recordKey: "dx-offset", songId: 10000, type: "DX" },
                    { recordKey: "dx-high", songId: 11590, type: "DX" },
                    { recordKey: "dx-lower-case", songId: 7, type: "dx" },
                    { recordKey: "no-type", songId: 9 },
                    { recordKey: "no-id", type: "DX" },
                ],
            },
        ]);
        store.close();

        expect(
            runQuery(
                sandbox(paths, ["v_scores"]).db,
                "SELECT record_key, music_id FROM v_scores ORDER BY record_key",
                10
            ).rows
        ).toEqual([
            { record_key: "dx-high", music_id: 11590 },
            { record_key: "dx-low", music_id: 11590 },
            { record_key: "dx-lower-case", music_id: 10007 },
            { record_key: "dx-offset", music_id: 10000 },
            { record_key: "no-id", music_id: null },
            { record_key: "no-type", music_id: 9 },
            { record_key: "sd", music_id: 5 },
        ]);
    });

    it("shows every score column of v_charts from the default user only", () => {
        const paths = makeHome();
        const store = seedCatalog(paths);
        const score = {
            recordKey: "8-2",
            chartKey: "8-2",
            songId: 8,
            type: "SD",
            levelIndex: 2,
            achievements: 99.5,
            dxScore: 1500,
            fc: "fcp",
            fs: "fsp",
            rate: "sp",
            ra: 250,
            playCount: 3,
            lastChangedAt: 1700000000123,
        };
        insertMadeUsers(store.db, [
            {
                uid: "second",
                position: 1,
                scores: [{ ...score, achievements: 1, fc: "ap", fs: "sync", rate: "d" }],
            },
            { uid: "default", position: 0, scores: [score] },
        ]);
        store.close();

        expect(
            runQuery(
                sandbox(paths, ["v_charts"]).db,
                "SELECT score_achievements, score_rank, score_combo, score_sync, score_dx_score, score_rating, score_play_count, score_changed_at FROM v_charts WHERE chart_key = '8-2'",
                10
            ).rows
        ).toEqual([
            {
                score_achievements: 99.5,
                score_rank: "S+",
                score_combo: "FC+",
                score_sync: "FS+",
                score_dx_score: 1500,
                score_rating: 250,
                score_play_count: 3,
                score_changed_at: "2023-11-14T22:13:20.123Z",
            },
        ]);
    });

    it("attaches an event only to the score of its own user", () => {
        const paths = makeHome();
        const store = openStore(paths);
        insertMadeUsers(store.db, [
            {
                uid: "first",
                position: 0,
                scores: [{ recordKey: "1-0", chartKey: "1-0" }],
                scoreEvents: [{ id: "first-1", recordKey: "1-0", observedAt: 5, sequence: 0 }],
            },
            {
                uid: "second",
                position: 1,
                scores: [{ recordKey: "1-0", chartKey: "made-1" }],
                scoreEvents: [
                    { id: "second-1", recordKey: "1-0", observedAt: 1, sequence: 0 },
                    { id: "second-2", recordKey: "2-0", observedAt: 2, sequence: 0 },
                ],
            },
            {
                uid: "third",
                position: 2,
                scores: [{ recordKey: "2-0", chartKey: "2-0" }],
            },
        ]);
        store.close();

        expect(
            runQuery(
                sandbox(paths, ["v_score_events"]).db,
                "SELECT user_uid, event_id, chart_key FROM v_score_events",
                10
            ).rows
        ).toEqual([
            { user_uid: "first", event_id: "first-1", chart_key: "1-0" },
            { user_uid: "second", event_id: "second-1", chart_key: "made-1" },
            { user_uid: "second", event_id: "second-2", chart_key: null },
        ]);
    });

    it("breaks every tie in the order of scores, events, and rating history", () => {
        const paths = makeHome();
        const store = openStore(paths);
        insertMadeUsers(store.db, [
            {
                uid: "default",
                position: 0,
                scores: [
                    { recordKey: "5-2-z", songId: 5, type: "SD", levelIndex: 2 },
                    { recordKey: "5-2-a", songId: 5, type: "SD", levelIndex: 2 },
                ],
                // The id breaks the tie: insertion order and record keys both say otherwise.
                scoreEvents: [
                    { id: "event-z", recordKey: "5-2-a", observedAt: 7, sequence: 3 },
                    { id: "event-a", recordKey: "5-2-z", observedAt: 7, sequence: 3 },
                ],
                ratingHistory: [
                    { position: 0, time: 7, rating: 2 },
                    { position: 1, time: 7, rating: 1 },
                ],
            },
        ]);
        store.close();
        const sb = sandbox(paths, ["v_scores", "v_score_events", "v_rating_history"]);

        expect(runQuery(sb.db, "SELECT record_key FROM v_scores", 10).rows).toEqual([
            { record_key: "5-2-a" },
            { record_key: "5-2-z" },
        ]);
        expect(runQuery(sb.db, "SELECT event_id FROM v_score_events", 10).rows).toEqual([
            { event_id: "event-a" },
            { event_id: "event-z" },
        ]);
        expect(runQuery(sb.db, "SELECT rating FROM v_rating_history", 10).rows).toEqual([
            { rating: 2 },
            { rating: 1 },
        ]);
    });

    it("orders rows by user position, catalog music id, difficulty and time", () => {
        const paths = makeHome();
        const store = openStore(paths);
        // Inserted against the expected order, and with uids, raw song ids, difficulties and
        // sequences that would each give another order.
        insertMadeUsers(store.db, [
            {
                uid: "a-second",
                position: 1,
                scores: [{ recordKey: "1-0", songId: 1, type: "SD", levelIndex: 0 }],
                scoreEvents: [{ id: "a-event", recordKey: "1-0", observedAt: 1, sequence: 0 }],
                ratingHistory: [{ position: 0, time: 1, rating: 1 }],
                items: [{ listIndex: 1, position: 0, itemId: 1 }],
                characters: [{ position: 0, characterId: 1 }],
            },
            {
                uid: "z-default",
                position: 0,
                scores: [
                    { recordKey: "10005-0", songId: 5, type: "DX", levelIndex: 0 },
                    { recordKey: "9-3", songId: 9, type: "SD", levelIndex: 3 },
                    { recordKey: "9-1", songId: 9, type: "SD", levelIndex: 1 },
                ],
                scoreEvents: [
                    { id: "late", recordKey: "9-1", observedAt: 9, sequence: 1 },
                    { id: "early", recordKey: "9-1", observedAt: 5, sequence: 9 },
                ],
                ratingHistory: [
                    { position: 1, time: 5, rating: 2 },
                    { position: 0, time: 9, rating: 3 },
                ],
                items: [
                    { listIndex: 2, position: 0, itemId: 4 },
                    { listIndex: 1, position: 1, itemId: 3 },
                    { listIndex: 1, position: 0, itemId: 2 },
                ],
                characters: [
                    { position: 2, characterId: 5 },
                    { position: 1, characterId: 4 },
                    { position: 0, characterId: 6 },
                ],
            },
        ]);
        store.close();
        const sb = sandbox(paths, [
            "v_scores",
            "v_score_events",
            "v_rating_history",
            "v_user_items",
            "v_user_characters",
        ]);

        expect(runQuery(sb.db, "SELECT user_uid, record_key FROM v_scores", 10).rows).toEqual([
            { user_uid: "z-default", record_key: "9-1" },
            { user_uid: "z-default", record_key: "9-3" },
            { user_uid: "z-default", record_key: "10005-0" },
            { user_uid: "a-second", record_key: "1-0" },
        ]);
        expect(runQuery(sb.db, "SELECT event_id FROM v_score_events", 10).rows).toEqual([
            { event_id: "early" },
            { event_id: "late" },
            { event_id: "a-event" },
        ]);
        // Rating history is in time order, whatever the order of the stored list.
        expect(runQuery(sb.db, "SELECT rating FROM v_rating_history", 10).rows).toEqual([
            { rating: 2 },
            { rating: 3 },
            { rating: 1 },
        ]);
        expect(runQuery(sb.db, "SELECT item_id FROM v_user_items", 10).rows).toEqual([
            { item_id: 2 },
            { item_id: 3 },
            { item_id: 4 },
            { item_id: 1 },
        ]);
        expect(runQuery(sb.db, "SELECT character_id FROM v_user_characters", 10).rows).toEqual([
            { character_id: 6 },
            { character_id: 4 },
            { character_id: 5 },
            { character_id: 1 },
        ]);
    });

    it("writes times as toISOString does, and NULL outside the years 0000 to 9999", () => {
        const yearZero = -62167219200000;
        const lastOf9999 = 253402300799999;
        const times = [null, yearZero - 1, yearZero, -1001, -1, 0, 999, 1000, lastOf9999];
        const paths = makeHome();
        const store = openStore(paths);
        insertMadeUsers(store.db, [
            {
                uid: "default",
                position: 0,
                ratingHistory: [...times, lastOf9999 + 1].map((time, position) => ({
                    position,
                    time,
                    rating: position,
                })),
                scoreEvents: [
                    { id: "a", recordKey: "1-0", observedAt: 1000.9, sequence: 0 },
                    { id: "b", recordKey: "1-0", observedAt: 1999.5, sequence: 0 },
                ],
            },
        ]);
        store.close();
        const sb = sandbox(paths, ["v_rating_history", "v_score_events"]);

        const expected = (time: number | null): string | null => {
            if (time === null || time < yearZero || time > lastOf9999) return null;
            return new Date(time).toISOString();
        };
        expect(runQuery(sb.db, "SELECT time, rating FROM v_rating_history", 20).rows).toEqual(
            [...times, lastOf9999 + 1].map((time, rating) => ({ time: expected(time), rating }))
        );
        expect(expected(yearZero)).toBe("0000-01-01T00:00:00.000Z");
        expect(expected(-1)).toBe("1969-12-31T23:59:59.999Z");
        expect(runQuery(sb.db, "SELECT observed_at FROM v_score_events", 10).rows).toEqual([
            { observed_at: "1970-01-01T00:00:01.000Z" },
            { observed_at: "1970-01-01T00:00:01.999Z" },
        ]);
    });
});
