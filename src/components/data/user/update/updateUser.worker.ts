// src/utils/updateUserWorker.ts
import type { DivingFishFullRecord } from "@core/integrations/diving-fish/type";
import type { SyncOptions } from "@core/sync/type";
import type { User } from "@core/user/type";
import { uploadDivingFishRecords } from "@core/integrations/diving-fish/client";
import { normalizeQrCodeFromInput } from "@core/sync/qrCode";
import {
    chooseSyncSource,
    syncFromDivingFishImportToken,
    syncFromDivingFishName,
    syncFromInGame,
    syncFromLXNS,
} from "@core/sync/sync";
import { getUserDisplayName } from "@core/user/type";
import {
    calculateB50FromRecords,
    fetchPlayerData,
    fetchPlayerRecordsByImportToken,
} from "@/components/integrations/diving-fish/player";
import { fetchLXNSScore } from "@/components/integrations/lxns/fetchScore";
import { uploadScoresToLXNS } from "@/components/integrations/lxns/uploadScore";
import { postAPI, postAPIJSON, SaltAPIEndpoints } from "@/components/integrations/SaltNet";

const syncOptions: SyncOptions = {
    clients: {
        calculateB50FromRecords,
        fetchDivingFishPlayer: fetchPlayerData,
        fetchDivingFishRecords: fetchPlayerRecordsByImportToken,
        fetchLXNSScore,
        postGameAPIJSON: postAPIJSON,
    },
    report: info,
    uploadToDivingFish,
    uploadToLXNS,
};

self.onmessage = event => {
    const { type, user, qrCode, requestId } = event.data;
    if (type === "updateUser") {
        try {
            const source = chooseSyncSource(user);
            if (source === "inGame") {
                console.log(qrCode ? normalizeQrCodeFromInput(qrCode) : null);
                runUserUpdate(syncFromInGame(user, qrCode, syncOptions), requestId);
            } else if (source === "lxns") {
                runUserUpdate(syncFromLXNS(user, syncOptions), requestId);
            } else if (source === "divingFishImportToken") {
                runUserUpdate(syncFromDivingFishImportToken(user, syncOptions), requestId);
            } else if (source === "divingFishName") {
                runUserUpdate(syncFromDivingFishName(user, syncOptions), requestId);
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

function checkLogin(user: User, qrCodeInput?: string) {
    const userName = user.data.name ?? user.inGame?.name ?? user.inGame?.id ?? "未知";
    const qrCode = normalizeQrCodeFromInput(qrCodeInput);
    if (!qrCode) {
        info(`检查登录状态失败：${userName}，二维码无效`);
        return;
    }
    return postAPIJSON(SaltAPIEndpoints.CheckLogin, { qrCode })
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
            info(e instanceof Error ? e.message : "请求游戏API失败，请稍候重试");
        });
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
        .then(() => info(`已清理 ${userName} 的非法倍券`))
        .catch(e => {
            info(e instanceof Error ? e.message : "请求游戏API失败，请稍候重试");
        });
}

function previewStockedTickets(user: User) {
    const userName = getUserDisplayName(user);
    info(`正在获取 ${userName} 的倍券`);
    return postAPIJSON(SaltAPIEndpoints.GetStockedTickets, { userId: user.inGame?.id })
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
            info(e instanceof Error ? e.message : "请求游戏API失败，请稍候重试");
            return [];
        });
}

function uploadToDivingFish(data: DivingFishFullRecord[], importToken: string) {
    return uploadDivingFishRecords(importToken, data)
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
