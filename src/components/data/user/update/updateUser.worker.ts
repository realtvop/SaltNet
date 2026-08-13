// src/utils/updateUserWorker.ts
import {
    fetchPlayerData,
    fetchPlayerRecordsByImportToken,
    calculateB50FromRecords,
} from "@/components/integrations/diving-fish/player";
import type {
    DivingFishFullRecord,
    DivingFishResponse,
} from "@/components/integrations/diving-fish/type";
import type { UpdateUserResponse } from "@/components/data/user/update/updateUser.type";
import { convertDetailed, getUserDisplayName, type User } from "@/components/data/user/type";
import { postAPI, SaltAPIEndpoints } from "@/components/integrations/SaltNet";
import { fetchLXNSScore } from "@/components/integrations/lxns/fetchScore";
import { uploadScoresToLXNS } from "@/components/integrations/lxns/uploadScore";
import { toHalfWidth } from "@/utils/toHalfWidth";
import { migrateB50, migrateRecordList, supplementRecordList, supplementB50 } from "./migrateData";

self.onmessage = event => {
    const { type, user, qrCode, requestId } = event.data;
    if (type === "updateUser") {
        try {
            if (user.inGame.enabled) {
                runUserUpdate(fromInGame(user, qrCode), requestId);
            } else if (user.lxns?.auth?.accessToken) {
                runUserUpdate(fromLXNS(user), requestId);
            } else if (user.divingFish.importToken) {
                runUserUpdate(fromDivingFishByImportToken(user), requestId);
            } else if (user.divingFish.name) {
                runUserUpdate(fromDFLikeInGame(user), requestId);
            } else {
                self.postMessage({
                    type: "updateUserResult",
                    requestId,
                    result: null,
                    status: "fail",
                    message: "没有可用的成绩数据源",
                });
            }
        } catch (e) {
            self.postMessage({
                type: "updateUserError",
                requestId,
                error: e?.toString?.() || "Unknown error",
            });
        }
    } else if (type === "checkLogin") {
        try {
            checkLogin(user, qrCode);
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            info(`检查登录状态失败：${errorMsg}`, errorMsg);
        }
    } else if (type === "clearIllegalTickets") {
        try {
            clearIllegalTickets(user, qrCode);
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            info(`清理非法倍券失败：${errorMsg}`, errorMsg);
        }
    } else if (type === "previewStockedTickets") {
        try {
            previewStockedTickets(user);
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            info(`获取倍券失败：${errorMsg}`, errorMsg);
        }
    }
};

function runUserUpdate(update: Promise<unknown>, requestId: string): void {
    void update
        .then(result => {
            self.postMessage({
                type: "updateUserResult",
                requestId,
                result,
                status: result ? "success" : "fail",
                message: "",
            });
        })
        .catch(error => {
            self.postMessage({
                type: "updateUserError",
                requestId,
                error: error instanceof Error ? error.message : String(error),
            });
        });
}

async function fromLXNS(user: User) {
    info(`正在从落雪获取用户信息：${getUserDisplayName(user)}`);
    try {
        const data = await fetchLXNSScore(user);
        const existingScores = getExistingScoreData(user);
        const detailedRecords = migrateRecordList(
            existingScores,
            Object.values(data.scores),
            data.updateTime
        );
        info(`从落雪获取用户信息成功：${getUserDisplayName(user)}`);
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
        info(`从落雪获取 ${getUserDisplayName(user)} 信息失败：${errorMsg}`, errorMsg);
        return null;
    }
}

async function fromDivingFish(user: User) {
    info(`正在从水鱼获取用户信息：${user.divingFish.name}`);
    return fetchPlayerData(user.divingFish.name as string)
        .then((data: DivingFishResponse) => {
            const updateTime = Date.now();
            info(`从水鱼获取用户信息成功：${user.divingFish.name}`);
            return {
                rating: data.rating,
                b50: migrateB50(getExistingScoreData(user), data.charts, updateTime),
                updateTime,
                name: data.nickname,
                scoreHistorySource: "divingFishPublic",
            };
        })
        .catch(e => {
            info(`从水鱼获取 ${user.divingFish.name} 信息失败：${e.toString()}`, e.toString());
        });
}

async function fromInGame(user: User, qrCodeInput?: string) {
    info(`正在从 InGame 获取用户信息：${getUserDisplayName(user)}`);
    const qrCode = qrCodeInput ? normalizeQrCodeFromInput(qrCodeInput) : null;
    console.log(qrCode);
    if ((qrCodeInput || !user.inGame?.id) && !qrCode) {
        info(`从 InGame 获取 ${getUserDisplayName(user)} 信息失败，二维码无效`);
        return null;
    }
    const isFastUpdate = !qrCode;
    const data: UpdateUserResponse | null = await fetchInGameData(
        user.inGame.id as number,
        "",
        qrCode ?? undefined
    );
    if (!data) {
        info(`从 InGame 获取 ${getUserDisplayName(user)} 信息失败`);
        return null;
    }
    info(`从 InGame 获取用户信息成功：${getUserDisplayName(user)}`);

    let supplementRecords: DivingFishFullRecord[] | null = null;
    if (isFastUpdate) {
        if (user.lxns?.auth?.accessToken) {
            info(`正在从落雪补充 ${getUserDisplayName(user)} 的数据`);
            try {
                const lxnsResult = await fetchLXNSScore(user);
                supplementRecords = lxnsResult.scores ? Object.values(lxnsResult.scores) : null;
                if (supplementRecords) info(`从落雪补充数据成功`);
            } catch (e) {
                const errorMsg = e?.toString?.() || "Unknown error";
                info(`从落雪补充数据失败：${errorMsg}`, errorMsg);
            }
        }
        if (!supplementRecords && user.divingFish?.importToken) {
            info(`正在从水鱼补充 ${getUserDisplayName(user)} 的数据`);
            try {
                const dfResult = await fetchPlayerRecordsByImportToken(user.divingFish.importToken);
                supplementRecords = dfResult.records;
                info(`从水鱼补充数据成功`);
            } catch (e) {
                const errorMsg = e?.toString?.() || "Unknown error";
                info(`从水鱼补充数据失败：${errorMsg}`, errorMsg);
            }
        }
    }

    const mergedData = supplementRecords
        ? supplementRecordList(data.divingFishData, supplementRecords)
        : data.divingFishData;
    const updateTime = Date.now();
    const existingScores = getExistingScoreData(user);
    const divingFishData = migrateRecordList(existingScores, mergedData, updateTime);

    if (user.divingFish.importToken) {
        info(`正在上传 ${getUserDisplayName(user)} 的数据到水鱼`);
        uploadToDivingFish(data.divingFishData, user.divingFish.importToken);
    }
    if (user.lxns?.auth?.accessToken) {
        info(`正在同步 ${getUserDisplayName(user)} 的数据到落雪`);
        uploadToLXNS(data.divingFishData, user);
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
async function fromDFLikeInGame(user: User) {
    info(`正在从水鱼获取用户详细信息：${getUserDisplayName(user)}`);
    const data: UpdateUserResponse | null = await fetchDFDataLikeInGame(
        user.divingFish.name as string
    );
    if (data) {
        const updateTime = Date.now();
        const existingScores = getExistingScoreData(user);
        const divingFishData = migrateRecordList(existingScores, data.divingFishData, updateTime);
        info(`从水鱼获取用户详细信息成功：${getUserDisplayName(user)}`);
        return {
            rating: data.rating,
            name: toHalfWidth(data.userName),
            b50: migrateB50(existingScores, data.b50, updateTime),
            detailed: convertDetailed(divingFishData),
            updateTime,
            scoreHistorySource: "divingFishPublic",
        };
    } else {
        return await fromDivingFish(user);
    }
}

async function fromDivingFishByImportToken(user: User) {
    info(`正在从水鱼获取用户信息（Import-Token）：${getUserDisplayName(user)}`);
    try {
        const data = await fetchPlayerRecordsByImportToken(user.divingFish.importToken as string);
        const b50 = await calculateB50FromRecords(data.records);
        const updateTime = Date.now();
        const existingScores = getExistingScoreData(user);
        const detailedRecords = migrateRecordList(existingScores, data.records, updateTime);
        info(`从水鱼获取用户信息成功：${getUserDisplayName(user)}`);
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
        info(`从水鱼获取用户信息失败：${errorMsg}`, errorMsg);
        return null;
    }
}

function getExistingScoreData(user: User) {
    if (user.data.detailed) return user.data.detailed;
    if (!user.data.b50) return undefined;
    return convertDetailed([...user.data.b50.sd, ...user.data.b50.dx]);
}

function fetchInGameData(
    userId: number,
    importToken?: string,
    qrCode?: string
): Promise<UpdateUserResponse | null> {
    return postAPI(SaltAPIEndpoints.UpdateUser, {
        userId,
        importToken,
        ...(qrCode ? { qrCode } : {}),
    })
        .then(r => r.json())
        .catch(e => {
            info(`获取 InGame 数据失败：${e.toString()}`, e.toString());
            return null;
        });
}
function fetchDFDataLikeInGame(userName: string): Promise<UpdateUserResponse | null> {
    return postAPI(SaltAPIEndpoints.UpdateUserFromDivingFish, { userName })
        .then(r => r.json())
        .catch(e => {
            info(`获取 InGame 数据失败：${e.toString()}`, e.toString());
            return null;
        });
}

function checkLogin(user: User, qrCodeInput?: string) {
    const userName = user.data.name ?? user.inGame?.name ?? user.inGame?.id ?? "未知";
    const qrCode = normalizeQrCodeFromInput(qrCodeInput);
    if (!qrCode) {
        info(`检查登录状态失败：${userName}，二维码无效`);
        return;
    }
    return postAPI(SaltAPIEndpoints.CheckLogin, { qrCode })
        .then(r => r.json())
        .then((data: { isLogin: string } | null) => {
            if (data) {
                self.postMessage({
                    type: "alert",
                    data: {
                        headline: `${userName}`,
                        description: data.isLogin ? "上机了哟！" : "还没有上机",
                        closeOnOverlayClick: true,
                        closeOnEsc: true,
                    },
                });
            } else {
                info(`从 InGame 获取信息失败：${userName}`);
            }
        })
        .catch(e => {
            info(`获取 InGame 数据失败：${userName} - ${e.toString()}`, e.toString());
        });
}
function normalizeQrCodeFromInput(raw?: string): string | null {
    const value = raw?.trim();
    if (!value) return null;
    if (value.startsWith("SGWCMAID") && value.length >= 64) return value.slice(-64);
    if (value.startsWith("http")) {
        const matches = value.match(/MAID.{0,76}/g);
        if (matches?.[0]) return matches[0].slice(-64);
        return null;
    }
    if (value.length >= 64) return value.slice(-64);
    return null;
}
function clearIllegalTickets(user: User, qrCodeInput?: string) {
    const userName = getUserDisplayName(user);
    const qrCode = normalizeQrCodeFromInput(qrCodeInput);
    if (!qrCode) {
        info(`清理 ${userName} 的非法倍券失败，二维码无效`);
        return;
    }
    info(`正在清理 ${userName} 的非法倍券，请稍等约1分钟`);
    return postAPI(SaltAPIEndpoints.ClearIllegalTickets, { qrCode })
        .then(r => {
            if (r.ok) info(`已清理 ${userName} 的非法倍券`);
            else info(`清理 ${userName} 的非法倍券失败，请检查是否已获取二维码或已被登录`);
        })
        .catch(e => {
            info(`清理 ${userName} 的非法倍券失败: ${e.toString()}`, e.toString());
        });
}
function previewStockedTickets(user: User) {
    const userName = getUserDisplayName(user);
    info(`正在获取 ${userName} 的倍券`);
    return postAPI(SaltAPIEndpoints.GetStockedTickets, { userId: user.inGame?.id })
        .then(r => r.json())
        .then(
            (
                data:
                    | {
                          chargeId: number;
                          stock: number;
                          purchaseDate: string;
                          validDate: string;
                          extNum1: number;
                      }[]
                    | null
            ) => {
                if (data) {
                    let description = "";
                    for (const ticket of data) {
                        description += `${ticket.chargeId} 倍券：${ticket.stock} 张\n    购买日期： ${ticket.purchaseDate}\n    有效期至： ${ticket.validDate}\n\n`;
                    }
                    if (description === "") description = "没有倍券";
                    if (description.endsWith("\n\n")) description = description.slice(0, -2);
                    self.postMessage({
                        type: "alert",
                        data: {
                            headline: `${userName} 的倍券`,
                            description,
                            closeOnOverlayClick: true,
                            closeOnEsc: true,
                        },
                    });
                } else {
                    info(`获取 ${userName} 的倍券失败`);
                    return [];
                }
            }
        )
        .catch(e => {
            info(`获取 ${userName} 的倍券失败：${e.toString()}`, e.toString());
            return [];
        });
}

function uploadToDivingFish(data: DivingFishFullRecord[], importToken: string) {
    return fetch("https://www.diving-fish.com/api/maimaidxprober/player/update_records", {
        method: "POST",
        headers: {
            "Import-Token": importToken,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
    })
        .then(() => {
            info(`上传到水鱼成功`);
        })
        .catch(e => {
            info(`上传到水鱼失败：${e.toString()}`, e.toString());
        });
}

function uploadToLXNS(data: DivingFishFullRecord[], user: User) {
    return uploadScoresToLXNS(user, data)
        .then(() => {
            info(`同步到落雪成功`);
        })
        .catch(e => {
            info(`同步到落雪失败：${e.toString()}`, e.toString());
        });
}

function info(message: string, errorMsg?: string) {
    self.postMessage({
        type: "snackbar",
        data: {
            message,
            errorMsg,
        },
    });
}
