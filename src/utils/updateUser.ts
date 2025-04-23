import { fetchPlayerData } from "@/divingfish";
import type { DivingFishResponse } from "@/divingfish/type";
import type { User } from "@/types/user";

import { Snackbar, snackbar } from "mdui";

export function updateUser(user: User) {
    if (!user.data) user.data = {};

    if (user.inGame.id) {
        
    } else {
        if (user.divingFish.name) {
            info(`正在从水鱼获取用户信息：${user.divingFish.name}`);
            return fetchPlayerData(user.divingFish.name)
                .then((data: DivingFishResponse) => {
                    user.data.rating = data.rating;
                    user.data.b50 = data.charts;
                    info(`从水鱼获取用户信息成功：${user.divingFish.name}`);
                })
                .catch(e => {
                    info(`从水鱼获取 ${user.divingFish.name} 信息失败：${e.toString()}`, e.toString());
                });
        }
    }
    info("用户数据为空？？？如配置没有错误，请反馈");
}

function info(message: string, errorMsg?: string): Snackbar {
    return snackbar({
        message,
        placement: "top",
        autoCloseDelay: errorMsg ? 2000 : 1000,
        action: errorMsg ? "复制错误" : undefined,
        onActionClick: errorMsg ? () => navigator.clipboard.writeText(errorMsg) : undefined,
    })
}