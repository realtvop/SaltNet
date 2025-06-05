// src/utils/updateUserWorker.ts
import { fetchPlayerData } from "@/divingfish";
import type { DivingFishResponse } from "@/divingfish/type";
import type { UpdateUserResponse } from "@/types/updateUser";
import { convertDetailed } from "@/types/user";

self.onmessage = async event => {
    const { type, user } = event.data;
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
                result = await fromInGame(user);
                message = "InGame 用户信息获取成功";
            } else if (user.divingFish.name) {
                result = await fromDivingFish(user);
                message = "水鱼用户信息获取成功";
            } else {
                status = "fail";
                message = "用户数据为空";
            }
            self.postMessage({ type: "updateUserResult", result, status, message });
        } catch (e) {
            self.postMessage({
                type: "updateUserError",
                error: e?.toString?.() || "Unknown error",
            });
        }
    }
};

async function fromDivingFish(user: any) {
    const data: DivingFishResponse = await fetchPlayerData(user.divingFish.name);
    return {
        rating: data.rating,
        b50: data.charts,
        updateTime: Date.now(),
        name: data.nickname,
    };
}

async function fromInGame(user: any) {
    const data: UpdateUserResponse | null = await fetchInGameData(
        user.inGame.id,
        user.divingFish.importToken
    );
    if (data) {
        return {
            rating: data.rating,
            name: toHalfWidth(data.userName),
            b50: data.b50,
            detailed: convertDetailed(data.divingFishData),
            updateTime: Date.now(),
        };
    } else {
        // 失败时返回 null，前端决定如何提示
        return null;
    }
}

function fetchInGameData(userId: number, importToken?: string): Promise<UpdateUserResponse | null> {
    return fetch(`${import.meta.env.VITE_API_URL}/updateUser`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, importToken }),
    })
        .then(r => r.json())
        .catch(() => null);
}

function toHalfWidth(str: string): string {
    return str
        .replace(/[\uFF01-\uFF5E]/g, char => {
            return String.fromCharCode(char.charCodeAt(0) - 65248);
        })
        .replace(/\u3000/g, " ");
}
