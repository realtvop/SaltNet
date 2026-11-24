import type { DivingFishFullRecord } from "@core/integrations/diving-fish/type";
import type { Chart, Music, SavedMusicList } from "@core/music/type";
import type { ScoreHistoryEventV1 } from "@core/user/scoreHistory/type";
import type { User } from "@core/user/type";
import type { Store } from "../../src/store/store";
import { getFixtureSaltMetaCompacted } from "@core/fixtures/saltmeta";
import {
    ChartType,
    ComboStatus,
    MusicGenre,
    MusicOrigin,
    RankRate,
    SyncStatus,
} from "@core/mai/types";
import { buildSaltMetaMusicList } from "@core/music/fetch";
import { afterEach, describe, expect, it } from "vitest";
import { replaceMusic } from "../../src/catalog/store";
import { resolveUser } from "../../src/refs/user";
import { openStore } from "../../src/store/store";
import {
    appendScoreEvents,
    listUsers,
    makeDefaultUser,
    readScoreEvents,
    readUser,
    readUsers,
    removeUser,
    replaceUsers,
    saveUser,
} from "../../src/users/repository";
import { buildUserRows, chartKeysForRecords } from "../../src/users/rows";
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

function user(uid: string, data: Record<string, unknown> = {}): User {
    return {
        uid,
        remark: null,
        divingFish: { name: null },
        inGame: { id: null, name: null, enabled: false, useFastUpdate: false },
        settings: { manuallyUpdate: false },
        data: { updateTime: null, name: null, rating: null, ...data },
    } as User;
}

function event(id: string, userUid = "one", observedAt = 100): ScoreHistoryEventV1 {
    return {
        id,
        schemaVersion: 1,
        generationId: "generation",
        batchId: "batch",
        userUid,
        chartKey: "8-0",
        observedAt,
        sequence: 0,
        source: "inGame",
        kind: "initial",
        changedMask: 0,
        state: {
            achievements: 100,
            dxScore: 1000,
            fc: ComboStatus.None,
            fs: SyncStatus.None,
            playCount: null,
        },
    };
}

function rows(store: Store, table: string): Record<string, unknown>[] {
    return store.db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
}

function seedCatalog(store: Store): void {
    replaceMusic(
        store,
        buildSaltMetaMusicList(getFixtureSaltMetaCompacted(), { mergeDuplicates: true }),
        { fetchedAt: 1000, upstreamVersion: "1" }
    );
}

describe("raw users and typed listings", () => {
    it("round-trips the whole JSON object while unsafe copies become NULL", () => {
        const store = open();
        const made = user("strange", {
            updateTime: "yesterday",
            name: "Data name",
            rating: 12.5,
            items: [[{ itemKind: 1 }, null], null],
            detailed: {
                odd: {
                    song_id: 2 ** 53,
                    type: "SD",
                    title: null,
                    level: "1",
                    level_index: 1.5,
                    level_label: "Basic",
                    ds: "1.0",
                    achievements: 99.5,
                    dxScore: 2 ** 53,
                    fc: "",
                    fs: "",
                    rate: "sss",
                    ra: "12",
                    play_count: 2.5,
                    lastChangedAt: "now",
                },
            },
            futureField: null,
        }) as User & { futureRoot?: unknown };
        made.futureRoot = { later: null };

        replaceUsers(store, [made], []);

        expect(readUsers(store)).toEqual([made]);
        expect(readUser(store, "strange")).toEqual(made);
        expect(readUser(store, "missing")).toBeUndefined();
        expect(rows(store, "scores")[0]).toMatchObject({
            record_key: "odd",
            chart_key: null,
            song_id: null,
            title: null,
            level_index: null,
            ds: null,
            achievements: 99.5,
            dx_score: null,
            ra: null,
            play_count: null,
            last_changed_at: null,
        });
        expect(rows(store, "user_items")).toEqual([
            {
                user_uid: "strange",
                list_index: 0,
                position: 0,
                item_kind: 1,
                item_id: null,
                stock: null,
                is_valid: null,
            },
        ]);
    });

    it("lists every typed user field while deriving the display name from raw", () => {
        const store = open();
        const made = user("list", {
            updateTime: 123,
            name: "",
            rating: 15000,
            detailed: null,
            b50: null,
            items: null,
            characters: null,
            ratingHistory: null,
        }) as unknown as Record<string, unknown>;
        made.remark = null;
        made.divingFish = { name: "Fish" };
        made.lxns = { id: 42, name: "Snow", auth: null };
        made.inGame = { id: 7, name: "Game", enabled: true, useFastUpdate: true };
        made.settings = { manuallyUpdate: true };
        replaceUsers(store, [made as unknown as User], []);
        store.db.prepare("UPDATE users SET raw = ? WHERE uid = ?").run(
            JSON.stringify({
                uid: "list",
                data: { name: "Raw display" },
                inGame: { id: null, name: null },
                divingFish: { name: null },
                changedAfterWrite: true,
            }),
            "list"
        );

        expect(listUsers(store)).toEqual([
            {
                index: 0,
                uid: "list",
                displayName: "Raw display",
                remark: null,
                divingFishName: "Fish",
                hasLxns: true,
                lxnsId: 42,
                lxnsName: "Snow",
                inGameId: 7,
                inGameName: "Game",
                inGameEnabled: true,
                inGameFastUpdate: true,
                manuallyUpdate: true,
                updatedAt: 123,
                dataName: "",
                rating: 15000,
                hasDetailed: true,
                hasB50: true,
                hasItems: true,
                hasCharacters: true,
                hasRatingHistory: true,
            },
        ]);
    });

    it("uses the web display-name rule for unusual raw values and user references", () => {
        const store = open();
        const fraction = user("fraction") as unknown as Record<string, unknown>;
        fraction.inGame = { id: 1.5, name: null, enabled: false, useFastUpdate: false };
        const zero = user("zero") as unknown as Record<string, unknown>;
        zero.inGame = { id: 0, name: null, enabled: false, useFastUpdate: false };
        const empty = user("empty") as unknown as Record<string, unknown>;
        empty.remark = "";
        const numberName = user("number", { name: 5 });

        replaceUsers(
            store,
            [
                fraction as unknown as User,
                zero as unknown as User,
                empty as unknown as User,
                user("three", { name: "Three" }),
                user("four", { name: "Four" }),
                numberName,
            ],
            []
        );

        const listed = listUsers(store);
        expect(listed.map(item => item.displayName)).toEqual([
            "1.5",
            "wmc",
            "",
            "Three",
            "Four",
            "5",
        ]);
        expect(resolveUser(listed, "1.5").uid).toBe("fraction");
        expect(resolveUser(listed, "wmc").uid).toBe("zero");
        expect(resolveUser(listed, "").uid).toBe("empty");
        expect(resolveUser(listed, "5").uid).toBe("number");
    });
});

describe("the query copies", () => {
    it("copies no entry that is not a plain object", () => {
        const store = open();
        replaceUsers(
            store,
            [
                user("one", {
                    detailed: { list: [] },
                    b50: { sd: [[]], dx: [] },
                    items: [[[]]],
                    characters: [[]],
                    ratingHistory: [[]],
                }),
            ],
            []
        );

        for (const table of [
            "scores",
            "b50_snapshot",
            "user_items",
            "user_characters",
            "rating_history",
        ]) {
            expect(rows(store, table)).toEqual([]);
        }
    });

    it("reads every copy from the stored JSON", () => {
        const store = open();
        seedCatalog(store);
        // Values JSON writes differently from what they are: each copy must show the written value.
        const two = { toJSON: () => 2 };
        const dated = { ...scoreRecord(8, 0), title: new Date(0) };
        const made = user("one", {
            detailed: { made: dated },
            b50: { sd: [{ ...dated }], dx: [] },
            items: [[{ itemKind: two, itemId: 3, stock: 1, isValid: false }]],
            characters: [{ characterId: two, point: 10 }],
            ratingHistory: [{ time: two, rating: 15000 }],
        });
        const tables = [
            "users",
            "scores",
            "b50_snapshot",
            "user_items",
            "user_characters",
            "rating_history",
        ];
        const everyTable = () => tables.map(table => rows(store, table));

        replaceUsers(store, [made], []);
        const saved = everyTable();
        expect(rows(store, "scores")[0].title).toBe("1970-01-01T00:00:00.000Z");
        expect(rows(store, "b50_snapshot")[0].title).toBe("1970-01-01T00:00:00.000Z");
        expect(rows(store, "user_items")[0].item_kind).toBe(2);
        expect(rows(store, "user_characters")[0].character_id).toBe(2);
        expect(rows(store, "rating_history")[0].time).toBe(2);

        replaceUsers(store, [JSON.parse(JSON.stringify(made)) as User], []);
        expect(everyTable()).toEqual(saved);
    });

    it("leaves a fractional rating out of the integer rating copy", () => {
        const store = open();
        replaceUsers(
            store,
            [user("one", { detailed: { half: { ...scoreRecord(8, 0), ra: 1.5 } } })],
            []
        );

        expect(rows(store, "scores")[0].ra).toBeNull();
    });

    it("writes every table and column from plain-object entries", () => {
        const store = open();
        seedCatalog(store);
        const record = {
            song_id: 8,
            type: "SD",
            title: "Made score",
            level: "1",
            level_index: 0,
            level_label: "Basic",
            ds: 1.2,
            achievements: 99.1234,
            dxScore: 1234,
            fc: "fc",
            fs: "fs",
            rate: "sss",
            ra: 42,
            play_count: 3,
            lastChangedAt: 456,
        };
        const made = user("copies", {
            updateTime: 100,
            name: "Data",
            rating: 16000,
            info: { iconId: 7 },
            detailed: { "kept-map-key": record },
            b50: { sd: [record, null], dx: [{ ...record, song_id: 1.5 }] },
            items: [[{ itemKind: 2, itemId: 3, stock: 1, isValid: false }]],
            characters: [
                {
                    characterId: 9,
                    point: 10,
                    useCount: 11,
                    level: 12,
                    nextAwake: 13,
                    nextAwakePercent: 14.5,
                    awakening: 15,
                },
            ],
            ratingHistory: [{ time: 200, rating: 15000 }],
        });

        replaceUsers(store, [made], []);

        expect(rows(store, "users")[0]).toMatchObject({
            uid: "copies",
            position: 0,
            updated_at: 100,
            data_name: "Data",
            rating: 16000,
            info: '{"iconId":7}',
            has_detailed: 1,
            has_b50: 1,
            has_items: 1,
            has_characters: 1,
            has_rating_history: 1,
        });
        expect(rows(store, "scores")).toEqual([
            {
                user_uid: "copies",
                record_key: "kept-map-key",
                chart_key: "8-0",
                song_id: 8,
                type: "SD",
                title: "Made score",
                level: "1",
                level_index: 0,
                level_label: "Basic",
                ds: 1.2,
                achievements: 99.1234,
                dx_score: 1234,
                fc: "fc",
                fs: "fs",
                rate: "sss",
                ra: 42,
                play_count: 3,
                last_changed_at: 456,
            },
        ]);
        expect(rows(store, "b50_snapshot")).toEqual([
            expect.objectContaining({
                user_uid: "copies",
                section: "sd",
                position: 0,
                record_key: "8-0",
                chart_key: "8-0",
            }),
            // A fractional song id is still a B50 entry: its key is written as the web app's
            // `convertDetailed` would write it, and only the integer copy is NULL.
            expect.objectContaining({
                user_uid: "copies",
                section: "dx",
                position: 0,
                record_key: "1.5-0",
                chart_key: null,
                song_id: null,
            }),
        ]);
        expect(rows(store, "user_items")).toEqual([
            {
                user_uid: "copies",
                list_index: 0,
                position: 0,
                item_kind: 2,
                item_id: 3,
                stock: 1,
                is_valid: 0,
            },
        ]);
        expect(rows(store, "user_characters")).toEqual([
            {
                user_uid: "copies",
                position: 0,
                character_id: 9,
                point: 10,
                use_count: 11,
                level: 12,
                next_awake: 13,
                next_awake_percent: 14.5,
                awakening: 15,
            },
        ]);
        expect(rows(store, "rating_history")).toEqual([
            { user_uid: "copies", position: 0, time: 200, rating: 15000 },
        ]);
    });
});

describe("validation and transactions", () => {
    it.each([
        ["empty uid", (made: Record<string, unknown>) => (made.uid = "")],
        ["uid type", (made: Record<string, unknown>) => (made.uid = 1)],
        ["settings", (made: Record<string, unknown>) => (made.settings = null)],
        ["data", (made: Record<string, unknown>) => (made.data = null)],
        ["inGame", (made: Record<string, unknown>) => (made.inGame = null)],
        ["divingFish", (made: Record<string, unknown>) => (made.divingFish = null)],
        [
            "enabled",
            (made: Record<string, unknown>) =>
                ((made.inGame as Record<string, unknown>).enabled = 1),
        ],
        [
            "fast update",
            (made: Record<string, unknown>) =>
                ((made.inGame as Record<string, unknown>).useFastUpdate = null),
        ],
        [
            "manual update",
            (made: Record<string, unknown>) =>
                ((made.settings as Record<string, unknown>).manuallyUpdate = "false"),
        ],
        [
            "import token",
            (made: Record<string, unknown>) =>
                ((made.divingFish as Record<string, unknown>).importToken = "fake-import-token"),
        ],
        ["non-object lxns", (made: Record<string, unknown>) => (made.lxns = "snow")],
        ["lxns auth", (made: Record<string, unknown>) => (made.lxns = { auth: "fake-token" })],
    ])("rejects an invalid %s before changing the store", (_name, change) => {
        const store = open();
        replaceUsers(store, [user("old")], []);
        const invalid = user("new") as unknown as Record<string, unknown>;
        change(invalid);

        // The message shows the repository rejected it, not one of the table checks behind it.
        expect(() => saveUser(store, invalid as unknown as User)).toThrow("invalid stored user");
        expect(readUsers(store)).toEqual([user("old")]);
    });

    it("rejects an empty import token too", () => {
        const store = open();
        const invalid = user("new");
        (invalid.divingFish as Record<string, unknown>).importToken = "";

        expect(() => saveUser(store, invalid)).toThrow("invalid stored user");
        expect(readUsers(store)).toEqual([]);
    });

    it("rejects a user that JSON cannot write before changing the store", () => {
        const store = open();
        replaceUsers(store, [user("old")], []);

        expect(() => saveUser(store, user("new", { big: BigInt(1) }))).toThrow(
            "invalid stored user"
        );
        expect(readUsers(store)).toEqual([user("old")]);
    });

    it("keeps the null import token the web app writes for a user without one", () => {
        const store = open();
        const withNull = user("web");
        (withNull.divingFish as Record<string, unknown>).importToken = null;
        const withoutMember = user("bare");
        delete (withoutMember.divingFish as Record<string, unknown>).importToken;

        replaceUsers(store, [withNull, withoutMember], []);

        const [readNull, readBare] = readUsers(store);
        expect(readNull).toEqual(withNull);
        expect(Object.hasOwn(readNull.divingFish, "importToken")).toBe(true);
        expect(readBare).toEqual(withoutMember);
        expect(Object.hasOwn(readBare.divingFish, "importToken")).toBe(false);
    });

    it("rejects duplicate user uids before replacing anything", () => {
        const store = open();
        replaceUsers(store, [user("old")], []);
        expect(() => replaceUsers(store, [user("same"), user("same")], [])).toThrow(
            "duplicate user uid"
        );
        expect(readUsers(store)).toEqual([user("old")]);
    });

    it.each([
        ["schemaVersion", 2],
        ["id", null],
        ["generationId", 1],
        ["batchId", 1],
        ["userUid", 1],
        ["chartKey", 1],
        ["observedAt", Number.NaN],
        ["sequence", 1.5],
        ["changedMask", 2 ** 53],
        ["state.dxScore", 2 ** 53],
        ["state.playCount", 1.5],
        ["state.achievements", Number.POSITIVE_INFINITY],
        ["state.fc", 1],
        ["state.fs", null],
    ])("rejects an event with invalid %s before changing the store", (path, value) => {
        const store = open();
        replaceUsers(store, [user("one")], [event("old")]);
        const invalid = structuredClone(event("new")) as unknown as Record<string, unknown>;
        const [parent, child] = path.split(".");
        if (child) (invalid[parent] as Record<string, unknown>)[child] = value;
        else invalid[parent] = value;

        expect(() => appendScoreEvents(store, [invalid as unknown as ScoreHistoryEventV1])).toThrow(
            "invalid stored score event"
        );
        expect(readScoreEvents(store).map(item => item.id)).toEqual(["old"]);
    });

    it("rejects an invalid event in a replacement before changing the store", () => {
        const store = open();
        replaceUsers(store, [user("old")], [event("old", "old")]);
        const invalid = { ...event("new", "new"), sequence: 1.5 };

        expect(() => replaceUsers(store, [user("new")], [invalid])).toThrow(
            "invalid stored score event"
        );
        expect(readUsers(store)).toEqual([user("old")]);
        expect(readScoreEvents(store).map(item => item.id)).toEqual(["old"]);
    });

    it("rolls back a replacement that hits a duplicate event id halfway", () => {
        const store = open();
        replaceUsers(store, [user("old")], [event("old", "old")]);

        expect(() =>
            replaceUsers(
                store,
                [user("new")],
                [event("duplicate", "new"), event("duplicate", "new")]
            )
        ).toThrow();
        expect(readUsers(store)).toEqual([user("old")]);
        expect(readScoreEvents(store).map(item => item.id)).toEqual(["old"]);
    });

    it("leaves an append atomic when a later id is duplicated", () => {
        const store = open();
        replaceUsers(store, [user("one")], [event("old")]);
        expect(() => appendScoreEvents(store, [event("new"), event("old")])).toThrow();
        expect(readScoreEvents(store).map(item => item.id)).toEqual(["old"]);
    });

    it("lets table checks and foreign keys reject source, kind, and unknown users atomically", () => {
        const store = open();
        replaceUsers(store, [user("one")], [event("old")]);
        const invalidSource = { ...event("bad-source"), source: "made-up" };
        const invalidKind = { ...event("bad-kind"), kind: "made-up" };

        expect(() => appendScoreEvents(store, [invalidSource as ScoreHistoryEventV1])).toThrow();
        expect(() => appendScoreEvents(store, [invalidKind as ScoreHistoryEventV1])).toThrow();
        expect(() => appendScoreEvents(store, [event("orphan", "missing")])).toThrow();
        expect(readScoreEvents(store).map(item => item.id)).toEqual(["old"]);
    });
});

describe("saving, removing, and reordering", () => {
    it("updates in place, preserves events, and appends a new user", () => {
        const store = open();
        replaceUsers(store, [user("one"), user("two")], [event("history")]);
        const changed = user("one", { name: "Changed" });
        saveUser(store, changed);
        saveUser(store, user("three"));

        expect(readUsers(store)).toEqual([changed, user("two"), user("three")]);
        expect(listUsers(store).map(item => item.index)).toEqual([0, 1, 2]);
        expect(readScoreEvents(store).map(item => item.id)).toEqual(["history"]);
    });

    it("replaces every populated copy for one user without touching events or other users", () => {
        const store = open();
        seedCatalog(store);
        const oldScore = scoreRecord(8, 0);
        const removedScore = { ...scoreRecord(9, 1), achievements: 98 };
        const other = user("other", {
            detailed: { other: scoreRecord(8, 0) },
            b50: { sd: [scoreRecord(8, 0)], dx: [] },
            items: [[{ itemKind: 1, itemId: 2, stock: 3, isValid: true }]],
            characters: [{ characterId: 4, point: 5 }],
            ratingHistory: [{ time: 6, rating: 7 }],
        });
        replaceUsers(
            store,
            [
                user("one", {
                    detailed: { keep: oldScore, remove: removedScore },
                    b50: { sd: [oldScore, removedScore], dx: [] },
                    items: [[{ itemKind: 10 }, { itemKind: 11 }]],
                    characters: [{ characterId: 12 }, { characterId: 13 }],
                    ratingHistory: [
                        { time: 14, rating: 15 },
                        { time: 16, rating: 17 },
                    ],
                }),
                other,
            ],
            [event("one-event"), event("other-event", "other")]
        );
        const copyTables = [
            "scores",
            "b50_snapshot",
            "user_items",
            "user_characters",
            "rating_history",
        ];
        const otherBefore = Object.fromEntries(
            ["users", ...copyTables].map(table => [
                table,
                rows(store, table).filter(row =>
                    table === "users" ? row.uid === "other" : row.user_uid === "other"
                ),
            ])
        );
        const changedScore = { ...scoreRecord(8, 0), title: "Changed", achievements: 99 };
        const changed = user("one", {
            detailed: { keep: changedScore },
            b50: { sd: [], dx: [changedScore] },
            items: [[{ itemKind: 20, itemId: 21, stock: 22, isValid: false }]],
            characters: [
                {
                    characterId: 23,
                    point: 24,
                    useCount: 25,
                    level: 26,
                    nextAwake: 27,
                    nextAwakePercent: 28.5,
                    awakening: 29,
                },
            ],
            ratingHistory: [{ time: 30, rating: 31 }],
        });

        saveUser(store, changed);

        expect(readUser(store, "one")).toEqual(changed);
        expect(rows(store, "scores").filter(row => row.user_uid === "one")).toEqual([
            {
                user_uid: "one",
                record_key: "keep",
                chart_key: "8-0",
                song_id: 8,
                type: "SD",
                title: "Changed",
                level: "13?",
                level_index: 0,
                level_label: "Utage",
                ds: 13,
                achievements: 99,
                dx_score: 1000,
                fc: ComboStatus.None,
                fs: SyncStatus.None,
                rate: RankRate.sssp,
                ra: 0,
                play_count: null,
                last_changed_at: null,
            },
        ]);
        expect(rows(store, "b50_snapshot").filter(row => row.user_uid === "one")).toEqual([
            {
                user_uid: "one",
                section: "dx",
                position: 0,
                record_key: "8-0",
                chart_key: "8-0",
                song_id: 8,
                type: "SD",
                title: "Changed",
                level: "13?",
                level_index: 0,
                level_label: "Utage",
                ds: 13,
                achievements: 99,
                dx_score: 1000,
                fc: ComboStatus.None,
                fs: SyncStatus.None,
                rate: RankRate.sssp,
                ra: 0,
                play_count: null,
                last_changed_at: null,
            },
        ]);
        expect(rows(store, "user_items").filter(row => row.user_uid === "one")).toEqual([
            {
                user_uid: "one",
                list_index: 0,
                position: 0,
                item_kind: 20,
                item_id: 21,
                stock: 22,
                is_valid: 0,
            },
        ]);
        expect(rows(store, "user_characters").filter(row => row.user_uid === "one")).toEqual([
            {
                user_uid: "one",
                position: 0,
                character_id: 23,
                point: 24,
                use_count: 25,
                level: 26,
                next_awake: 27,
                next_awake_percent: 28.5,
                awakening: 29,
            },
        ]);
        expect(rows(store, "rating_history").filter(row => row.user_uid === "one")).toEqual([
            { user_uid: "one", position: 0, time: 30, rating: 31 },
        ]);
        expect(readScoreEvents(store).map(item => item.id)).toEqual(["one-event", "other-event"]);
        expect(
            Object.fromEntries(
                ["users", ...copyTables].map(table => [
                    table,
                    rows(store, table).filter(row =>
                        table === "users" ? row.uid === "other" : row.user_uid === "other"
                    ),
                ])
            )
        ).toEqual(otherBefore);
    });

    it("closes position gaps after removing first, middle, and last users", () => {
        const store = open();
        replaceUsers(
            store,
            ["a", "b", "c", "d", "e"].map(uid => user(uid)),
            []
        );
        expect(removeUser(store, "a")).toBe(true);
        expect(removeUser(store, "c")).toBe(true);
        expect(removeUser(store, "e")).toBe(true);
        expect(removeUser(store, "missing")).toBe(false);
        expect(listUsers(store).map(item => [item.index, item.uid])).toEqual([
            [0, "b"],
            [1, "d"],
        ]);
    });

    it("makes a user default and preserves everybody else's order", () => {
        const store = open();
        replaceUsers(
            store,
            ["a", "b", "c", "d"].map(uid => user(uid)),
            []
        );
        makeDefaultUser(store, "c");
        expect(listUsers(store).map(item => item.uid)).toEqual(["c", "a", "b", "d"]);
        expect(listUsers(store).map(item => item.index)).toEqual([0, 1, 2, 3]);
        expect(() => makeDefaultUser(store, "missing")).toThrow(Error);
    });

    it("cascades a removed user's copies and events", () => {
        const store = open();
        replaceUsers(
            store,
            [user("one", { detailed: { score: scoreRecord(8, 0) } }), user("two")],
            [event("one-event"), event("two-event", "two")]
        );
        removeUser(store, "one");
        expect(rows(store, "scores")).toEqual([]);
        expect(readScoreEvents(store).map(item => item.id)).toEqual(["two-event"]);
    });
});

function scoreRecord(songId: number, levelIndex: number): DivingFishFullRecord {
    return {
        song_id: songId,
        type: "SD",
        title: "Made",
        level: "13?",
        level_index: levelIndex,
        level_label: "Utage",
        ds: 13,
        achievements: 100,
        dxScore: 1000,
        fc: ComboStatus.None,
        fs: SyncStatus.None,
        rate: RankRate.sssp,
        ra: 0,
    };
}

function madeUtageMusic(): SavedMusicList {
    const music: Music = {
        id: 110001,
        info: {
            id: 110001,
            title: "Made banquet",
            artist: "Made",
            genre: MusicGenre["舞萌"],
            bpm: 120,
            from: MusicOrigin.maimai,
            isNew: true,
            type: ChartType.Deluxe,
        },
        charts: [],
    };
    const charts: Chart[] = [0, 1, 2].map(index => ({
        id: 11000110 + index,
        info: {
            notes: [0, 0, 0, 0],
            charter: "",
            level: "13?",
            grade: 10,
            constant: 13,
            deluxeScoreMax: 0,
        },
        music,
    }));
    music.charts = charts;
    return {
        musicList: { 110001: music },
        chartList: Object.fromEntries(charts.map(chart => [chart.id, chart])),
    };
}

function madeMixedMusic(): SavedMusicList {
    const result = madeUtageMusic();
    const music = result.musicList[110001];
    music.charts = music.charts.slice(0, 2);
    music.charts[0].info.grade = 3;
    return {
        musicList: result.musicList,
        chartList: Object.fromEntries(music.charts.map(chart => [chart.id, chart])),
    };
}

describe("catalog chart keys", () => {
    it("matches exact plain-object records with unrelated unusual fields and skips unsafe types", () => {
        const store = open();
        seedCatalog(store);
        const unusual = {
            song_id: 8,
            type: "SD",
            level: 1,
            level_index: 0,
            ds: "1.2",
        };
        const unsafe = { ...unusual, type: 1 };

        expect(() =>
            replaceUsers(store, [user("one", { detailed: { unsafe, unusual } })], [])
        ).not.toThrow();
        expect(rows(store, "scores")).toEqual([
            expect.objectContaining({
                record_key: "unsafe",
                chart_key: null,
                type: null,
                level: null,
                ds: null,
            }),
            expect.objectContaining({
                record_key: "unusual",
                chart_key: "8-0",
                type: "SD",
                level: null,
                ds: null,
            }),
        ]);
    });

    it("copies and matches a B50 entry whose difficulty is text, as the web app does", () => {
        const store = open();
        seedCatalog(store);
        const entry = { ...scoreRecord(8, 0), level_index: "0" };
        replaceUsers(store, [user("one", { b50: { sd: [entry], dx: [] } })], []);

        expect(rows(store, "b50_snapshot")).toEqual([
            expect.objectContaining({
                section: "sd",
                position: 0,
                record_key: "8-0",
                chart_key: "8-0",
                level_index: null,
            }),
        ]);
    });

    it("keeps a record core cannot convert out of matching without failing", () => {
        const store = open();
        seedCatalog(store);
        const unconvertible = JSON.parse('{"toString": 1}') as unknown;
        const detailed = {
            badSong: { ...scoreRecord(8, 0), song_id: unconvertible },
            badLevel: { ...scoreRecord(8, 0), level_index: unconvertible },
            badDs: { ...scoreRecord(8, 0), ds: unconvertible },
            good: scoreRecord(8, 0),
        };
        const b50 = {
            sd: [
                { ...scoreRecord(8, 0), song_id: unconvertible },
                { ...scoreRecord(8, 0), level_index: unconvertible },
                { ...scoreRecord(8, 0), type: 1 },
                { ...scoreRecord(8, 0), ds: unconvertible },
                scoreRecord(8, 0),
            ],
            dx: [],
        };

        expect(() => replaceUsers(store, [user("one", { detailed, b50 })], [])).not.toThrow();
        expect(
            rows(store, "scores").map(row => [row.record_key, row.chart_key, row.song_id])
        ).toEqual([
            ["badSong", null, null],
            ["badLevel", null, 8],
            ["badDs", null, 8],
            ["good", "8-0", 8],
        ]);
        // Only an entry without a usable song id or difficulty is left out of the snapshot; one that
        // core cannot look up for another reason keeps its row, without a chart key.
        expect(rows(store, "b50_snapshot").map(row => [row.position, row.chart_key])).toEqual([
            [2, null],
            [3, null],
            [4, "8-0"],
        ]);
    });

    it("matches records under the keys __proto__ and the empty string like any other", () => {
        const store = open();
        seedCatalog(store);
        const record = JSON.stringify(scoreRecord(8, 0));
        replaceUsers(
            store,
            [
                user("proto", {
                    detailed: JSON.parse(`{"__proto__": ${record}, "later": ${record}}`) as unknown,
                }),
                user("empty", {
                    detailed: JSON.parse(`{"": ${record}, "later": ${record}}`) as unknown,
                }),
            ],
            []
        );

        expect(
            rows(store, "scores").map(row => [row.user_uid, row.record_key, row.chart_key])
        ).toEqual([
            ["proto", "__proto__", "8-0"],
            ["proto", "later", null],
            ["empty", "", "8-0"],
            ["empty", "later", null],
        ]);
    });

    it("matches a DX record by its SaltNet music id in scores and the B50", () => {
        const store = open();
        seedCatalog(store);
        const deluxe = { ...scoreRecord(30, 0), type: "DX" };
        replaceUsers(
            store,
            [user("one", { detailed: { deluxe }, b50: { sd: [], dx: [deluxe] } })],
            []
        );

        expect(rows(store, "scores")[0].chart_key).toBe("10030-0");
        expect(rows(store, "b50_snapshot")[0]).toEqual(
            expect.objectContaining({ record_key: "10030-0", chart_key: "10030-0" })
        );
    });

    it("ignores values that are not plain objects and copies shared records per key", () => {
        const shared = { ...scoreRecord(110001, 3), type: "DX" };

        expect([
            ...chartKeysForRecords({ nothing: null, list: [], banquet: shared }, madeUtageMusic()),
        ]).toEqual([["banquet", "110001-10"]]);
        expect([
            ...chartKeysForRecords({ first: shared, second: shared }, madeUtageMusic()),
        ]).toEqual([["first", "110001-10"]]);
        expect([...chartKeysForRecords({ "": shared }, madeUtageMusic())]).toEqual([
            ["", "110001-10"],
        ]);
    });

    it("reserves exact matches even when the banquet chart comes first in the catalog", () => {
        const music = madeMixedMusic();
        music.musicList[110001].charts.reverse();
        const exact = { ...scoreRecord(110001, 3), type: "DX" };
        const banquet = { ...scoreRecord(110001, 4), type: "DX" };

        expect([...chartKeysForRecords({ exact, banquet }, music)]).toEqual([
            ["exact", "110001-3"],
            ["banquet", "110001-10"],
        ]);
    });

    it("lets core's candidate order pick among B50 banquet rows before snapshot order", () => {
        const higher = { ...scoreRecord(110001, 4), type: "DX" };
        const lower = { ...scoreRecord(110001, 3), type: "DX" };

        expect([
            ...chartKeysForRecords({ "sd-0": higher, "dx-0": lower }, madeUtageMusic()),
        ]).toEqual([["dx-0", "110001-10"]]);
        expect([
            ...chartKeysForRecords({ "sd-0": lower, "dx-0": { ...lower } }, madeUtageMusic()),
        ]).toEqual([["sd-0", "110001-10"]]);

        const snapshotKeys = (sd: unknown[], dx: unknown[]) =>
            buildUserRows(user("one", { b50: { sd, dx } }), 0, madeUtageMusic()).b50.map(row => [
                row.section,
                row.position,
                row.chartKey,
            ]);
        expect(snapshotKeys([higher], [lower])).toEqual([
            ["sd", 0, null],
            ["dx", 0, "110001-10"],
        ]);
        expect(snapshotKeys([lower], [{ ...lower }])).toEqual([
            ["sd", 0, "110001-10"],
            ["dx", 0, null],
        ]);
    });

    it("reserves every exact match before assigning the remaining banquet records", () => {
        const exact = scoreRecord(110001, 3);
        exact.type = "DX";
        const banquet = scoreRecord(110001, 4);
        banquet.type = "DX";

        expect([...chartKeysForRecords({ exact, banquet }, madeMixedMusic())]).toEqual([
            ["exact", "110001-3"],
            ["banquet", "110001-10"],
        ]);
    });

    it("assigns exact records first, then utage siblings once each, with no last fallback", () => {
        const exact = scoreRecord(110001, 10);
        exact.type = "DX";
        const first = scoreRecord(110001, 3);
        first.type = "DX";
        const second = scoreRecord(110001, 4);
        second.type = "DX";
        const keys = chartKeysForRecords({ exact, first, second }, madeUtageMusic());

        expect(keys.get("exact")).toBe("110001-10");
        expect(keys.has("first")).toBe(false);
        expect(keys.has("second")).toBe(false);
        expect(new Set(keys.values()).size).toBe(keys.size);
    });

    it("uses catalog order and never assigns two records to the same banquet chart key", () => {
        const first = scoreRecord(110001, 3);
        first.type = "DX";
        const second = scoreRecord(110001, 4);
        second.type = "DX";
        const keys = chartKeysForRecords({ first, second }, madeUtageMusic());

        expect([...keys.entries()]).toEqual([["first", "110001-10"]]);
    });

    it("assigns a duplicate B50 chart only to the first row within one section", () => {
        const store = open();
        seedCatalog(store);
        const first = scoreRecord(8, 0);
        const duplicate = { ...first, achievements: 99 };
        replaceUsers(store, [user("one", { b50: { sd: [first, duplicate], dx: [] } })], []);

        const snapshot = rows(store, "b50_snapshot");
        expect(snapshot.map(row => row.chart_key)).toEqual(["8-0", null]);
        expect(snapshot.map(row => row.achievements)).toEqual([100, 99]);
    });

    it("assigns a duplicate B50 chart only to the earlier SD row across sections", () => {
        const store = open();
        seedCatalog(store);
        const first = scoreRecord(8, 0);
        const duplicate = { ...first, achievements: 99 };
        replaceUsers(store, [user("one", { b50: { sd: [first], dx: [duplicate] } })], []);

        const snapshot = rows(store, "b50_snapshot");
        expect(snapshot.map(row => [row.section, row.chart_key])).toEqual([
            ["sd", "8-0"],
            ["dx", null],
        ]);
    });

    it("assigns shared and distinct equal detailed records by key order across recomputation", () => {
        const store = open();
        seedCatalog(store);
        const shared = scoreRecord(8, 0);
        saveUser(store, user("shared", { detailed: { first: shared, second: shared } }));
        saveUser(
            store,
            user("distinct", {
                detailed: { first: scoreRecord(8, 0), second: scoreRecord(8, 0) },
            })
        );
        const selectedKeys = () =>
            store.db
                .prepare(
                    `SELECT user_uid, record_key, chart_key FROM scores
                     ORDER BY user_uid, record_key`
                )
                .all();
        const expected = [
            { user_uid: "distinct", record_key: "first", chart_key: "8-0" },
            { user_uid: "distinct", record_key: "second", chart_key: null },
            { user_uid: "shared", record_key: "first", chart_key: "8-0" },
            { user_uid: "shared", record_key: "second", chart_key: null },
        ];

        expect(selectedKeys()).toEqual(expected);
        seedCatalog(store);
        expect(selectedKeys()).toEqual(expected);
    });

    it("stores NULL without a catalog and recomputes after catalog replacement", () => {
        const store = open();
        replaceUsers(store, [user("one", { detailed: { exact: scoreRecord(8, 0) } })], []);
        expect(rows(store, "scores")[0].chart_key).toBeNull();

        seedCatalog(store);
        expect(rows(store, "scores")[0].chart_key).toBe("8-0");

        const withoutEight = getFixtureSaltMetaCompacted();
        withoutEight.musics = withoutEight.musics.filter(music => music[0] !== 8);
        replaceMusic(store, buildSaltMetaMusicList(withoutEight, { mergeDuplicates: true }), {
            fetchedAt: 2000,
            upstreamVersion: "2",
        });
        expect(rows(store, "scores")[0].chart_key).toBeNull();
    });

    it("recomputes detailed and B50 chart keys for every user when music is added or removed", () => {
        const store = open();
        const record = () => scoreRecord(8, 0);
        replaceUsers(
            store,
            ["one", "two"].map(uid =>
                user(uid, {
                    detailed: { score: record() },
                    b50: { sd: [record()], dx: [] },
                })
            ),
            []
        );
        expect(rows(store, "scores").map(row => row.chart_key)).toEqual([null, null]);
        expect(rows(store, "b50_snapshot").map(row => row.chart_key)).toEqual([null, null]);

        seedCatalog(store);
        expect(rows(store, "scores").map(row => row.chart_key)).toEqual(["8-0", "8-0"]);
        expect(rows(store, "b50_snapshot").map(row => row.chart_key)).toEqual(["8-0", "8-0"]);

        const withoutEight = getFixtureSaltMetaCompacted();
        withoutEight.musics = withoutEight.musics.filter(music => music[0] !== 8);
        replaceMusic(store, buildSaltMetaMusicList(withoutEight, { mergeDuplicates: true }), {
            fetchedAt: 2000,
            upstreamVersion: "2",
        });
        expect(rows(store, "scores").map(row => row.chart_key)).toEqual([null, null]);
        expect(rows(store, "b50_snapshot").map(row => row.chart_key)).toEqual([null, null]);
    });

    it("matches exact detailed and B50 records on the fixed SaltMeta fixture", () => {
        const store = open();
        seedCatalog(store);
        const record = scoreRecord(8, 0);
        replaceUsers(
            store,
            [user("one", { detailed: { arbitrary: record }, b50: { sd: [record], dx: [] } })],
            []
        );
        expect(rows(store, "scores")[0].chart_key).toBe("8-0");
        expect(rows(store, "b50_snapshot")[0].chart_key).toBe("8-0");
    });
});

describe("score event reading", () => {
    it("reads one user's or everyone's events in public-view order", () => {
        const store = open();
        replaceUsers(
            store,
            [user("second"), user("first")],
            [
                { ...event("z", "first", 1), sequence: 1 },
                event("b", "second", 2),
                event("a", "second", 2),
                event("early", "second", 1),
            ]
        );
        expect(readScoreEvents(store).map(item => item.id)).toEqual(["early", "a", "b", "z"]);
        expect(readScoreEvents(store, "first").map(item => item.id)).toEqual(["z"]);
        expect(readScoreEvents(store)[0]).toEqual(event("early", "second", 1));
    });
});
