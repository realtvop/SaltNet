/** The sole repository that reads and writes migration 4's user-data tables. */
import type { ComboStatus, SyncStatus } from "@core/mai/types";
import type { ScoreHistoryEventV1 } from "@core/user/scoreHistory/type";
import type { User } from "@core/user/type";
import type { Store } from "../store/store";
import { createHash } from "node:crypto";
import { getUserDisplayName } from "@core/user/type";
import { loadMusic } from "../catalog/load";
import { buildUserRows } from "./rows";
import { insertUserRows, replaceStoredUserRows } from "./storage";

interface UserListDbRow {
    position: number;
    uid: string;
    raw: string;
    remark: string | null;
    diving_fish_name: string | null;
    has_lxns: number;
    lxns_id: number | null;
    lxns_name: string | null;
    in_game_id: number | null;
    in_game_name: string | null;
    in_game_enabled: number;
    in_game_fast_update: number;
    manually_update: number;
    updated_at: number | null;
    data_name: string | null;
    rating: number | null;
    has_detailed: number;
    has_b50: number;
    has_items: number;
    has_characters: number;
    has_rating_history: number;
}

export interface UserListRow {
    index: number;
    uid: string;
    displayName: string;
    remark: string | null;
    divingFishName: string | null;
    hasLxns: boolean;
    lxnsId: number | null;
    lxnsName: string | null;
    inGameId: number | null;
    inGameName: string | null;
    inGameEnabled: boolean;
    inGameFastUpdate: boolean;
    manuallyUpdate: boolean;
    updatedAt: number | null;
    dataName: string | null;
    rating: number | null;
    hasDetailed: boolean;
    hasB50: boolean;
    hasItems: boolean;
    hasCharacters: boolean;
    hasRatingHistory: boolean;
}

export interface UserCounts {
    scores: number;
    b50: number;
    items: number;
    characters: number;
    ratingHistory: number;
    scoreEvents: number;
}

/** Lists typed copies and derives the displayed name from the source-of-truth raw user. */
export function listUsers(store: Store): UserListRow[] {
    return store.read(() => {
        const rows = store.db
            .prepare(
                `SELECT position, uid, raw, remark, diving_fish_name, has_lxns, lxns_id, lxns_name,
                        in_game_id, in_game_name, in_game_enabled, in_game_fast_update,
                        manually_update, updated_at, data_name, rating, has_detailed, has_b50,
                        has_items, has_characters, has_rating_history
                 FROM users ORDER BY position`
            )
            .all() as unknown as UserListDbRow[];
        return rows.map(row => ({
            index: row.position,
            uid: row.uid,
            displayName: String(getUserDisplayName(JSON.parse(row.raw) as User)),
            remark: row.remark,
            divingFishName: row.diving_fish_name,
            hasLxns: row.has_lxns === 1,
            lxnsId: row.lxns_id,
            lxnsName: row.lxns_name,
            inGameId: row.in_game_id,
            inGameName: row.in_game_name,
            inGameEnabled: row.in_game_enabled === 1,
            inGameFastUpdate: row.in_game_fast_update === 1,
            manuallyUpdate: row.manually_update === 1,
            updatedAt: row.updated_at,
            dataName: row.data_name,
            rating: row.rating,
            hasDetailed: row.has_detailed === 1,
            hasB50: row.has_b50 === 1,
            hasItems: row.has_items === 1,
            hasCharacters: row.has_characters === 1,
            hasRatingHistory: row.has_rating_history === 1,
        }));
    });
}

export function readUser(store: Store, uid: string): User | undefined {
    const row = store.read(
        () =>
            store.db.prepare("SELECT raw FROM users WHERE uid = ?").get(uid) as
                | { raw: string }
                | undefined
    );
    return row ? (JSON.parse(row.raw) as User) : undefined;
}

export function readUsers(store: Store): User[] {
    const rows = store.read(
        () =>
            store.db.prepare("SELECT raw FROM users ORDER BY position").all() as unknown as {
                raw: string;
            }[]
    );
    return rows.map(row => JSON.parse(row.raw) as User);
}

/** Counts every query-oriented row and score-history event owned by one user. */
export function readUserCounts(store: Store, uid: string): UserCounts {
    return store.read(
        () =>
            store.db
                .prepare(
                    `SELECT
                        (SELECT count(*) FROM scores WHERE user_uid = ?) AS scores,
                        (SELECT count(*) FROM b50_snapshot WHERE user_uid = ?) AS b50,
                        (SELECT count(*) FROM user_items WHERE user_uid = ?) AS items,
                        (SELECT count(*) FROM user_characters WHERE user_uid = ?) AS characters,
                        (SELECT count(*) FROM rating_history WHERE user_uid = ?) AS ratingHistory,
                        (SELECT count(*) FROM score_events WHERE user_uid = ?) AS scoreEvents`
                )
                .get(uid, uid, uid, uid, uid, uid) as unknown as UserCounts
    );
}

/** A stable digest of every database row `removeUser` deletes for this uid. */
export function readUserRemovalFingerprint(store: Store, uid: string): string {
    return store.read(() => {
        const rows = {
            user: store.db.prepare("SELECT * FROM users WHERE uid = ?").get(uid),
            scores: store.db
                .prepare("SELECT * FROM scores WHERE user_uid = ? ORDER BY record_key")
                .all(uid),
            b50: store.db
                .prepare("SELECT * FROM b50_snapshot WHERE user_uid = ? ORDER BY section, position")
                .all(uid),
            items: store.db
                .prepare(
                    "SELECT * FROM user_items WHERE user_uid = ? ORDER BY list_index, position"
                )
                .all(uid),
            characters: store.db
                .prepare("SELECT * FROM user_characters WHERE user_uid = ? ORDER BY position")
                .all(uid),
            ratingHistory: store.db
                .prepare("SELECT * FROM rating_history WHERE user_uid = ? ORDER BY position")
                .all(uid),
            scoreEvents: store.db
                .prepare(
                    `SELECT * FROM score_events WHERE user_uid = ?
                     ORDER BY observed_at, sequence, id`
                )
                .all(uid),
        };
        return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
    });
}

interface ScoreEventDbRow {
    id: string;
    schema_version: number;
    generation_id: string;
    batch_id: string;
    user_uid: string;
    record_key: string;
    observed_at: number;
    sequence: number;
    source: ScoreHistoryEventV1["source"];
    kind: ScoreHistoryEventV1["kind"];
    changed_mask: number;
    achievements: number;
    dx_score: number;
    fc: ComboStatus;
    fs: SyncStatus;
    play_count: number | null;
}

export function readScoreEvents(store: Store, userUid?: string): ScoreHistoryEventV1[] {
    return store.read(() => {
        const where = userUid === undefined ? "" : "WHERE e.user_uid = ?";
        const rows = store.db
            .prepare(
                `SELECT e.* FROM score_events e
                 JOIN users u ON u.uid = e.user_uid
                 ${where}
                 ORDER BY u.position, e.observed_at, e.sequence, e.id`
            )
            .all(...(userUid === undefined ? [] : [userUid])) as unknown as ScoreEventDbRow[];
        return rows.map(row => ({
            id: row.id,
            schemaVersion: row.schema_version as 1,
            generationId: row.generation_id,
            batchId: row.batch_id,
            userUid: row.user_uid,
            chartKey: row.record_key,
            observedAt: row.observed_at,
            sequence: row.sequence,
            source: row.source,
            kind: row.kind,
            changedMask: row.changed_mask,
            state: {
                achievements: row.achievements,
                dxScore: row.dx_score,
                fc: row.fc,
                fs: row.fs,
                playCount: row.play_count,
            },
        }));
    });
}

function object(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object"
        ? (value as Record<string, unknown>)
        : undefined;
}

/** Rejects a programmer error before a user transaction starts. */
export function assertStoredUser(value: unknown): asserts value is User & { uid: string } {
    const user = object(value);
    const data = object(user?.data);
    const inGame = object(user?.inGame);
    const divingFish = object(user?.divingFish);
    const settings = object(user?.settings);
    const lxns = user?.lxns === undefined || user.lxns === null ? undefined : object(user.lxns);
    if (
        !user ||
        typeof user.uid !== "string" ||
        user.uid.length === 0 ||
        !data ||
        !inGame ||
        !divingFish ||
        typeof inGame.enabled !== "boolean" ||
        typeof inGame.useFastUpdate !== "boolean" ||
        !settings ||
        typeof settings.manuallyUpdate !== "boolean" ||
        (user.lxns !== undefined && user.lxns !== null && !lxns) ||
        // The web app writes `importToken: null` for a user without a token; a token is never stored.
        (divingFish.importToken !== undefined && divingFish.importToken !== null) ||
        (lxns !== undefined && lxns.auth !== undefined && lxns.auth !== null)
    ) {
        throw new Error("invalid stored user");
    }
    try {
        if (typeof JSON.stringify(value) !== "string") throw new Error("not serializable");
    } catch (error) {
        throw new Error("invalid stored user", { cause: error });
    }
}

/** Rejects values node:sqlite could not store and read back exactly. */
export function assertStoredScoreEvent(value: unknown): asserts value is ScoreHistoryEventV1 {
    const event = object(value);
    const state = object(event?.state);
    if (
        !event ||
        event.schemaVersion !== 1 ||
        typeof event.id !== "string" ||
        typeof event.generationId !== "string" ||
        typeof event.batchId !== "string" ||
        typeof event.userUid !== "string" ||
        typeof event.chartKey !== "string" ||
        typeof event.observedAt !== "number" ||
        !Number.isFinite(event.observedAt) ||
        typeof event.sequence !== "number" ||
        !Number.isSafeInteger(event.sequence) ||
        typeof event.changedMask !== "number" ||
        !Number.isSafeInteger(event.changedMask) ||
        !state ||
        typeof state.achievements !== "number" ||
        !Number.isFinite(state.achievements) ||
        typeof state.dxScore !== "number" ||
        !Number.isSafeInteger(state.dxScore) ||
        (state.playCount !== null &&
            (typeof state.playCount !== "number" || !Number.isSafeInteger(state.playCount))) ||
        typeof state.fc !== "string" ||
        typeof state.fs !== "string"
    ) {
        throw new Error("invalid stored score event");
    }
}

function assertUsers(
    users: readonly unknown[]
): asserts users is readonly (User & { uid: string })[] {
    const uids = new Set<string>();
    for (const user of users) {
        assertStoredUser(user);
        if (uids.has(user.uid)) throw new Error("duplicate user uid");
        uids.add(user.uid);
    }
}

function insertScoreEvent(store: Store, event: ScoreHistoryEventV1): void {
    store.db
        .prepare(
            `INSERT INTO score_events (
                id, schema_version, generation_id, batch_id, user_uid, record_key, observed_at,
                sequence, source, kind, changed_mask, achievements, dx_score, fc, fs, play_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
            event.id,
            event.schemaVersion,
            event.generationId,
            event.batchId,
            event.userUid,
            event.chartKey,
            event.observedAt,
            event.sequence,
            event.source,
            event.kind,
            event.changedMask,
            event.state.achievements,
            event.state.dxScore,
            event.state.fc,
            event.state.fs,
            event.state.playCount
        );
}

export function replaceUsers(
    store: Store,
    users: readonly User[],
    events: readonly ScoreHistoryEventV1[]
): void {
    assertUsers(users);
    for (const event of events) assertStoredScoreEvent(event);
    store.transaction(() => {
        const music = loadMusic(store)?.music;
        const rows = users.map((user, position) => buildUserRows(user, position, music));
        store.db.exec("DELETE FROM score_events");
        store.db.exec("DELETE FROM users");
        for (const userRows of rows) insertUserRows(store, userRows);
        for (const event of events) insertScoreEvent(store, event);
    });
}

export function saveUser(store: Store, user: User): void {
    assertStoredUser(user);
    store.transaction(() => {
        const current = store.db
            .prepare("SELECT position FROM users WHERE uid = ?")
            .get(user.uid) as { position: number } | undefined;
        const position =
            current?.position ??
            ((
                store.db.prepare("SELECT max(position) AS value FROM users").get() as {
                    value: number | null;
                }
            ).value ?? -1) + 1;
        const rows = buildUserRows(user, position, loadMusic(store)?.music);
        if (current) replaceStoredUserRows(store, rows);
        else insertUserRows(store, rows);
    });
}

function setPositions(store: Store, uids: readonly string[]): void {
    if (uids.length === 0) return;
    const maximum = (
        store.db.prepare("SELECT max(position) AS value FROM users").get() as {
            value: number;
        }
    ).value;
    store.db.prepare("UPDATE users SET position = position + ?").run(maximum + 1);
    const update = store.db.prepare("UPDATE users SET position = ? WHERE uid = ?");
    uids.forEach((uid, position) => update.run(position, uid));
}

export function removeUser(store: Store, uid: string): boolean {
    return store.transaction(() => {
        const { changes } = store.db.prepare("DELETE FROM users WHERE uid = ?").run(uid);
        if (changes === 0) return false;
        const rows = store.db
            .prepare("SELECT uid FROM users ORDER BY position")
            .all() as unknown as { uid: string }[];
        setPositions(
            store,
            rows.map(row => row.uid)
        );
        return true;
    });
}

export function makeDefaultUser(store: Store, uid: string): void {
    store.transaction(() => {
        const rows = store.db
            .prepare("SELECT uid FROM users ORDER BY position")
            .all() as unknown as { uid: string }[];
        const uids = rows.map(row => row.uid);
        const index = uids.indexOf(uid);
        if (index === -1) throw new Error("user does not exist");
        if (index === 0) return;
        uids.splice(index, 1);
        uids.unshift(uid);
        setPositions(store, uids);
    });
}

export function appendScoreEvents(store: Store, events: readonly ScoreHistoryEventV1[]): void {
    for (const event of events) assertStoredScoreEvent(event);
    store.transaction(() => {
        for (const event of events) insertScoreEvent(store, event);
    });
}
