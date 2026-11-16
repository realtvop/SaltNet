import type { DivingFishFullRecord, DivingFishResponse } from "../integrations/diving-fish/type";
import type { DetailedData, User } from "../user/type";
import type {
    SyncClients,
    SyncOptions,
    SyncSourceKind,
    SyncUpdate,
    UpdateUserResponse,
} from "./type";
import { SaltAPIEndpoints } from "../integrations/saltnet/client";
import {
    migrateB50,
    migrateRecordList,
    supplementB50,
    supplementRecordList,
} from "../user/migrateData";
import { convertDetailed, getUserDisplayName } from "../user/type";
import { toHalfWidth } from "../util/toHalfWidth";
import { normalizeQrCodeFromInput } from "./qrCode";

export function chooseSyncSource(user: User): SyncSourceKind | null {
    if (user.inGame.enabled) {
        return "inGame";
    } else if (user.lxns?.auth?.accessToken) {
        return "lxns";
    } else if (user.divingFish.importToken) {
        return "divingFishImportToken";
    } else if (user.divingFish.name) {
        return "divingFishName";
    } else {
        return null;
    }
}

export function existingScoresForSync(user: User): DetailedData | undefined {
    if (user.data.detailed) return user.data.detailed;
    if (!user.data.b50) return undefined;
    return convertDetailed([...user.data.b50.sd, ...user.data.b50.dx]);
}

function fetchInGameData(
    clients: SyncClients,
    userId: number,
    importToken?: string,
    qrCode?: string
): Promise<UpdateUserResponse | null> {
    return clients.postGameAPIJSON<UpdateUserResponse | null>(SaltAPIEndpoints.UpdateUser, {
        userId,
        importToken,
        ...(qrCode ? { qrCode } : {}),
    });
}

export async function syncFromInGame(
    user: User,
    qrCodeInput: string | undefined,
    options: SyncOptions
): Promise<SyncUpdate | null> {
    options.report?.(`正在从 InGame 获取用户信息：${getUserDisplayName(user)}`);
    const qrCode = qrCodeInput ? normalizeQrCodeFromInput(qrCodeInput) : null;
    if ((qrCodeInput || !user.inGame?.id) && !qrCode) {
        options.report?.(`从 InGame 获取 ${getUserDisplayName(user)} 信息失败，二维码无效`);
        return null;
    }
    const isFastUpdate = !qrCode;
    const data: UpdateUserResponse | null = await fetchInGameData(
        options.clients,
        user.inGame.id as number,
        "",
        qrCode ?? undefined
    );
    if (!data) {
        options.report?.(`从 InGame 获取 ${getUserDisplayName(user)} 信息失败`);
        return null;
    }
    options.report?.(`从 InGame 获取用户信息成功：${getUserDisplayName(user)}`);

    let supplementRecords: DivingFishFullRecord[] | null = null;
    if (isFastUpdate) {
        if (user.lxns?.auth?.accessToken) {
            options.report?.(`正在从落雪补充 ${getUserDisplayName(user)} 的数据`);
            try {
                const lxnsResult = await options.clients.fetchLXNSScore(user);
                supplementRecords = lxnsResult.scores ? Object.values(lxnsResult.scores) : null;
                if (supplementRecords) options.report?.("从落雪补充数据成功");
            } catch (e) {
                const errorMsg = e?.toString?.() || "Unknown error";
                options.report?.(`从落雪补充数据失败：${errorMsg}`, errorMsg);
            }
        }
        if (!supplementRecords && user.divingFish?.importToken) {
            options.report?.(`正在从水鱼补充 ${getUserDisplayName(user)} 的数据`);
            try {
                const dfResult = await options.clients.fetchDivingFishRecords(
                    user.divingFish.importToken
                );
                supplementRecords = dfResult.records;
                options.report?.("从水鱼补充数据成功");
            } catch (e) {
                const errorMsg = e?.toString?.() || "Unknown error";
                options.report?.(`从水鱼补充数据失败：${errorMsg}`, errorMsg);
            }
        }
    }

    const mergedData = supplementRecords
        ? supplementRecordList(data.divingFishData, supplementRecords)
        : data.divingFishData;
    const now = options.now ?? Date.now;
    const updateTime = now();
    const existingScores = existingScoresForSync(user);
    const divingFishData = migrateRecordList(existingScores, mergedData, updateTime);

    if (user.divingFish.importToken && options.uploadToDivingFish) {
        options.report?.(`正在上传 ${getUserDisplayName(user)} 的数据到水鱼`);
        options.uploadToDivingFish(data.divingFishData, user.divingFish.importToken);
    }
    if (user.lxns?.auth?.accessToken && options.uploadToLXNS) {
        options.report?.(`正在同步 ${getUserDisplayName(user)} 的数据到落雪`);
        options.uploadToLXNS(data.divingFishData, user);
    }

    const mergedB50 = supplementRecords ? supplementB50(data.b50, supplementRecords) : data.b50;

    return {
        userId: data.userId || user.inGame.id,
        rating: data.rating,
        name: toHalfWidth(data.userName),
        b50: migrateB50(existingScores, mergedB50, updateTime),
        detailed: convertDetailed(divingFishData),
        updateTime,
        items: data.items || [],
        characters: data.characters || [],
        info: data.info,
        scoreHistorySource: "inGame",
    };
}

export async function syncFromLXNS(user: User, options: SyncOptions): Promise<SyncUpdate | null> {
    options.report?.(`正在从落雪获取用户信息：${getUserDisplayName(user)}`);
    try {
        const data = await options.clients.fetchLXNSScore(user);
        const existingScores = existingScoresForSync(user);
        const detailedRecords = migrateRecordList(
            existingScores,
            Object.values(data.scores),
            data.updateTime
        );
        options.report?.(`从落雪获取用户信息成功：${getUserDisplayName(user)}`);
        return {
            rating: data.rating,
            name: data.name,
            b50: migrateB50(existingScores, data.b50, data.updateTime),
            detailed: convertDetailed(detailedRecords),
            updateTime: data.updateTime,
            lxns: user.lxns,
            scoreHistorySource: "lxns",
        };
    } catch (e) {
        const errorMsg = e?.toString?.() || "Unknown error";
        options.report?.(`从落雪获取 ${getUserDisplayName(user)} 信息失败：${errorMsg}`, errorMsg);
        return null;
    }
}

export async function syncFromDivingFishPublic(
    user: User,
    options: SyncOptions
): Promise<SyncUpdate | undefined> {
    options.report?.(`正在从水鱼获取用户信息：${user.divingFish.name}`);
    return options.clients
        .fetchDivingFishPlayer(user.divingFish.name as string)
        .then((data: DivingFishResponse): SyncUpdate => {
            const now = options.now ?? Date.now;
            const updateTime = now();
            options.report?.(`从水鱼获取用户信息成功：${user.divingFish.name}`);
            return {
                rating: data.rating,
                b50: migrateB50(existingScoresForSync(user), data.charts, updateTime),
                updateTime,
                name: data.nickname,
                scoreHistorySource: "divingFishPublic",
            };
        })
        .catch(e => {
            options.report?.(
                `从水鱼获取 ${user.divingFish.name} 信息失败：${e.toString()}`,
                e.toString()
            );
            return undefined;
        });
}

function fetchDFDataLikeInGame(
    options: SyncOptions,
    userName: string
): Promise<UpdateUserResponse | null> {
    return options.clients
        .postGameAPIJSON<UpdateUserResponse>(SaltAPIEndpoints.UpdateUserFromDivingFish, {
            userName,
        })
        .catch(e => {
            options.report?.(`获取 InGame 数据失败：${e.toString()}`, e.toString());
            return null;
        });
}

export async function syncFromDivingFishName(
    user: User,
    options: SyncOptions
): Promise<SyncUpdate | undefined> {
    options.report?.(`正在从水鱼获取用户详细信息：${getUserDisplayName(user)}`);
    const data: UpdateUserResponse | null = await fetchDFDataLikeInGame(
        options,
        user.divingFish.name as string
    );
    if (data) {
        const now = options.now ?? Date.now;
        const updateTime = now();
        const existingScores = existingScoresForSync(user);
        const divingFishData = migrateRecordList(existingScores, data.divingFishData, updateTime);
        options.report?.(`从水鱼获取用户详细信息成功：${getUserDisplayName(user)}`);
        return {
            rating: data.rating,
            name: toHalfWidth(data.userName),
            b50: migrateB50(existingScores, data.b50, updateTime),
            detailed: convertDetailed(divingFishData),
            updateTime,
            scoreHistorySource: "divingFishPublic",
        };
    } else {
        return await syncFromDivingFishPublic(user, options);
    }
}

export async function syncFromDivingFishImportToken(
    user: User,
    options: SyncOptions
): Promise<SyncUpdate | null> {
    options.report?.(`正在从水鱼获取用户信息（Import-Token）：${getUserDisplayName(user)}`);
    try {
        const data = await options.clients.fetchDivingFishRecords(
            user.divingFish.importToken as string
        );
        const b50 = await options.clients.calculateB50FromRecords(data.records);
        const now = options.now ?? Date.now;
        const updateTime = now();
        const existingScores = existingScoresForSync(user);
        const detailedRecords = migrateRecordList(existingScores, data.records, updateTime);
        options.report?.(`从水鱼获取用户信息成功：${getUserDisplayName(user)}`);
        return {
            rating: data.rating,
            name: toHalfWidth(data.nickname),
            b50: migrateB50(existingScores, b50, updateTime),
            detailed: convertDetailed(detailedRecords),
            updateTime,
            scoreHistorySource: "divingFishImport",
        };
    } catch (e) {
        const errorMsg = e?.toString?.() || "Unknown error";
        options.report?.(`从水鱼获取用户信息失败：${errorMsg}`, errorMsg);
        return null;
    }
}
