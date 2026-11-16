import type { DivingFishFullRecord } from "@core/integrations/diving-fish/type";
import type { ScoreHistoryEventV1 } from "@core/user/scoreHistory/type";
import type { User } from "@core/user/type";
import { CollectionKind } from "@core/collection/type";
import { ComboStatus, RankRate, SyncStatus } from "@core/mai/types";
import { describe, expect, it } from "vitest";
import { openStore } from "../../src/store/store";
import { readScoreEvents, readUsers, replaceUsers } from "../../src/users/repository";
import { splitCommandLine } from "../../src/util/shell";
import { formatLocalTime } from "../../src/util/time";
import { commandIn, NOW } from "../commandRun";
import { useTempHome } from "../tempHome";
import { useTimeZone } from "../zone";

useTimeZone("Asia/Shanghai");

const makeHome = useTempHome();

function score(title = "Made score"): DivingFishFullRecord {
    return {
        song_id: 8,
        type: "SD",
        title,
        level: "1",
        level_index: 0,
        level_label: "Basic",
        ds: 1,
        achievements: 100,
        dxScore: 1000,
        fc: ComboStatus.None,
        fs: SyncStatus.None,
        rate: RankRate.sssp,
        ra: 10,
    };
}

interface UserOptions {
    remark?: string | null;
    playerName?: string | null;
    updatedAt?: number | null;
    rating?: number | null;
    manualUpdate?: boolean;
    lxns?: false | { id: number | null; name: string | null };
    withRows?: boolean;
    inGame?: { enabled?: boolean; useFastUpdate?: boolean };
}

function madeUser(uid: string, options: UserOptions = {}): User {
    const record = score();
    return {
        uid,
        remark: options.remark ?? null,
        divingFish: { name: `fish-${uid}`, importToken: null },
        ...(options.lxns === false
            ? {}
            : {
                  lxns: {
                      auth: null,
                      id: options.lxns?.id ?? 10,
                      name: options.lxns?.name ?? `snow-${uid}`,
                  },
              }),
        inGame: {
            id: 100,
            name: `game-${uid}`,
            enabled: options.inGame?.enabled ?? true,
            useFastUpdate: options.inGame?.useFastUpdate ?? true,
        },
        settings: { manuallyUpdate: options.manualUpdate ?? false },
        data: {
            updateTime: options.updatedAt ?? null,
            name: options.playerName ?? null,
            rating: options.rating ?? null,
            ...(options.withRows
                ? {
                      detailed: { one: record },
                      b50: { sd: [record], dx: [] },
                      items: [
                          [
                              {
                                  itemKind: CollectionKind.Plate,
                                  itemId: 2,
                                  stock: 1,
                                  isValid: true,
                              },
                          ],
                      ],
                      characters: [
                          {
                              characterId: 3,
                              point: 4,
                              useCount: 5,
                              level: 6,
                              nextAwake: 7,
                              nextAwakePercent: 8,
                              awakening: 9,
                          },
                      ],
                      ratingHistory: [{ time: 4, rating: 5 }],
                  }
                : {}),
        },
    };
}

function event(uid: string, id = `event-${uid}`): ScoreHistoryEventV1 {
    return {
        id,
        schemaVersion: 1,
        generationId: "generation",
        batchId: "batch",
        userUid: uid,
        chartKey: "8-0",
        observedAt: 100,
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

function seed(
    paths: ReturnType<typeof makeHome>,
    users: readonly User[],
    events: readonly ScoreHistoryEventV1[] = []
): void {
    const store = openStore(paths);
    replaceUsers(store, users, events);
    store.close();
}

function readStored(paths: ReturnType<typeof makeHome>): User[] {
    const store = openStore(paths);
    const users = readUsers(store);
    store.close();
    return users;
}

interface ConfirmationError {
    code: string;
    fix: string;
    preview: Record<string, unknown>;
    confirmationCode: string;
    codeRejected: boolean;
}

describe("user list and show", () => {
    it("prints every row field, nulls, no-lxns, paging, and counts", async () => {
        const paths = makeHome();
        const updatedAt = NOW.getTime() - 1000;
        seed(
            paths,
            [
                madeUser("one", {
                    remark: "Main",
                    playerName: "PLAYER",
                    updatedAt,
                    rating: 15000,
                    manualUpdate: true,
                    withRows: true,
                }),
                madeUser("two", { remark: "Second", lxns: false }),
            ],
            [event("one")]
        );

        const listed = await commandIn(paths, "user", ["list", "--limit", "1", "--offset", "1"]);
        expect(listed.code).toBe(0);
        expect(listed.json.data.items).toEqual([
            {
                index: 1,
                uid: "two",
                name: "Second",
                remark: "Second",
                playerName: null,
                rating: null,
                scoresUpdatedAt: null,
                manualUpdate: false,
                inGame: { id: 100, name: "game-two", enabled: true, fastUpdate: true },
                lxns: null,
                divingFish: { name: "fish-two" },
            },
        ]);
        expect(listed.json.meta.page).toEqual({ total: 2, offset: 1, limit: 1, nextOffset: null });

        const shown = await commandIn(paths, "user", ["show"]);
        expect(shown.code).toBe(0);
        expect(shown.json.data).toEqual({
            index: 0,
            uid: "one",
            name: "Main",
            remark: "Main",
            playerName: "PLAYER",
            rating: 15000,
            scoresUpdatedAt: formatLocalTime(new Date(updatedAt)),
            manualUpdate: true,
            inGame: { id: 100, name: "game-one", enabled: true, fastUpdate: true },
            lxns: { id: 10, name: "snow-one" },
            divingFish: { name: "fish-one" },
            counts: {
                scores: 1,
                b50: 1,
                items: 1,
                characters: 1,
                ratingHistory: 1,
                scoreEvents: 1,
            },
        });
    });

    it("resolves index, uid, exact and folded names and reports every reference failure", async () => {
        const paths = makeHome();
        seed(paths, [
            madeUser("uid-one", { remark: "Alpha" }),
            madeUser("uid-two", { remark: "ＡＬＰＨＡ" }),
        ]);

        expect((await commandIn(paths, "user", ["show", "1"])).json.data.uid).toBe("uid-two");
        expect((await commandIn(paths, "user", ["show", "uid-one"])).json.data.uid).toBe("uid-one");
        expect((await commandIn(paths, "user", ["show", "Alpha"])).json.data.uid).toBe("uid-one");

        const ambiguous = await commandIn(paths, "user", ["show", "alpha"]);
        expect(ambiguous.code).toBe(3);
        expect(ambiguous.json.error).toMatchObject({
            code: "AMBIGUOUS_REF",
            candidates: [
                { ref: "uid-one", title: "Alpha" },
                { ref: "uid-two", title: "ＡＬＰＨＡ" },
            ],
        });

        const missing = await commandIn(paths, "user", ["show", "Alphx"]);
        expect(missing.code).toBe(3);
        expect(missing.json.error.code).toBe("NOT_FOUND");
        expect(missing.json.error.candidates?.[0]).toMatchObject({ ref: "uid-one" });

        const empty = await commandIn(makeHome(), "user", ["show"]);
        expect(empty.code).toBe(4);
        expect(empty.json.error.code).toBe("NO_USER");
        const namedEmpty = await commandIn(makeHome(), "user", ["show", "someone"]);
        expect(namedEmpty.code).toBe(3);
        expect(namedEmpty.json.error.code).toBe("NOT_FOUND");
    });

    it("prints each user's own inGame.enabled and inGame.fastUpdate flags", async () => {
        const paths = makeHome();
        const user1 = madeUser("one", {
            inGame: { enabled: true, useFastUpdate: false },
        });
        const user2 = madeUser("two", {
            inGame: { enabled: false, useFastUpdate: true },
        });
        seed(paths, [user1, user2]);

        const listed = await commandIn(paths, "user", ["list"]);
        expect(listed.code).toBe(0);
        const items = listed.json.data.items;
        expect(items).toHaveLength(2);
        expect(items[0].inGame.enabled).toBe(true);
        expect(items[0].inGame.fastUpdate).toBe(false);
        expect(items[1].inGame.enabled).toBe(false);
        expect(items[1].inGame.fastUpdate).toBe(true);
    });

    it("prints exact counts per table in user show and user remove preview", async () => {
        const paths = makeHome();
        const user = madeUser("one");
        user.data = {
            ...user.data,
            detailed: {
                one: score("Detailed score"),
            },
            b50: {
                sd: [score("B50 1"), { ...score("B50 2"), song_id: 9 }],
                dx: [],
            },
            items: [
                [
                    {
                        itemKind: CollectionKind.Plate,
                        itemId: 1,
                        stock: 1,
                        isValid: true,
                    },
                    {
                        itemKind: CollectionKind.Plate,
                        itemId: 2,
                        stock: 1,
                        isValid: true,
                    },
                    {
                        itemKind: CollectionKind.Plate,
                        itemId: 3,
                        stock: 1,
                        isValid: true,
                    },
                ],
            ],
            characters: [
                {
                    characterId: 1,
                    point: 1,
                    useCount: 1,
                    level: 1,
                    nextAwake: 1,
                    nextAwakePercent: 1,
                    awakening: 1,
                },
                {
                    characterId: 2,
                    point: 2,
                    useCount: 2,
                    level: 2,
                    nextAwake: 2,
                    nextAwakePercent: 2,
                    awakening: 2,
                },
                {
                    characterId: 3,
                    point: 3,
                    useCount: 3,
                    level: 3,
                    nextAwake: 3,
                    nextAwakePercent: 3,
                    awakening: 3,
                },
                {
                    characterId: 4,
                    point: 4,
                    useCount: 4,
                    level: 4,
                    nextAwake: 4,
                    nextAwakePercent: 4,
                    awakening: 4,
                },
            ],
            ratingHistory: [
                { time: 100, rating: 1000 },
                { time: 200, rating: 2000 },
                { time: 300, rating: 3000 },
                { time: 400, rating: 4000 },
                { time: 500, rating: 5000 },
            ],
        };

        const events = [
            event("one", "ev-1"),
            event("one", "ev-2"),
            event("one", "ev-3"),
            event("one", "ev-4"),
            event("one", "ev-5"),
            event("one", "ev-6"),
        ];

        seed(paths, [user], events);

        const expectedCounts = {
            scores: 1,
            b50: 2,
            items: 3,
            characters: 4,
            ratingHistory: 5,
            scoreEvents: 6,
        };

        const shown = await commandIn(paths, "user", ["show", "one"]);
        expect(shown.code).toBe(0);
        expect(shown.json.data.counts).toEqual(expectedCounts);

        const preview = await commandIn(paths, "user", ["remove", "one"]);
        expect(preview.code).toBe(6);
        const error = preview.json.error as unknown as ConfirmationError;
        expect(error.preview.counts).toEqual(expectedCounts);
    });
});

describe("user add and edit", () => {
    it("adds the same empty user shape as the web app and then lists it", async () => {
        const paths = makeHome();
        const added = await commandIn(paths, "user", ["add", "--remark", "New", "--manual-update"]);
        expect(added.code).toBe(0);
        expect(added.json.data).toMatchObject({
            index: 0,
            name: "New",
            remark: "New",
            playerName: null,
            rating: null,
            scoresUpdatedAt: null,
            manualUpdate: true,
            inGame: { id: null, name: null, enabled: false, fastUpdate: false },
            lxns: { id: null, name: null },
            divingFish: { name: null },
        });
        expect(added.json.data.uid).toMatch(/^[0-9a-z-]+$/i);
        expect(readStored(paths)).toEqual([
            {
                uid: added.json.data.uid,
                remark: "New",
                divingFish: { name: null, importToken: null },
                lxns: { auth: null, name: null, id: null },
                inGame: { id: null, enabled: false, useFastUpdate: false },
                settings: { manuallyUpdate: true },
                data: { updateTime: null, name: null, rating: null },
            },
        ]);
        expect((await commandIn(paths, "user", ["list"])).json.data.items).toEqual([
            added.json.data,
        ]);
    });

    it("supports every edit option and preserves every other raw field", async () => {
        const paths = makeHome();
        const original = madeUser("one", { remark: "Before", withRows: true });
        (original as User & { future?: unknown }).future = { preserved: true };
        seed(paths, [original]);

        expect((await commandIn(paths, "user", ["edit", "one", "--remark", "After"])).code).toBe(0);
        expect(readStored(paths)[0]).toEqual({ ...original, remark: "After" });

        expect((await commandIn(paths, "user", ["edit", "one", "--clear-remark"])).code).toBe(0);
        expect(readStored(paths)[0]).toEqual({ ...original, remark: null });

        expect((await commandIn(paths, "user", ["edit", "one", "--manual-update"])).code).toBe(0);
        expect(readStored(paths)[0]).toEqual({
            ...original,
            remark: null,
            settings: { manuallyUpdate: true },
        });

        expect((await commandIn(paths, "user", ["edit", "one", "--no-manual-update"])).code).toBe(
            0
        );
        expect(readStored(paths)[0]).toEqual({ ...original, remark: null });
    });

    it.each([
        ["no change", ["edit", "0"]],
        ["empty remark", ["edit", "0", "--remark="]],
        ["blank remark", ["edit", "0", "--remark", "   "]],
        ["remark and clear", ["edit", "0", "--remark", "x", "--clear-remark"]],
    ])("rejects %s as USAGE", async (_label, args) => {
        const paths = makeHome();
        seed(paths, [madeUser("one")]);
        const result = await commandIn(paths, "user", args);
        expect(result.code).toBe(2);
        expect(result.json.error.code).toBe("USAGE");
    });

    it("rejects blank remarks on add", async () => {
        const result = await commandIn(makeHome(), "user", ["add", "--remark", " "]);
        expect(result.code).toBe(2);
        expect(result.json.error.code).toBe("USAGE");
    });

    it("preserves unknown settings on user edit with --manual-update and --no-manual-update", async () => {
        const paths = makeHome();
        const initialUser = madeUser("one");
        (initialUser.settings as Record<string, unknown>).madeExtra = "kept";
        seed(paths, [initialUser]);

        const updated = await commandIn(paths, "user", ["edit", "one", "--manual-update"]);
        expect(updated.code).toBe(0);
        expect(readStored(paths)[0].settings).toEqual({
            manuallyUpdate: true,
            madeExtra: "kept",
        });

        const reverted = await commandIn(paths, "user", ["edit", "one", "--no-manual-update"]);
        expect(reverted.code).toBe(0);
        expect(readStored(paths)[0].settings).toEqual({
            manuallyUpdate: false,
            madeExtra: "kept",
        });
    });

    it("describes optional manual-update switch on edit and normal switch on add", async () => {
        const paths = makeHome();
        const editSchema = await commandIn(paths, "schema", ["user", "edit"]);
        expect(editSchema.code).toBe(0);
        const editOption = editSchema.json.data.options.find(
            (option: { flag: string }) => option.flag === "--manual-update"
        );
        expect(editOption).toMatchObject({
            flag: "--manual-update",
            type: "boolean",
            default: null,
        });

        const addSchema = await commandIn(paths, "schema", ["user", "add"]);
        expect(addSchema.code).toBe(0);
        const addOption = addSchema.json.data.options.find(
            (option: { flag: string }) => option.flag === "--manual-update"
        );
        expect(addOption).toMatchObject({
            flag: "--manual-update",
            type: "boolean",
            default: false,
        });

        const editHelp = await commandIn(paths, "user", ["edit", "--help"]);
        expect(editHelp.code).toBe(0);
        expect(editHelp.stdout).toContain("--[no-]manual-update");

        const addHelp = await commandIn(paths, "user", ["add", "--help"]);
        expect(addHelp.code).toBe(0);
        expect(addHelp.stdout).toContain("--manual-update");
        expect(addHelp.stdout).not.toContain("--[no-]manual-update");
    });
});

describe("user remove and default", () => {
    it("previews, rejects wrong and stale edit codes, then runs error.fix and cascades data", async () => {
        const paths = makeHome();
        seed(
            paths,
            [madeUser("one", { remark: "One", withRows: true }), madeUser("two")],
            [event("one"), event("two")]
        );

        const preview = await commandIn(paths, "user", ["remove", "one"]);
        expect(preview.code).toBe(6);
        const error = preview.json.error as unknown as ConfirmationError;
        expect(error).toMatchObject({
            code: "CONFIRMATION_REQUIRED",
            codeRejected: false,
            preview: {
                uid: "one",
                name: "One",
                counts: {
                    scores: 1,
                    b50: 1,
                    items: 1,
                    characters: 1,
                    ratingHistory: 1,
                    scoreEvents: 1,
                },
            },
        });
        expect(error.fix).toContain("user remove one --yes ");
        expect(readStored(paths)).toHaveLength(2);

        const wrong = await commandIn(paths, "user", ["remove", "one", "--yes", "WRONG"]);
        expect(wrong.code).toBe(6);
        expect(wrong.json.error).toMatchObject({
            code: "CONFIRMATION_REQUIRED",
            codeRejected: true,
        });

        // This edit does not change the displayed name, update time, or row counts. The content
        // fingerprint still has to make the old confirmation stale.
        await commandIn(paths, "user", ["edit", "one", "--manual-update"]);
        const staleArgs = splitCommandLine(error.fix).slice(1);
        const stale = await commandIn(paths, staleArgs[0], staleArgs.slice(1));
        expect(stale.code).toBe(6);
        expect(stale.json.error).toMatchObject({ codeRejected: true });

        const currentFix = (stale.json.error as unknown as ConfirmationError).fix;
        const confirmArgs = splitCommandLine(currentFix).slice(1);
        const removed = await commandIn(paths, confirmArgs[0], confirmArgs.slice(1));
        expect(removed.code).toBe(0);
        expect(removed.json.data).toMatchObject({
            uid: "one",
            name: "One",
            manualUpdate: true,
            remainingUsers: 1,
        });
        expect(readStored(paths).map(user => user.uid)).toEqual(["two"]);

        const store = openStore(paths);
        expect(readScoreEvents(store).map(item => item.userUid)).toEqual(["two"]);
        for (const table of [
            "scores",
            "b50_snapshot",
            "user_items",
            "user_characters",
            "rating_history",
        ]) {
            expect(
                store.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE user_uid = 'one'`).get()
            ).toEqual({ n: 0 });
        }
        store.close();
    });

    it("invalidates a confirmation after reorder and puts a dash uid after --", async () => {
        const paths = makeHome();
        seed(paths, [madeUser("-dash", { remark: "Dash" }), madeUser("two")]);
        const preview = await commandIn(paths, "user", ["remove", "--", "-dash"]);
        const error = preview.json.error as unknown as ConfirmationError;
        expect(error.fix).toMatch(/^saltnet user remove --yes \S+ -- -dash$/);

        await commandIn(paths, "user", ["default", "1"]);
        const args = splitCommandLine(error.fix).slice(1);
        const stale = await commandIn(paths, args[0], args.slice(1));
        expect(stale.code).toBe(6);
        expect(stale.json.error).toMatchObject({ codeRejected: true });
    });

    it("confirms an all-digit uid even though ordinary digit references are indexes", async () => {
        const paths = makeHome();
        seed(paths, [
            madeUser("42", { remark: "Numeric uid" }),
            madeUser("other", { remark: "Other" }),
        ]);
        const preview = await commandIn(paths, "user", ["remove", "Numeric uid"]);
        const fix = (preview.json.error as unknown as ConfirmationError).fix;
        expect(fix).toMatch(/^saltnet user remove 42 --yes /);
        const args = splitCommandLine(fix).slice(1);
        const removed = await commandIn(paths, args[0], args.slice(1));
        expect(removed.code).toBe(0);
        expect(removed.json.data.uid).toBe("42");
        expect(readStored(paths).map(user => user.uid)).toEqual(["other"]);
    });

    it("moves a user to index 0, keeps relative order, and accepts the current default", async () => {
        const paths = makeHome();
        seed(paths, [madeUser("one"), madeUser("two"), madeUser("three")]);

        const moved = await commandIn(paths, "user", ["default", "2"]);
        expect(moved.code).toBe(0);
        expect(moved.json.data).toMatchObject({ uid: "three", index: 0, previousIndex: 2 });
        expect(
            (await commandIn(paths, "user", ["list"])).json.data.items.map(
                (item: { uid: string }) => item.uid
            )
        ).toEqual(["three", "one", "two"]);

        const again = await commandIn(paths, "user", ["default", "0"]);
        expect(again.code).toBe(0);
        expect(again.json.data).toMatchObject({ uid: "three", index: 0, previousIndex: 0 });
    });

    it.each([
        ["scores", "UPDATE scores SET achievements = 99.5 WHERE user_uid = ?"],
        ["b50_snapshot", "UPDATE b50_snapshot SET achievements = 99.5 WHERE user_uid = ?"],
        ["user_items", "UPDATE user_items SET stock = 99 WHERE user_uid = ?"],
        ["user_characters", "UPDATE user_characters SET point = 99 WHERE user_uid = ?"],
        ["rating_history", "UPDATE rating_history SET rating = 9999 WHERE user_uid = ?"],
        ["score_events", "UPDATE score_events SET achievements = 99.5 WHERE user_uid = ?"],
    ])("invalidates removal confirmation when %s row is updated in place", async (_table, sql) => {
        const paths = makeHome();
        seed(paths, [madeUser("one", { withRows: true })], [event("one")]);
        const preview = await commandIn(paths, "user", ["remove", "one"]);
        expect(preview.code).toBe(6);
        const error = preview.json.error as unknown as ConfirmationError;

        const store = openStore(paths);
        const result = store.db.prepare(sql).run("one");
        expect(result.changes).toBeGreaterThanOrEqual(1);
        store.close();

        const staleArgs = splitCommandLine(error.fix).slice(1);
        const stale = await commandIn(paths, staleArgs[0], staleArgs.slice(1));
        expect(stale.code).toBe(6);
        expect(stale.json.error).toMatchObject({ codeRejected: true });
        expect(readStored(paths).map(u => u.uid)).toEqual(["one"]);
    });

    it("confirms removal when no child table row is changed between preview and confirmation", async () => {
        const paths = makeHome();
        seed(paths, [madeUser("one", { withRows: true })], [event("one")]);
        const preview = await commandIn(paths, "user", ["remove", "one"]);
        expect(preview.code).toBe(6);
        const error = preview.json.error as unknown as ConfirmationError;

        const confirmArgs = splitCommandLine(error.fix).slice(1);
        const confirmed = await commandIn(paths, confirmArgs[0], confirmArgs.slice(1));
        expect(confirmed.code).toBe(0);
        expect(readStored(paths)).toEqual([]);
    });
});

describe("status user freshness", () => {
    it("does not create a database and reports an empty list when none exists", async () => {
        const paths = makeHome();
        const result = await commandIn(paths, "status", []);
        expect(result.json.data.users).toEqual({ staleDays: 3, items: [] });
        expect(result.json.data.database.exists).toBe(false);
    });

    it("reports missing, fresh, stale and the configured boundary with the fixed clock", async () => {
        const paths = makeHome();
        const day = 24 * 60 * 60 * 1000;
        seed(paths, [
            madeUser("missing"),
            madeUser("fresh", { updatedAt: NOW.getTime() - 2 * day }),
            madeUser("stale", { updatedAt: NOW.getTime() - 4 * day }),
            madeUser("boundary", { updatedAt: NOW.getTime() - 3 * day }),
        ]);

        const result = await commandIn(paths, "status", [], { now: NOW });
        expect(
            result.json.data.users.items.map((item: { scoresState: string }) => item.scoresState)
        ).toEqual(["missing", "fresh", "stale", "stale"]);

        const configured = await commandIn(paths, "status", [], {
            now: NOW,
            env: { SALTNET_SCORES_STALE_DAYS: "5" },
        });
        expect(configured.json.data.users.staleDays).toBe(5);
        expect(configured.json.data.users.items[2].scoresState).toBe("fresh");
    });
});
