// src/utils/updateUserWorker.ts
import { fetchPlayerData } from "@/components/integrations/diving-fish";
import type { DivingFishResponse } from "@/components/integrations/diving-fish/type";
import type { UpdateUserResponse } from "@/components/data/user/update/updateUser.type";
import { convertDetailed, getDisplayName, type User } from "@/components/data/user/type";

self.onmessage = event => {
    const { type, user, updateItem } = event.data;
    if (type === "updateUser") {
        let result = null;
        let status = "success";
        let message = "";
        try {
            if (
                user.inGame.id &&
                typeof user.inGame.id === "number" &&
                user.inGame.id.toString().length === 8
            ) {
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
    info(`正在从 InGame 获取用户信息：${getDisplayName(user)}`);
    const data: UpdateUserResponse | null = await fetchInGameData(
        user.inGame.id as number,
        user.divingFish.importToken as string,
        updateItem
    );
    if (data) {
        info(`从 InGame 获取用户信息成功：${getDisplayName(user)}`);
        return {
            rating: data.rating,
            name: toHalfWidth(data.userName),
            b50: data.b50,
            detailed: convertDetailed(data.divingFishData),
            updateTime: Date.now(),
            items: data.items || [],
            info: data.info,
        };
    } else {
        info(`从 InGame 获取 ${getDisplayName(user)} 信息失败`);
        return null;
    }
}
async function fromDFLikeInGame(user: User) {
    info(`正在从水鱼获取用户详细信息：${getDisplayName(user)}`);
    const data: UpdateUserResponse | null = await fetchDFDataLikeInGame(
        user.divingFish.name as string
    );
    if (data) {
        info(`从水鱼获取用户详细信息成功：${getDisplayName(user)}`);
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
    return fetch(`${import.meta.env.VITE_API_URL}/updateUser`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, importToken, getItems: updateItem }),
    })
        .then(r => r.json())
        .catch(e => {
            info(`获取 InGame 数据失败：${e.toString()}`, e.toString());
            return null;
        });
}
function fetchDFDataLikeInGame(userName: string): Promise<UpdateUserResponse | null> {
    return fetch(`${import.meta.env.VITE_API_URL}/updateUserFromDF`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName }),
    })
        .then(r => r.json())
        .catch(e => {
            info(`获取 InGame 数据失败：${e.toString()}`, e.toString());
            return null;
        });
}

function checkLogin(user: User) {
    const userName = user.data.name ?? user.inGame?.name ?? user.inGame?.id ?? "未知";
    return fetch(`${import.meta.env.VITE_API_URL}/checkLogin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.inGame.id }),
    })
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

function toHalfWidth(str: string): string {
    return str
        .replace(/[\uFF01-\uFF5E]/g, char => {
            return String.fromCharCode(char.charCodeAt(0) - 65248);
        })
        .replace(/\u3000/g, " ");
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
