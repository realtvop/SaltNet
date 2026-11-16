import type { DatabaseSync } from "../src/store/sqlite";

export interface MadeRecord {
    readonly recordKey: string;
    readonly chartKey?: string | null;
    readonly songId?: number | null;
    readonly type?: string | null;
    readonly title?: string | null;
    readonly level?: string | null;
    readonly levelIndex?: number | null;
    readonly levelLabel?: string | null;
    readonly ds?: number | null;
    readonly achievements?: number | null;
    readonly dxScore?: number | null;
    readonly fc?: string | null;
    readonly fs?: string | null;
    readonly rate?: string | null;
    readonly ra?: number | null;
    readonly playCount?: number | null;
    readonly lastChangedAt?: number | null;
}

export interface MadeB50Record extends MadeRecord {
    readonly section: "sd" | "dx";
    readonly position: number;
}

export interface MadeItem {
    readonly listIndex: number;
    readonly position: number;
    readonly itemKind?: number | null;
    readonly itemId?: number | null;
    readonly stock?: number | null;
    readonly isValid?: number | null;
}

export interface MadeCharacter {
    readonly position: number;
    readonly characterId: number | null;
    readonly point?: number | null;
    readonly useCount?: number | null;
    readonly level?: number | null;
    readonly nextAwake?: number | null;
    readonly nextAwakePercent?: number | null;
    readonly awakening?: number | null;
}

export interface MadeRatingHistory {
    readonly position: number;
    readonly time: number | null;
    readonly rating: number | null;
}

export interface MadeScoreEvent {
    readonly id: string;
    readonly schemaVersion?: number;
    readonly generationId?: string;
    readonly batchId?: string;
    readonly recordKey: string;
    readonly observedAt: number;
    readonly sequence: number;
    readonly source?: "inGame" | "lxns" | "divingFishImport" | "divingFishPublic";
    readonly kind?: "initial" | "change";
    readonly changedMask?: number;
    readonly achievements?: number;
    readonly dxScore?: number;
    readonly fc?: string;
    readonly fs?: string;
    readonly playCount?: number | null;
}

export interface MadeUserData {
    readonly uid: string;
    readonly position: number;
    /** The web user object as JSON; by default `{"uid": <uid>}`. */
    readonly raw?: string;
    readonly remark?: string | null;
    readonly divingFishName?: string | null;
    readonly hasLxns?: number;
    readonly lxnsId?: number | null;
    readonly lxnsName?: string | null;
    readonly inGameId?: number | null;
    readonly inGameName?: string | null;
    readonly inGameEnabled?: number;
    readonly inGameFastUpdate?: number;
    readonly manuallyUpdate?: number;
    readonly updatedAt?: number | null;
    readonly dataName?: string | null;
    readonly rating?: number | null;
    readonly info?: string | null;
    readonly hasDetailed?: number;
    readonly hasB50?: number;
    readonly hasItems?: number;
    readonly hasCharacters?: number;
    readonly hasRatingHistory?: number;
    readonly scores?: readonly MadeRecord[];
    readonly b50?: readonly MadeB50Record[];
    readonly items?: readonly MadeItem[];
    readonly characters?: readonly MadeCharacter[];
    readonly ratingHistory?: readonly MadeRatingHistory[];
    readonly scoreEvents?: readonly MadeScoreEvent[];
}

const value = <T>(input: T | undefined, fallback: T): T => input ?? fallback;

function recordValues(userUid: string, record: MadeRecord): (string | number | null)[] {
    return [
        userUid,
        record.recordKey,
        record.chartKey ?? null,
        record.songId ?? null,
        record.type ?? null,
        record.title ?? null,
        record.level ?? null,
        record.levelIndex ?? null,
        record.levelLabel ?? null,
        record.ds ?? null,
        record.achievements ?? null,
        record.dxScore ?? null,
        record.fc ?? null,
        record.fs ?? null,
        record.rate ?? null,
        record.ra ?? null,
        record.playCount ?? null,
        record.lastChangedAt ?? null,
    ];
}

/** Inserts made-up web users and all of their child rows without going through a repository. */
export function insertMadeUsers(db: DatabaseSync, users: readonly MadeUserData[]): void {
    const insertUser = db.prepare(
        "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const insertScore = db.prepare(
        "INSERT INTO scores (user_uid, record_key, chart_key, song_id, type, title, level, level_index, level_label, ds, achievements, dx_score, fc, fs, rate, ra, play_count, last_changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const insertB50 = db.prepare(
        "INSERT INTO b50_snapshot (user_uid, section, position, record_key, chart_key, song_id, type, title, level, level_index, level_label, ds, achievements, dx_score, fc, fs, rate, ra, play_count, last_changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const insertItem = db.prepare("INSERT INTO user_items VALUES (?, ?, ?, ?, ?, ?, ?)");
    const insertCharacter = db.prepare(
        "INSERT INTO user_characters VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const insertRating = db.prepare("INSERT INTO rating_history VALUES (?, ?, ?, ?)");
    const insertEvent = db.prepare(
        "INSERT INTO score_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );

    for (const user of users) {
        insertUser.run(
            user.uid,
            user.position,
            user.raw ?? JSON.stringify({ uid: user.uid }),
            user.remark ?? null,
            user.divingFishName ?? null,
            value(user.hasLxns, 0),
            user.lxnsId ?? null,
            user.lxnsName ?? null,
            user.inGameId ?? null,
            user.inGameName ?? null,
            value(user.inGameEnabled, 0),
            value(user.inGameFastUpdate, 0),
            value(user.manuallyUpdate, 0),
            user.updatedAt ?? null,
            user.dataName ?? null,
            user.rating ?? null,
            user.info ?? null,
            value(user.hasDetailed, user.scores === undefined ? 0 : 1),
            value(user.hasB50, user.b50 === undefined ? 0 : 1),
            value(user.hasItems, user.items === undefined ? 0 : 1),
            value(user.hasCharacters, user.characters === undefined ? 0 : 1),
            value(user.hasRatingHistory, user.ratingHistory === undefined ? 0 : 1)
        );
        for (const score of user.scores ?? []) insertScore.run(...recordValues(user.uid, score));
        for (const record of user.b50 ?? []) {
            const [uid, recordKey, ...fields] = recordValues(user.uid, record);
            insertB50.run(uid, record.section, record.position, recordKey, ...fields);
        }
        for (const item of user.items ?? []) {
            insertItem.run(
                user.uid,
                item.listIndex,
                item.position,
                item.itemKind ?? null,
                item.itemId ?? null,
                item.stock ?? null,
                item.isValid ?? null
            );
        }
        for (const character of user.characters ?? []) {
            insertCharacter.run(
                user.uid,
                character.position,
                character.characterId,
                character.point ?? null,
                character.useCount ?? null,
                character.level ?? null,
                character.nextAwake ?? null,
                character.nextAwakePercent ?? null,
                character.awakening ?? null
            );
        }
        for (const entry of user.ratingHistory ?? []) {
            insertRating.run(user.uid, entry.position, entry.time, entry.rating);
        }
        for (const event of user.scoreEvents ?? []) {
            insertEvent.run(
                event.id,
                value(event.schemaVersion, 1),
                value(event.generationId, "generation"),
                value(event.batchId, "batch"),
                user.uid,
                event.recordKey,
                event.observedAt,
                event.sequence,
                value(event.source, "inGame"),
                value(event.kind, "change"),
                value(event.changedMask, 0),
                value(event.achievements, 0),
                value(event.dxScore, 0),
                value(event.fc, ""),
                value(event.fs, ""),
                event.playCount ?? null
            );
        }
    }
}
