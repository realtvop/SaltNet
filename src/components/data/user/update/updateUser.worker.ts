// src/utils/updateUserWorker.ts
import { fetchPlayerData } from "@/components/integrations/diving-fish";
import type { DivingFishResponse } from "@/components/integrations/diving-fish/type";
import type {
    RivalPreview,
    UpdateUserResponse,
} from "@/components/data/user/update/updateUser.type";
import { convertDetailed, getUserDisplayName, type User } from "@/components/data/user/type";
import { postAPI, SaltAPIEndpoints } from "@/components/integrations/SaltNet";
import { toHalfWidth } from "@/utils";

self.onmessage = event => {
    const { type, user, updateItem, qrCode } = event.data;
    if (type === "updateUser") {
        let result = null;
        let status = "success";
        let message = "";
        try {
            if (user.inGame.enabled && user.inGame.id && typeof user.inGame.id === "number") {
                fromInGame(user, updateItem).then(data => {
                    result = data;
                    self.postMessage({
                        type: `updateUserResult::${user.uid}`,
                        result,
                        status,
                        message,
                    });
                });
            } else if (user.divingFish.name) {
                fromDFLikeInGame(user).then(data => {
                    result = data;
                    self.postMessage({
                        type: `updateUserResult::${user.uid}`,
                        result,
                        status,
                        message,
                    });
                });
            } else {
                status = "fail";
                self.postMessage({
                    type: `updateUserResult::${user.uid}`,
                    result,
                    status,
                    message,
                });
            }
        } catch (e) {
            self.postMessage({
                type: "updateUserError",
                error: e?.toString?.() || "Unknown error",
            });
        }
    } else if (type === "checkLogin") {
        try {
            checkLogin(user);
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            info(`检查登录状态失败：${errorMsg}`, errorMsg);
        }
    } else if (type === "previewRivals") {
        try {
            getRivalsInfo(user);
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            info(`获取对战好友信息失败：${errorMsg}`, errorMsg);
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

async function fromDivingFish(user: User) {
    info(`正在从水鱼获取用户信息：${user.divingFish.name}`);
    return fetchPlayerData(user.divingFish.name as string)
        .then((data: DivingFishResponse) => {
            info(`从水鱼获取用户信息成功：${user.divingFish.name}`);
            return {
                rating: data.rating,
                b50: data.charts,
                updateTime: Date.now(),
                name: data.nickname,
            };
        })
        .catch(e => {
            info(`从水鱼获取 ${user.divingFish.name} 信息失败：${e.toString()}`, e.toString());
        });
}

async function fromInGame(user: User, updateItem: boolean) {
    info(`正在从 InGame 获取用户信息：${getUserDisplayName(user)}`);
    const data: UpdateUserResponse | null = await fetchInGameData(
        user.inGame.id as number,
        user.divingFish.importToken as string,
        updateItem
    );
    if (data) {
        info(`从 InGame 获取用户信息成功：${getUserDisplayName(user)}`);
        return {
            rating: data.rating,
            name: toHalfWidth(data.userName),
            b50: data.b50,
            detailed: convertDetailed(data.divingFishData),
            updateTime: Date.now(),
            items: data.items || [],
            characters: data.characters || [],
            info: data.info,
        };
    } else {
        info(`从 InGame 获取 ${getUserDisplayName(user)} 信息失败`);
        return null;
    }
}
async function fromDFLikeInGame(user: User) {
    info(`正在从水鱼获取用户详细信息：${getUserDisplayName(user)}`);
    const data: UpdateUserResponse | null = await fetchDFDataLikeInGame(
        user.divingFish.name as string
    );
    if (data) {
        info(`从水鱼获取用户详细信息成功：${getUserDisplayName(user)}`);
        return {
            rating: data.rating,
            name: toHalfWidth(data.userName),
            b50: data.b50,
            detailed: convertDetailed(data.divingFishData),
            updateTime: Date.now(),
        };
    } else {
        return await fromDivingFish(user);
    }
}

function fetchInGameData(
    userId: number,
    importToken?: string,
    updateItem: boolean = false
): Promise<UpdateUserResponse | null> {
    return postAPI(SaltAPIEndpoints.UpdateUser, { userId, importToken, getItems: updateItem })
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

function checkLogin(user: User) {
    const userName = user.data.name ?? user.inGame?.name ?? user.inGame?.id ?? "未知";
    return postAPI(SaltAPIEndpoints.CheckLogin, { userId: user.inGame.id })
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
function getRivalsInfo(user: User) {
    info(`正在获取 ${getUserDisplayName(user)} 的对战好友信息`);
    return postAPI(SaltAPIEndpoints.PreviewRivals, { userId: user.inGame.id })
        .then(r => r.json())
        .then((data: RivalPreview[] | null) => {
            if (data) {
                let description = data
                    .map(rival => `${toHalfWidth(rival.name)} ${rival.rating}`)
                    .join("\n");
                self.postMessage({
                    type: "alert",
                    data: {
                        headline: `${getUserDisplayName(user)} 的对战好友`,
                        description,
                        closeOnOverlayClick: true,
                        closeOnEsc: true,
                    },
                });
            } else {
                info(`获取 ${getUserDisplayName(user)} 的对战好友信息失败`);
                return [];
            }
        })
        .catch(e => {
            info(
                `获取 ${getUserDisplayName(user)} 的对战好友信息失败：${e.toString()}`,
                e.toString()
            );
            return [];
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

function info(message: string, errorMsg?: string) {
    self.postMessage({
        type: "snackbar",
        data: {
            message,
            errorMsg,
        },
    });
}
