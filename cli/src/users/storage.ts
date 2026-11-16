/** SQLite statements for the rows projected by users/rows.ts. */
import type { SavedMusicList } from "@core/music/type";
import type { User } from "@core/user/type";
import type { Store } from "../store/store";
import type { StoredScoreRow, StoredUserRows } from "./rows";
import { buildUserRows } from "./rows";

function scoreValues(userUid: string, row: StoredScoreRow): (string | number | null)[] {
    return [
        userUid,
        row.recordKey,
        row.chartKey,
        row.songId,
        row.type,
        row.title,
        row.level,
        row.levelIndex,
        row.levelLabel,
        row.ds,
        row.achievements,
        row.dxScore,
        row.fc,
        row.fs,
        row.rate,
        row.ra,
        row.playCount,
        row.lastChangedAt,
    ];
}

export function insertUserRows(store: Store, rows: StoredUserRows): void {
    const { db } = store;
    const user = rows.user;
    db.prepare(
        `INSERT INTO users (
            uid, position, raw, remark, diving_fish_name, has_lxns, lxns_id, lxns_name,
            in_game_id, in_game_name, in_game_enabled, in_game_fast_update, manually_update,
            updated_at, data_name, rating, info, has_detailed, has_b50, has_items,
            has_characters, has_rating_history
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        user.uid,
        user.position,
        user.raw,
        user.remark,
        user.divingFishName,
        user.hasLxns,
        user.lxnsId,
        user.lxnsName,
        user.inGameId,
        user.inGameName,
        user.inGameEnabled,
        user.inGameFastUpdate,
        user.manuallyUpdate,
        user.updatedAt,
        user.dataName,
        user.rating,
        user.info,
        user.hasDetailed,
        user.hasB50,
        user.hasItems,
        user.hasCharacters,
        user.hasRatingHistory
    );
    insertCopies(store, rows);
}

function insertCopies(store: Store, rows: StoredUserRows): void {
    const { db } = store;
    const { uid } = rows.user;
    const insertScore = db.prepare(
        `INSERT INTO scores (
            user_uid, record_key, chart_key, song_id, type, title, level, level_index,
            level_label, ds, achievements, dx_score, fc, fs, rate, ra, play_count, last_changed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const row of rows.scores) insertScore.run(...scoreValues(uid, row));

    const insertB50 = db.prepare(
        `INSERT INTO b50_snapshot (
            user_uid, section, position, record_key, chart_key, song_id, type, title, level,
            level_index, level_label, ds, achievements, dx_score, fc, fs, rate, ra, play_count,
            last_changed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const row of rows.b50) {
        const [userUid, recordKey, ...values] = scoreValues(uid, row);
        insertB50.run(userUid, row.section, row.position, recordKey, ...values);
    }

    const insertItem = db.prepare(
        `INSERT INTO user_items (
            user_uid, list_index, position, item_kind, item_id, stock, is_valid
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const row of rows.items) {
        insertItem.run(
            uid,
            row.listIndex,
            row.position,
            row.itemKind,
            row.itemId,
            row.stock,
            row.isValid
        );
    }

    const insertCharacter = db.prepare(
        `INSERT INTO user_characters (
            user_uid, position, character_id, point, use_count, level, next_awake,
            next_awake_percent, awakening
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const row of rows.characters) {
        insertCharacter.run(
            uid,
            row.position,
            row.characterId,
            row.point,
            row.useCount,
            row.level,
            row.nextAwake,
            row.nextAwakePercent,
            row.awakening
        );
    }

    const insertRating = db.prepare(
        "INSERT INTO rating_history (user_uid, position, time, rating) VALUES (?, ?, ?, ?)"
    );
    for (const row of rows.ratingHistory) insertRating.run(uid, row.position, row.time, row.rating);
}

export function replaceStoredUserRows(store: Store, rows: StoredUserRows): void {
    const { db } = store;
    const user = rows.user;
    const update = db.prepare(
        `UPDATE users SET
            raw = ?, remark = ?, diving_fish_name = ?, has_lxns = ?, lxns_id = ?, lxns_name = ?,
            in_game_id = ?, in_game_name = ?, in_game_enabled = ?, in_game_fast_update = ?,
            manually_update = ?, updated_at = ?, data_name = ?, rating = ?, info = ?,
            has_detailed = ?, has_b50 = ?, has_items = ?, has_characters = ?,
            has_rating_history = ?
         WHERE uid = ?`
    );
    update.run(
        user.raw,
        user.remark,
        user.divingFishName,
        user.hasLxns,
        user.lxnsId,
        user.lxnsName,
        user.inGameId,
        user.inGameName,
        user.inGameEnabled,
        user.inGameFastUpdate,
        user.manuallyUpdate,
        user.updatedAt,
        user.dataName,
        user.rating,
        user.info,
        user.hasDetailed,
        user.hasB50,
        user.hasItems,
        user.hasCharacters,
        user.hasRatingHistory,
        user.uid
    );
    for (const table of [
        "scores",
        "b50_snapshot",
        "user_items",
        "user_characters",
        "rating_history",
    ]) {
        db.prepare(`DELETE FROM ${table} WHERE user_uid = ?`).run(user.uid);
    }
    insertCopies(store, rows);
}

/** Recomputes both stored chart-key copies against exactly the supplied catalog. */
export function recomputeUserChartKeys(store: Store, music: SavedMusicList): void {
    store.transaction(() => {
        const users = store.db
            .prepare("SELECT position, raw FROM users ORDER BY position")
            .all() as unknown as { position: number; raw: string }[];
        const rows = users.map(({ position, raw }) =>
            buildUserRows(JSON.parse(raw) as User, position, music)
        );
        store.db.exec("UPDATE scores SET chart_key = NULL");
        store.db.exec("UPDATE b50_snapshot SET chart_key = NULL");
        const updateScore = store.db.prepare(
            "UPDATE scores SET chart_key = ? WHERE user_uid = ? AND record_key = ?"
        );
        const updateB50 = store.db.prepare(
            `UPDATE b50_snapshot SET chart_key = ?
             WHERE user_uid = ? AND section = ? AND position = ?`
        );
        for (const userRows of rows) {
            for (const score of userRows.scores)
                updateScore.run(score.chartKey, userRows.user.uid, score.recordKey);
            for (const record of userRows.b50) {
                updateB50.run(record.chartKey, userRows.user.uid, record.section, record.position);
            }
        }
    });
}
