/** Pure projection of a web user into migration 4's query-oriented copies. */
import type { DivingFishFullRecord } from "@core/integrations/diving-fish/type";
import type { SavedMusicList } from "@core/music/type";
import type { User } from "@core/user/type";
import { isUtageGrade } from "@core/chart/difficulty";
import { createDetailedScoreLookup } from "@core/chart/scoreLookup";
import { getSaltNetMusicIdForChartType } from "@core/music/saltmeta";

type ObjectValue = Record<string, unknown>;

export interface StoredUserRow {
    uid: string;
    position: number;
    raw: string;
    remark: string | null;
    divingFishName: string | null;
    hasLxns: number;
    lxnsId: number | null;
    lxnsName: string | null;
    inGameId: number | null;
    inGameName: string | null;
    inGameEnabled: number;
    inGameFastUpdate: number;
    manuallyUpdate: number;
    updatedAt: number | null;
    dataName: string | null;
    rating: number | null;
    info: string | null;
    hasDetailed: number;
    hasB50: number;
    hasItems: number;
    hasCharacters: number;
    hasRatingHistory: number;
}

export interface StoredScoreRow {
    recordKey: string;
    chartKey: string | null;
    songId: number | null;
    type: string | null;
    title: string | null;
    level: string | null;
    levelIndex: number | null;
    levelLabel: string | null;
    ds: number | null;
    achievements: number | null;
    dxScore: number | null;
    fc: string | null;
    fs: string | null;
    rate: string | null;
    ra: number | null;
    playCount: number | null;
    lastChangedAt: number | null;
}

export interface StoredB50Row extends StoredScoreRow {
    section: "sd" | "dx";
    position: number;
}

export interface StoredItemRow {
    listIndex: number;
    position: number;
    itemKind: number | null;
    itemId: number | null;
    stock: number | null;
    isValid: number | null;
}

export interface StoredCharacterRow {
    position: number;
    characterId: number | null;
    point: number | null;
    useCount: number | null;
    level: number | null;
    nextAwake: number | null;
    nextAwakePercent: number | null;
    awakening: number | null;
}

export interface StoredRatingHistoryRow {
    position: number;
    time: number | null;
    rating: number | null;
}

export interface StoredUserRows {
    user: StoredUserRow;
    scores: StoredScoreRow[];
    b50: StoredB50Row[];
    items: StoredItemRow[];
    characters: StoredCharacterRow[];
    ratingHistory: StoredRatingHistoryRow[];
}

export function isPlainObject(value: unknown): value is ObjectValue {
    if (value === null || typeof value !== "object") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function objectValue(value: unknown): ObjectValue | undefined {
    return value !== null && typeof value === "object" ? (value as ObjectValue) : undefined;
}

function text(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

function integer(value: unknown): number | null {
    return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function real(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): number | null {
    return typeof value === "boolean" ? Number(value) : null;
}

/** Whether turning the value into text and into a number works, as core's lookup does with it. */
function convertible(value: unknown): boolean {
    if (typeof value === "symbol" || typeof value === "bigint") return false;
    if (value === null || typeof value !== "object") return true;
    try {
        String(value);
        Number(value);
        return true;
    } catch {
        // An object whose `toString` is not a function, for example.
        return false;
    }
}

export function recordCanBeLookedUp(
    value: ObjectValue
): value is DivingFishFullRecord & ObjectValue {
    // Core's lookup takes any other values, but calls toUpperCase on `type` and turns `song_id`,
    // `level_index` and `ds` into text or numbers, which throws for a value that cannot be converted.
    return (
        typeof value.type === "string" &&
        convertible(value.song_id) &&
        convertible(value.level_index) &&
        convertible(value.ds)
    );
}

function lookupRecords(value: unknown): Record<string, DivingFishFullRecord & ObjectValue> {
    if (!isPlainObject(value)) return {};
    return Object.fromEntries(
        Object.entries(value).filter(
            (entry): entry is [string, DivingFishFullRecord & ObjectValue] =>
                isPlainObject(entry[1]) && recordCanBeLookedUp(entry[1])
        )
    );
}

function lookupRecordList(value: unknown): (DivingFishFullRecord & ObjectValue)[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
        (entry): entry is DivingFishFullRecord & ObjectValue =>
            isPlainObject(entry) && recordCanBeLookedUp(entry)
    );
}

/**
 * Makes the token-free raw user safe for core score helpers without changing the stored/exported
 * source. Web-written users remain deeply equal; unusual records core cannot inspect are omitted.
 */
export function userForCoreScores(input: User): User {
    const root = input as unknown as ObjectValue;
    const sourceData = isPlainObject(root.data) ? root.data : {};
    const data: ObjectValue = { ...sourceData };

    if (Object.hasOwn(sourceData, "detailed")) {
        data.detailed = lookupRecords(sourceData.detailed);
    }
    if (Object.hasOwn(sourceData, "b50")) {
        const sourceB50 = isPlainObject(sourceData.b50) ? sourceData.b50 : {};
        data.b50 = {
            ...sourceB50,
            sd: lookupRecordList(sourceB50.sd),
            dx: lookupRecordList(sourceB50.dx),
        };
    }
    if (Object.hasOwn(sourceData, "ratingHistory")) {
        data.ratingHistory = Array.isArray(sourceData.ratingHistory)
            ? sourceData.ratingHistory.filter(isPlainObject)
            : [];
    }

    return { ...root, data } as unknown as User;
}

/** The key the web app's `convertDetailed` gives a record: its SaltNet music id and `level_index`. */
function detailedKeyOf(record: ObjectValue): string {
    const songId = record.song_id as number;
    const musicId =
        typeof record.type === "string"
            ? getSaltNetMusicIdForChartType(songId, record.type)
            : songId;
    return `${String(musicId)}-${String(record.level_index)}`;
}

function chartsInCatalogOrder(music: SavedMusicList): SavedMusicList["chartList"][number][] {
    return Object.values(music.musicList).flatMap(song => song.charts);
}

/**
 * Assigns records to catalog charts without ever assigning one record or one chart key twice.
 * Exact matches across the whole catalog are assigned first. Then every banquet (utage) chart key
 * takes the record core's lookup shows on the song's first banquet chart, among the records not
 * assigned yet. All banquet charts of a song share one key, so the record core's lookup would also
 * show on a sibling banquet chart gets no second key. Where records compete for one chart, core's
 * lookup decides: the first in key order for an exact match; for a banquet chart the lowest
 * `level_index`, then `ds`, then the first in key order.
 */
export function chartKeysForRecords(
    records: Readonly<Record<string, unknown>>,
    music: SavedMusicList | undefined
): Map<string, string> {
    const result = new Map<string, string>();
    if (!music) return result;

    const entries: [string, DivingFishFullRecord][] = [];
    const keysByRecord = new Map<DivingFishFullRecord, string>();
    for (const [recordKey, value] of Object.entries(records)) {
        if (!isPlainObject(value)) continue;
        if (!recordCanBeLookedUp(value)) continue;
        // Give every map entry its own value so assignment depends on entry order and data, not on
        // whether two entries happen to share the same object in memory.
        const record = { ...value } as DivingFishFullRecord & ObjectValue;
        entries.push([recordKey, record]);
        keysByRecord.set(record, recordKey);
    }
    // Object.fromEntries keeps a key such as "__proto__" as an ordinary entry.
    const lookup = createDetailedScoreLookup(Object.fromEntries(entries));
    if (!lookup) return result;

    const assigned = new Set<string>();
    const assignedCharts = new Set<string>();
    const charts = chartsInCatalogOrder(music);
    for (const chart of charts) {
        const record = lookup.findScoreForChart(chart);
        const recordKey = record && keysByRecord.get(record);
        if (!record || recordKey === undefined || assigned.has(recordKey)) continue;
        const musicId = getSaltNetMusicIdForChartType(record.song_id, record.type);
        if (`${musicId}-${record.level_index}` !== `${chart.music.id}-${chart.info.grade}`)
            continue;
        const chartKey = `${chart.music.id}-${chart.info.grade}`;
        if (assignedCharts.has(chartKey)) continue;
        result.set(recordKey, chartKey);
        assigned.add(recordKey);
        assignedCharts.add(chartKey);
    }
    for (const chart of charts) {
        if (!isUtageGrade(chart.info.grade)) continue;
        const chartKey = `${chart.music.id}-${chart.info.grade}`;
        if (assignedCharts.has(chartKey)) continue;
        const remaining = entries.filter(([recordKey]) => !assigned.has(recordKey));
        // The first banquet chart of a song reaches this point first, and core gives it its first
        // candidate; a sibling with the same key is skipped above once the key is taken.
        const record = createDetailedScoreLookup(Object.fromEntries(remaining))?.findScoreForChart(
            chart
        );
        const recordKey = record && keysByRecord.get(record);
        if (recordKey === undefined || assigned.has(recordKey)) continue;
        result.set(recordKey, chartKey);
        assigned.add(recordKey);
        assignedCharts.add(chartKey);
    }
    return result;
}

function scoreRow(recordKey: string, record: ObjectValue, chartKey: string | null): StoredScoreRow {
    return {
        recordKey,
        chartKey,
        songId: integer(record.song_id),
        type: text(record.type),
        title: text(record.title),
        level: text(record.level),
        levelIndex: integer(record.level_index),
        levelLabel: text(record.level_label),
        ds: real(record.ds),
        achievements: real(record.achievements),
        dxScore: integer(record.dxScore),
        fc: text(record.fc),
        fs: text(record.fs),
        rate: text(record.rate),
        ra: integer(record.ra),
        playCount: integer(record.play_count),
        lastChangedAt: integer(record.lastChangedAt),
    };
}

function member(data: ObjectValue, key: string): number {
    return data[key] === undefined ? 0 : 1;
}

function recordsOf(value: unknown): Record<string, ObjectValue> {
    if (!isPlainObject(value)) return {};
    return Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, ObjectValue] =>
            isPlainObject(entry[1])
        )
    );
}

function b50Rows(data: ObjectValue, music: SavedMusicList | undefined): StoredB50Row[] {
    if (!isPlainObject(data.b50)) return [];
    const pending: {
        section: "sd" | "dx";
        position: number;
        recordKey: string;
        lookupKey: string;
        record: ObjectValue;
    }[] = [];
    for (const section of ["sd", "dx"] as const) {
        const list = data.b50[section];
        if (!Array.isArray(list)) continue;
        list.forEach((value, position) => {
            if (!isPlainObject(value)) return;
            // Without these two the entry has no record key; core's lookup would throw on it.
            if (!convertible(value.song_id) || !convertible(value.level_index)) return;
            pending.push({
                section,
                position,
                recordKey: detailedKeyOf(value),
                lookupKey: `${section}-${position}`,
                record: value,
            });
        });
    }
    const lookupRecords = Object.fromEntries(pending.map(row => [row.lookupKey, row.record]));
    const keys = chartKeysForRecords(lookupRecords, music);
    return pending.map(row => ({
        ...scoreRow(row.recordKey, row.record, keys.get(row.lookupKey) ?? null),
        section: row.section,
        position: row.position,
    }));
}

/** Builds every migration-4 row copied from one validated user. */
export function buildUserRows(
    input: User,
    position: number,
    music: SavedMusicList | undefined
): StoredUserRows {
    // Every copy is read from the stored JSON, so a recomputation from `raw` gives the same rows.
    const raw = JSON.stringify(input);
    const root = JSON.parse(raw) as ObjectValue;
    const data = objectValue(root.data) ?? {};
    const inGame = objectValue(root.inGame) ?? {};
    const divingFish = objectValue(root.divingFish) ?? {};
    const settings = objectValue(root.settings) ?? {};
    const lxns = objectValue(root.lxns);
    const detailed = recordsOf(data.detailed);
    const scoreKeys = chartKeysForRecords(detailed, music);
    const info = isPlainObject(data.info) ? JSON.stringify(data.info) : null;

    const items: StoredItemRow[] = [];
    if (Array.isArray(data.items)) {
        data.items.forEach((list, listIndex) => {
            if (!Array.isArray(list)) return;
            list.forEach((value, itemPosition) => {
                if (!isPlainObject(value)) return;
                items.push({
                    listIndex,
                    position: itemPosition,
                    itemKind: integer(value.itemKind),
                    itemId: integer(value.itemId),
                    stock: integer(value.stock),
                    isValid: bool(value.isValid),
                });
            });
        });
    }

    const characters: StoredCharacterRow[] = [];
    if (Array.isArray(data.characters)) {
        data.characters.forEach((value, characterPosition) => {
            if (!isPlainObject(value)) return;
            characters.push({
                position: characterPosition,
                characterId: integer(value.characterId),
                point: integer(value.point),
                useCount: integer(value.useCount),
                level: integer(value.level),
                nextAwake: integer(value.nextAwake),
                nextAwakePercent: real(value.nextAwakePercent),
                awakening: integer(value.awakening),
            });
        });
    }

    const ratingHistory: StoredRatingHistoryRow[] = [];
    if (Array.isArray(data.ratingHistory)) {
        data.ratingHistory.forEach((value, historyPosition) => {
            if (!isPlainObject(value)) return;
            ratingHistory.push({
                position: historyPosition,
                time: integer(value.time),
                rating: integer(value.rating),
            });
        });
    }

    return {
        user: {
            uid: root.uid as string,
            position,
            raw,
            remark: text(root.remark),
            divingFishName: text(divingFish.name),
            hasLxns: lxns ? 1 : 0,
            lxnsId: integer(lxns?.id),
            lxnsName: text(lxns?.name),
            inGameId: integer(inGame.id),
            inGameName: text(inGame.name),
            inGameEnabled: Number(inGame.enabled),
            inGameFastUpdate: Number(inGame.useFastUpdate),
            manuallyUpdate: Number(settings.manuallyUpdate),
            updatedAt: integer(data.updateTime),
            dataName: text(data.name),
            rating: integer(data.rating),
            info,
            hasDetailed: member(data, "detailed"),
            hasB50: member(data, "b50"),
            hasItems: member(data, "items"),
            hasCharacters: member(data, "characters"),
            hasRatingHistory: member(data, "ratingHistory"),
        },
        scores: Object.entries(detailed).map(([recordKey, record]) =>
            scoreRow(recordKey, record, scoreKeys.get(recordKey) ?? null)
        ),
        b50: b50Rows(data, music),
        items,
        characters,
        ratingHistory,
    };
}
