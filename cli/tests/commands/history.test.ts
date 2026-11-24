import type { Chart } from "@core/music/type";
import type { ScoreHistoryEventV1, ScoreHistoryStateV1 } from "@core/user/scoreHistory/type";
import { ComboStatus, SyncStatus } from "@core/mai/types";
import { ScoreHistoryChange } from "@core/user/scoreHistory/type";
import { describe, expect, it } from "vitest";
import { commandIn, NOW } from "../commandRun";
import { fixtureSongCatalog } from "../fixtureCatalog";
import { b50User, detailedUser, recordOf, seedScoreUsers, user } from "../scoreUsers";
import { useTempHome } from "../tempHome";
import { useTimeZone } from "../zone";

useTimeZone("America/New_York");
const home = useTempHome();
const DAY = 86_400_000;
const HOUR = 3_600_000;

function chart(key: string): Chart {
    const found = fixtureSongCatalog().chartByKey.get(key)?.chart;
    if (!found) throw new Error(`fixture needs chart ${key}`);
    return found;
}

function state(
    achievements: number,
    dxScore: number,
    fc: ComboStatus = ComboStatus.None,
    fs: SyncStatus = SyncStatus.None,
    playCount: number | null = null
): ScoreHistoryStateV1 {
    return { achievements, dxScore, fc, fs, playCount };
}

function event(input: {
    id: string;
    recordKey?: string;
    observedAt?: number;
    sequence?: number;
    source?: ScoreHistoryEventV1["source"];
    kind?: ScoreHistoryEventV1["kind"];
    changedMask?: number;
    state?: ScoreHistoryStateV1;
    userUid?: string;
}): ScoreHistoryEventV1 {
    return {
        id: input.id,
        schemaVersion: 1,
        generationId: "made-generation",
        batchId: "made-batch",
        userUid: input.userUid ?? "made-history",
        chartKey: input.recordKey ?? "146-3",
        observedAt: input.observedAt ?? NOW.getTime(),
        sequence: input.sequence ?? 0,
        source: input.source ?? "inGame",
        kind: input.kind ?? "change",
        changedMask: input.changedMask ?? ScoreHistoryChange.Achievements,
        state: input.state ?? state(100, 1000),
    };
}

function linkedUser(uid: string = "made-history", name: string = "Made History") {
    return user(uid, name, {
        updateTime: NOW.getTime(),
        detailed: { "made-record": recordOf(chart("146-3")) },
    });
}

describe("history timeline", () => {
    it("matches the web page timeline, previous states, field order and play-count filter", async () => {
        const paths = home();
        const base = NOW.getTime() - 4 * HOUR;
        const events = [
            event({
                id: "initial",
                recordKey: "made-record",
                observedAt: base,
                kind: "initial",
                changedMask: 0,
                source: "divingFishImport",
                state: state(99, 900, ComboStatus.None, SyncStatus.None, 1),
            }),
            event({
                id: "score-change",
                recordKey: "made-record",
                observedAt: base + HOUR,
                changedMask: ScoreHistoryChange.Achievements | ScoreHistoryChange.ComboStatus,
                source: "lxns",
                state: state(100, 900, ComboStatus.FullCombo, SyncStatus.None, 1),
            }),
            event({
                id: "play-only",
                recordKey: "made-record",
                observedAt: base + 2 * HOUR,
                changedMask: ScoreHistoryChange.PlayCount,
                state: state(100, 900, ComboStatus.FullCombo, SyncStatus.None, 2),
            }),
            event({
                id: "latest",
                recordKey: "made-record",
                observedAt: base + 3 * HOUR,
                changedMask: ScoreHistoryChange.Achievements | ScoreHistoryChange.PlayCount,
                source: "divingFishPublic",
                state: state(100.5, 900, ComboStatus.FullCombo, SyncStatus.None, 3),
            }),
        ];
        await seedScoreUsers(paths, [linkedUser()], events);

        const result = await commandIn(paths, "history", ["146-3"]);
        expect(result.code).toBe(0);
        expect(result.json.data.missing).toEqual([]);
        expect(result.json.data.items.map((item: { eventId: string }) => item.eventId)).toEqual([
            "latest",
            "score-change",
            "initial",
        ]);
        expect(result.json.data.items[0].changes).toEqual([
            { field: "achievements", before: 100, after: 100.5 },
            { field: "playCount", before: 2, after: 3 },
        ]);
        expect(result.json.data.items[1].changes).toEqual([
            { field: "achievements", before: 99, after: 100 },
            { field: "combo", before: null, after: "FC" },
        ]);
        expect(result.json.data.items[2].changes).toEqual([
            { field: "achievements", before: null, after: 99 },
            { field: "dxScore", before: null, after: 900 },
            { field: "combo", before: null, after: null },
            { field: "sync", before: null, after: null },
            { field: "playCount", before: null, after: 1 },
        ]);
        expect(result.json.data.items[0]).toMatchObject({
            chartKey: "146-3",
            source: "divingFishPublic",
            kind: "change",
            score: { achievements: 100 },
        });

        const all = await commandIn(paths, "history", ["146-3", "--all-changes"]);
        expect(all.json.data.items.map((item: { eventId: string }) => item.eventId)).toEqual([
            "latest",
            "play-only",
            "score-change",
            "initial",
        ]);
        expect(all.json.data.items[1].changes).toEqual([
            { field: "playCount", before: 1, after: 2 },
        ]);
    });

    it("keeps the state before a --since window", async () => {
        const paths = home();
        await seedScoreUsers(
            paths,
            [linkedUser()],
            [
                event({
                    id: "before-window",
                    recordKey: "made-record",
                    observedAt: NOW.getTime() - 25 * HOUR,
                    kind: "initial",
                    changedMask: 0,
                    state: state(99, 800, ComboStatus.None, SyncStatus.FullSync, 1),
                }),
                event({
                    id: "inside-window",
                    recordKey: "made-record",
                    observedAt: NOW.getTime() - 23 * HOUR,
                    changedMask: ScoreHistoryChange.Achievements | ScoreHistoryChange.SyncStatus,
                    state: state(100, 800, ComboStatus.None, SyncStatus.FullSyncDX, 1),
                }),
            ]
        );

        const result = await commandIn(paths, "history", ["146-3", "--since", "24h"]);
        expect(result.json.data.items).toHaveLength(1);
        expect(result.json.data.items[0].changes).toEqual([
            { field: "achievements", before: 99, after: 100 },
            { field: "sync", before: "FS", after: "FDX" },
        ]);
    });
});

describe("history linking, ordering and paging", () => {
    it("links through a score, falls back to a catalog key, and counts unplaced keys", async () => {
        const paths = home();
        await seedScoreUsers(
            paths,
            [linkedUser()],
            [
                event({ id: "linked", recordKey: "made-record", observedAt: NOW.getTime() - 1 }),
                event({ id: "fallback", recordKey: "146-2", observedAt: NOW.getTime() - 2 }),
                event({
                    id: "missing-score",
                    recordKey: "made-missing",
                    observedAt: NOW.getTime() - 3,
                }),
                event({
                    id: "missing-play",
                    recordKey: "made-missing",
                    observedAt: NOW.getTime() - 4,
                    changedMask: ScoreHistoryChange.PlayCount,
                }),
            ]
        );

        const result = await commandIn(paths, "history", []);
        expect(result.json.data.items.map((item: { chartKey: string }) => item.chartKey)).toEqual([
            "146-3",
            "146-2",
        ]);
        expect(result.json.data.missing).toEqual([{ recordKey: "made-missing", count: 1 }]);

        const all = await commandIn(paths, "history", ["--all-changes"]);
        expect(all.json.data.missing).toEqual([{ recordKey: "made-missing", count: 2 }]);

        const one = await commandIn(paths, "history", ["146-2"]);
        expect(one.json.data.items.map((item: { eventId: string }) => item.eventId)).toEqual([
            "fallback",
        ]);
        expect(one.json.data.missing).toEqual([]);
        expect(one.json.data.items[0].score).toBeNull();
    });

    it("sorts all charts by time, sequence and event id, then pages and projects fields", async () => {
        const paths = home();
        const time = NOW.getTime() - HOUR;
        await seedScoreUsers(
            paths,
            [linkedUser()],
            [
                event({ id: "b", recordKey: "146-2", observedAt: time, sequence: 1 }),
                event({ id: "a", recordKey: "146-3", observedAt: time, sequence: 1 }),
                event({ id: "sequence-2", recordKey: "146-1", observedAt: time, sequence: 2 }),
                event({ id: "newest", recordKey: "146-0", observedAt: time + 1, sequence: 0 }),
            ]
        );

        const full = await commandIn(paths, "history", []);
        expect(full.json.data.items.map((item: { eventId: string }) => item.eventId)).toEqual([
            "newest",
            "sequence-2",
            "a",
            "b",
        ]);

        const page = await commandIn(paths, "history", [
            "--offset",
            "1",
            "--limit",
            "2",
            "--fields",
            "eventId,chartKey,changes",
        ]);
        expect(page.json.data.items.map((item: { eventId: string }) => item.eventId)).toEqual([
            "sequence-2",
            "a",
        ]);
        expect(Object.keys(page.json.data.items[0])).toEqual(["eventId", "chartKey", "changes"]);
        expect(page.json.meta.page).toEqual({ total: 4, offset: 1, limit: 2, nextOffset: 3 });
    });
});

describe("history --since", () => {
    it("accepts zoned and local ISO times, 7d and 24h against the context clock", async () => {
        const paths = home();
        await seedScoreUsers(
            paths,
            [linkedUser()],
            [
                event({
                    id: "eight-days",
                    recordKey: "146-0",
                    observedAt: NOW.getTime() - 8 * DAY,
                }),
                event({
                    id: "seven-days",
                    recordKey: "146-1",
                    observedAt: NOW.getTime() - 7 * DAY,
                }),
                event({
                    id: "twenty-five-hours",
                    recordKey: "146-2",
                    observedAt: NOW.getTime() - 25 * HOUR,
                }),
                event({
                    id: "twenty-four-hours",
                    recordKey: "146-3",
                    observedAt: NOW.getTime() - 24 * HOUR,
                }),
                event({ id: "now", recordKey: "146-4", observedAt: NOW.getTime() }),
            ]
        );

        const seven = await commandIn(paths, "history", ["--since", "7d"]);
        expect(seven.json.data.items.map((item: { eventId: string }) => item.eventId)).toEqual([
            "now",
            "twenty-four-hours",
            "twenty-five-hours",
            "seven-days",
        ]);
        const hours = await commandIn(paths, "history", ["--since", "24h"]);
        expect(hours.json.data.items.map((item: { eventId: string }) => item.eventId)).toEqual([
            "now",
            "twenty-four-hours",
        ]);

        for (const since of ["2026-11-11T01:00:00Z", "2026-11-10T20:00:00"]) {
            const absolute = await commandIn(paths, "history", ["--since", since]);
            expect(
                absolute.json.data.items.map((item: { eventId: string }) => item.eventId)
            ).toEqual(["now"]);
        }
    });

    it("rejects invalid forms as USAGE with selected-user score context", async () => {
        const paths = home();
        await seedScoreUsers(paths, [linkedUser()]);
        const result = await commandIn(paths, "history", ["--since", "0d"]);
        expect(result.code).toBe(2);
        expect(result.json.error.code).toBe("USAGE");
        expect(result.json.error.message).toContain("ISO 8601");
        expect(result.json.error.message).toContain("7d、24h");
        expect(result.json.meta.user.uid).toBe("made-history");
        expect(result.json.meta.dataAsOf.scores).toBeDefined();
        expect(result.requests).toEqual([]);
    });
});

describe("history users, errors, warnings and formats", () => {
    it("fails with NO_USER before metadata and resolves a user by index or name", async () => {
        const noUser = await commandIn(home(), "history", [], { network: {} });
        expect(noUser.code).toBe(4);
        expect(noUser.json.error.code).toBe("NO_USER");
        expect(noUser.requests).toEqual([]);

        const paths = home();
        await seedScoreUsers(
            paths,
            [linkedUser(), linkedUser("made-friend", "Made Friend")],
            [event({ id: "friend", userUid: "made-friend" })]
        );
        for (const reference of ["1", "Made Friend"]) {
            const result = await commandIn(paths, "history", ["--user", reference]);
            expect(result.json.meta.user.uid).toBe("made-friend");
            expect(result.json.data.items[0].eventId).toBe("friend");
        }

        const unknown = await commandIn(paths, "history", ["--user", "Nobody Made"]);
        expect(unknown.code).toBe(3);
        expect(unknown.json.error.code).toBe("NOT_FOUND");
        expect(unknown.requests).toEqual([]);
    });

    it("carries score context on chart reference errors", async () => {
        const paths = home();
        await seedScoreUsers(paths, [linkedUser()]);
        const ambiguous = await commandIn(paths, "history", ["ネコ日和。", "mas"]);
        expect(ambiguous.json.error.code).toBe("AMBIGUOUS_REF");
        expect(ambiguous.json.meta.user.uid).toBe("made-history");
        expect(ambiguous.json.meta.dataAsOf.catalog).toBeDefined();
        expect(ambiguous.json.meta.dataAsOf.scores).toBeDefined();

        const missing = await commandIn(paths, "history", ["999999-3"]);
        expect(missing.json.error.code).toBe("NOT_FOUND");
        expect(missing.json.meta.user.uid).toBe("made-history");
    });

    it("reports the same stale, missing and partial score warnings as chart rows", async () => {
        const stalePaths = home();
        await seedScoreUsers(stalePaths, [
            detailedUser("made-stale", "Made Stale", NOW.getTime() - 4 * DAY),
        ]);
        expect((await commandIn(stalePaths, "history", [])).json.warnings[0].code).toBe(
            "STALE_SCORES"
        );

        const emptyPaths = home();
        await seedScoreUsers(emptyPaths, [user("made-empty", "Made Empty")]);
        expect((await commandIn(emptyPaths, "history", [])).json.warnings[0].code).toBe(
            "NO_SCORES"
        );

        const partialPaths = home();
        await seedScoreUsers(partialPaths, [b50User("made-partial", "Made Partial")]);
        expect((await commandIn(partialPaths, "history", [])).json.warnings[0].code).toBe(
            "PARTIAL_SCORES"
        );
    });

    it("keeps changes and missing readable in tsv and text", async () => {
        const paths = home();
        await seedScoreUsers(
            paths,
            [linkedUser()],
            [
                event({ id: "shown", recordKey: "146-3" }),
                event({
                    id: "unplaced",
                    recordKey: "made-unplaced",
                    observedAt: NOW.getTime() - 1,
                }),
            ]
        );

        const tsv = await commandIn(paths, "history", [
            "--fields",
            "eventId,changes",
            "--format",
            "tsv",
        ]);
        expect(tsv.stdout.split("\n")[0]).toBe("eventId\tchanges");
        expect(tsv.stdout).toContain('shown\t[{"field":"achievements","before":null,"after":100}]');
        expect(tsv.stderr).toContain('# missing [{"recordKey":"made-unplaced","count":1}]');

        const text = await commandIn(paths, "history", ["--format", "text"]);
        expect(text.stdout).toContain("changes");
        expect(text.stdout).toContain("missing:");
        expect(text.stdout).toContain("recordKey: made-unplaced");
    });
});

describe("history edge cases", () => {
    it("orders one record's events by sequence and then event id before finding previous states", async () => {
        const paths = home();
        const time = NOW.getTime() - HOUR;
        await seedScoreUsers(
            paths,
            [linkedUser()],
            [
                event({
                    id: "tie-b",
                    recordKey: "made-record",
                    observedAt: time,
                    sequence: 2,
                    state: state(99.5, 800),
                }),
                event({
                    id: "second",
                    recordKey: "made-record",
                    observedAt: time,
                    sequence: 1,
                    state: state(98, 800),
                }),
                event({
                    id: "tie-a",
                    recordKey: "made-record",
                    observedAt: time,
                    sequence: 2,
                    state: state(99, 800),
                }),
                event({
                    id: "first",
                    recordKey: "made-record",
                    observedAt: time,
                    sequence: 0,
                    kind: "initial",
                    changedMask: 0,
                    state: state(97, 800),
                }),
            ]
        );

        const result = await commandIn(paths, "history", ["146-3"]);
        const items = result.json.data.items as {
            eventId: string;
            changes: { field: string; before: unknown; after: unknown }[];
        }[];
        expect(items.map(item => item.eventId)).toEqual(["tie-a", "tie-b", "second", "first"]);
        expect(items.slice(0, 3).map(item => item.changes)).toEqual([
            [{ field: "achievements", before: 98, after: 99 }],
            [{ field: "achievements", before: 99, after: 99.5 }],
            [{ field: "achievements", before: 97, after: 98 }],
        ]);
    });

    it("keeps a later initial event with only the play-count bit and shows it without previous values", async () => {
        const paths = home();
        await seedScoreUsers(
            paths,
            [linkedUser()],
            [
                event({
                    id: "change-first",
                    recordKey: "made-record",
                    observedAt: NOW.getTime() - 2 * HOUR,
                    state: state(98, 900),
                }),
                event({
                    id: "re-initial",
                    recordKey: "made-record",
                    observedAt: NOW.getTime() - HOUR,
                    kind: "initial",
                    changedMask: ScoreHistoryChange.PlayCount,
                    state: state(99, 950, ComboStatus.None, SyncStatus.None, 4),
                }),
            ]
        );

        const result = await commandIn(paths, "history", ["146-3"]);
        const items = result.json.data.items as {
            eventId: string;
            changes: { field: string; before: unknown; after: unknown }[];
        }[];
        expect(items.map(item => item.eventId)).toEqual(["re-initial", "change-first"]);
        expect(items[0].changes.map(change => change.field)).toEqual([
            "achievements",
            "dxScore",
            "combo",
            "sync",
            "playCount",
        ]);
        expect(items[0].changes.every(change => change.before === null)).toBe(true);
        expect(items[0].changes[0].after).toBe(99);
        expect(items[0].changes[4].after).toBe(4);
    });

    it("rejects --type without a chart as USAGE", async () => {
        const paths = home();
        await seedScoreUsers(paths, [linkedUser()]);
        const result = await commandIn(paths, "history", ["--type", "sd"]);
        expect(result.code).toBe(2);
        expect(result.json.error.code).toBe("USAGE");
        expect(result.json.error.message).toContain("--type");
    });

    it("lists unplaced record keys in ascending order", async () => {
        const paths = home();
        await seedScoreUsers(
            paths,
            [linkedUser()],
            [
                event({ id: "zeta", recordKey: "made-zeta", observedAt: NOW.getTime() - 1 }),
                event({ id: "alpha", recordKey: "made-alpha", observedAt: NOW.getTime() - 2 }),
            ]
        );

        const result = await commandIn(paths, "history", []);
        expect(result.json.data.items).toEqual([]);
        expect(result.json.data.missing).toEqual([
            { recordKey: "made-alpha", count: 1 },
            { recordKey: "made-zeta", count: 1 },
        ]);
    });

    it("writes null for a stored time outside the range of a date", async () => {
        const paths = home();
        await seedScoreUsers(
            paths,
            [linkedUser()],
            [
                event({ id: "far-future", recordKey: "made-record", observedAt: 8.7e15 }),
                event({
                    id: "ordinary",
                    recordKey: "made-record",
                    observedAt: NOW.getTime() - HOUR,
                }),
            ]
        );

        const result = await commandIn(paths, "history", ["146-3"]);
        expect(result.code).toBe(0);
        const items = result.json.data.items as { eventId: string; time: string | null }[];
        expect(items.map(item => item.eventId)).toEqual(["far-future", "ordinary"]);
        expect(items[0].time).toBeNull();
        expect(items[1].time).not.toBeNull();
    });
});
