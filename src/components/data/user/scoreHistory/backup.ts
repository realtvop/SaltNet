import localForage from "localforage";
import type { User } from "../type";
import { normalizeRatingHistory } from "../ratingHistory";
import { ComboStatus, SyncStatus } from "../../maiTypes";
import {
    activateStagedScoreHistoryImport,
    exportScoreHistoryEvents,
    getPendingScoreHistoryImport,
    stageScoreHistoryImport,
} from "./repository";
import { ensureUniqueUserUids } from "./userIdentity";
import {
    SCORE_HISTORY_SCHEMA_VERSION,
    type ScoreHistoryEventV1,
    type ScoreHistorySource,
    type ScoreHistoryStateV1,
} from "./type";

interface UserDataBackupV1 {
    version: 1;
    exportedAt: number;
    tip: string;
    users: string;
    scoreHistory?: {
        schemaVersion: 1;
        encoding: "base64-json";
        eventCount: number;
        data: string;
    };
}

export interface DecodedUserDataBackup {
    users: User[];
    events: ScoreHistoryEventV1[];
}

function encodeUtf8Base64(value: unknown): string {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
}

function decodeUtf8Base64<T>(value: unknown): T {
    if (typeof value !== "string") throw new Error("备份编码无效");
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isState(value: unknown): value is ScoreHistoryStateV1 {
    if (!value || typeof value !== "object") return false;
    const state = value as Partial<ScoreHistoryStateV1>;
    return (
        isFiniteNumber(state.achievements) &&
        state.achievements >= 0 &&
        isFiniteNumber(state.dxScore) &&
        Number.isInteger(state.dxScore) &&
        state.dxScore >= 0 &&
        Object.values(ComboStatus).includes(state.fc as ComboStatus) &&
        Object.values(SyncStatus).includes(state.fs as SyncStatus) &&
        (state.playCount === null ||
            (isFiniteNumber(state.playCount) &&
                Number.isInteger(state.playCount) &&
                state.playCount >= 0))
    );
}

const VALID_SOURCES = new Set<ScoreHistorySource>([
    "inGame",
    "lxns",
    "divingFishImport",
    "divingFishPublic",
]);

function validateEvents(value: unknown, userUids: Set<string>): ScoreHistoryEventV1[] {
    if (!Array.isArray(value)) throw new Error("成绩历史不是数组");
    const ids = new Set<string>();
    const logicalIds = new Set<string>();
    return value.map(raw => {
        if (!raw || typeof raw !== "object") throw new Error("成绩历史事件无效");
        const event = raw as Partial<ScoreHistoryEventV1>;
        if (
            typeof event.id !== "string" ||
            ids.has(event.id) ||
            event.schemaVersion !== SCORE_HISTORY_SCHEMA_VERSION ||
            typeof event.userUid !== "string" ||
            !userUids.has(event.userUid) ||
            typeof event.chartKey !== "string" ||
            !/^\d+-\d+$/.test(event.chartKey) ||
            typeof event.batchId !== "string" ||
            !isFiniteNumber(event.observedAt) ||
            event.observedAt < 0 ||
            !Number.isInteger(event.sequence) ||
            (event.sequence as number) < 0 ||
            !VALID_SOURCES.has(event.source as ScoreHistorySource) ||
            (event.kind !== "initial" && event.kind !== "change") ||
            !Number.isInteger(event.changedMask) ||
            (event.changedMask as number) < 0 ||
            (event.changedMask as number) > 31 ||
            (event.kind === "initial" && event.changedMask !== 0) ||
            (event.kind === "change" && event.changedMask === 0) ||
            !isState(event.state)
        ) {
            throw new Error("成绩历史事件字段无效");
        }
        const logicalId = `${event.userUid}:${event.batchId}:${event.chartKey}:${event.sequence}:${event.kind}`;
        if (logicalIds.has(logicalId)) throw new Error("成绩历史事件重复");
        ids.add(event.id);
        logicalIds.add(logicalId);
        return event as ScoreHistoryEventV1;
    });
}

function decodeUsers(value: unknown): User[] {
    const users = decodeUtf8Base64<unknown>(value);
    if (!Array.isArray(users)) throw new Error("用户数据不是数组");
    if (
        users.some(
            user =>
                !user ||
                typeof user !== "object" ||
                !("data" in user) ||
                !user.data ||
                typeof user.data !== "object" ||
                !("inGame" in user) ||
                !user.inGame ||
                typeof user.inGame !== "object" ||
                !("divingFish" in user) ||
                !user.divingFish ||
                typeof user.divingFish !== "object"
        )
    ) {
        throw new Error("用户数据结构无效");
    }
    return users as User[];
}

function normalizeDecodedUsers(users: User[], requireExistingUid: boolean): User[] {
    return ensureUniqueUserUids(users, requireExistingUid).map(user => {
        const hasValidInGameId =
            typeof user.inGame?.id === "number" &&
            Number.isFinite(user.inGame.id) &&
            user.inGame.id.toString().length === 8;
        return {
            ...user,
            inGame: {
                ...user.inGame,
                enabled: Boolean(user.inGame?.enabled ?? hasValidInGameId),
                useFastUpdate: Boolean(user.inGame?.useFastUpdate ?? false),
            },
            settings: {
                manuallyUpdate: user.settings?.manuallyUpdate ?? false,
            },
            data: {
                ...user.data,
                ratingHistory: normalizeRatingHistory(user),
            },
        };
    });
}

export async function createUserDataBackup(users: User[]): Promise<UserDataBackupV1> {
    const events = await exportScoreHistoryEvents();
    return {
        version: 1,
        exportedAt: Date.now(),
        tip: "为简单保护用户id，以下内容使用base64编码",
        users: encodeUtf8Base64(users),
        scoreHistory: {
            schemaVersion: SCORE_HISTORY_SCHEMA_VERSION,
            encoding: "base64-json",
            eventCount: events.length,
            data: encodeUtf8Base64(events),
        },
    };
}

export function decodeUserDataBackup(value: unknown): DecodedUserDataBackup {
    if (!value || typeof value !== "object") throw new Error("备份文件无效");
    const backup = value as Record<string, unknown>;
    if (backup.version !== 0 && backup.version !== 1) throw new Error("不支持的备份版本");
    if (backup.version === 1 && (!isFiniteNumber(backup.exportedAt) || backup.exportedAt < 0)) {
        throw new Error("备份导出时间无效");
    }

    const decodedUsers = decodeUsers(backup.users);
    const history = backup.version === 1 ? backup.scoreHistory : undefined;
    if (history === undefined) {
        return { users: normalizeDecodedUsers(decodedUsers, false), events: [] };
    }
    if (!history || typeof history !== "object") throw new Error("成绩历史区块无效");
    const historyBlock = history as Record<string, unknown>;
    if (
        historyBlock.schemaVersion !== SCORE_HISTORY_SCHEMA_VERSION ||
        historyBlock.encoding !== "base64-json" ||
        !Number.isInteger(historyBlock.eventCount) ||
        (historyBlock.eventCount as number) < 0
    ) {
        throw new Error("不支持的成绩历史格式");
    }

    const users = normalizeDecodedUsers(decodedUsers, true);
    const events = validateEvents(
        decodeUtf8Base64<unknown>(historyBlock.data),
        new Set(users.map(user => user.uid as string))
    );
    if (events.length !== historyBlock.eventCount) throw new Error("成绩历史数量不一致");
    return { users, events };
}

export async function replaceImportedUserData(
    users: User[],
    events: ScoreHistoryEventV1[]
): Promise<void> {
    const usersJson = JSON.stringify(users);
    const pending = await stageScoreHistoryImport(events, usersJson);
    await localForage.setItem("users", users);
    await activateStagedScoreHistoryImport(pending.generationId);
}

export async function recoverPendingUserDataImport(): Promise<void> {
    const pending = await getPendingScoreHistoryImport();
    if (!pending) return;
    const users = JSON.parse(pending.usersJson) as User[];
    await localForage.setItem("users", users);
    await activateStagedScoreHistoryImport(pending.generationId);
}
