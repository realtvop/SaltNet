import { fetchPlayerData } from "@/divingfish";
import type { DivingFishResponse } from "@/divingfish/type";
import type { UpdateUserResponse } from "@/types/updateUser";
import { convertDetailed, type User } from "@/types/user";

import { Snackbar, snackbar, alert } from "mdui";

// let songs = null;

export function updateUser(user: User) {
    if (!user.data) user.data = {};

    if (user.inGame.id) {
        if (typeof user.inGame.id == "number" && user.inGame.id.toString().length == 8)
            return fromInGame(user);
        else {
            info("用户 ID 错误，请检查配置"); 
            return fromDivingFish(user);
        }
    } else
        return fromDivingFish(user);
}
export function checkLogin(user: User) {
    info(`正在从 InGame 获取用户信息：${user.inGame.name ?? user.divingFish.name}`);
    return fetch("https://salt_api_backup.realtvop.top/checkLogin", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify({ userId: user.inGame.id }),
    })
        .then(r => r.json())
        .then((data: { isLogin: string } | null) => {
            if (data) {
                alert({
                    headline: (user.inGame.name ?? user.divingFish.name) as string,
                    description: data.isLogin ? "上机了哟！" : "还没有上机",
                    closeOnEsc: true,
                    closeOnOverlayClick: true,
                });
            } else {
                info(`从 InGame 获取 ${user.inGame.name ?? user.divingFish.name} 信息失败`);
            }
        })
        .catch(e => {
            info(`获取 ${user.inGame.name ?? user.divingFish.name} InGame 数据失败：${e.toString()}`, e.toString());
        });
}

// 水鱼
function fromDivingFish(user: User) {
    if (user.divingFish.name) {
        info(`正在从水鱼获取用户信息：${user.divingFish.name}`);
        return fetchPlayerData(user.divingFish.name as string)
            .then((data: DivingFishResponse) => {
                user.data.rating = data.rating;
                user.data.b50 = data.charts;
                info(`从水鱼获取用户信息成功：${user.divingFish.name}`);
            })
            .catch(e => {
                info(`从水鱼获取 ${user.divingFish.name} 信息失败：${e.toString()}`, e.toString());
            });
        }
    else info("用户数据为空？？？如配置没有错误，请反馈");
}

// InGame 数据
function fromInGame(user: User) {
    info(`正在从 InGame 获取用户信息：${user.inGame.name ?? user.divingFish.name}`);
    return fetchInGameData(user.inGame.id as number, user.divingFish.importToken as string)
        .then((data: UpdateUserResponse | null) => {
            if (data) {
                user.data.rating = data.rating;
                user.inGame.name = toHalfWidth(data.userName);
                user.data.b50 = data.b50;
                user.data.detailed = convertDetailed(data.divingFishData);
                info(`从 InGame 获取用户信息成功：${user.inGame.name ?? user.divingFish.name}`);
            } else {
                info(`从 InGame 获取 ${user.inGame.name ?? user.divingFish.name} 信息失败`);
                return fromDivingFish(user);
            }
        })
        .catch(e => {
            info(`获取 ${user.inGame.name ?? user.divingFish.name} InGame 数据失败：${e.toString()}`, e.toString());
        });
}
function fetchInGameData(userId: number, importToken?: string): Promise<UpdateUserResponse | null> {
    return fetch("https://salt_api_backup.realtvop.top/updateUser", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify({ userId, importToken }),
    })
        .then(r => r.json())
        .catch(e => {
            info(`获取 InGame 数据失败：${e.toString()}`, e.toString());
            return null;
        });
}
// async function convertInGameData() {

// }

// function fetchSongData() {
//     info("正在获取曲目数据");
//     return fetch("https://www.diving-fish.com/api/maimaidxprober/music_data")
//         .then(r => r.json())
//         .then(data => {
//             songs = data;
//         })
//         .catch(e => {
//             info(`获取曲目数据失败：${e.toString()}`, e.toString());
//         });
// }

function info(message: string, errorMsg?: string): Snackbar {
    return snackbar({
        message,
        placement: "bottom",
        autoCloseDelay: errorMsg ? 3000 : 1500,
        action: errorMsg ? "复制错误" : undefined,
        onActionClick: errorMsg ? () => navigator.clipboard.writeText(errorMsg) : undefined,
    })
}

function toHalfWidth(str: string): string {
    return str.replace(/[\uFF01-\uFF5E]/g, (char) => {
        return String.fromCharCode(char.charCodeAt(0) - 65248);
    }).replace(/\u3000/g, " ");
}