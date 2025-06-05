import type { User } from "@/types/user";
// @ts-ignore
import UpdateUserWorker from "@/utils/updateUser.worker.ts?worker&inline";

const updateUserWorker = new UpdateUserWorker();

export function updateUserWithWorker(user: User) {
    return new Promise<{ status: string; message: string }>((resolve, reject) => {
        const plainUser = JSON.parse(JSON.stringify(user));
        updateUserWorker.postMessage({ type: "updateUser", user: plainUser });
        updateUserWorker.onmessage = (event: MessageEvent) => {
            const { type, result, error, status, message } = event.data;
            if (type === "updateUserResult") {
                if (result) {
                    user.data = { ...user.data, ...result };
                    if (user.inGame.id && typeof user.inGame.id === "number" && user.inGame.id.toString().length === 8)
                        user.inGame.name = result.name;
                }
                resolve({ status, message });
            } else if (type === "updateUserError") {
                reject({ status: "fail", message: error || "未知错误" });
            }
        };
    });
}

export function checkLoginWithWorker(user: User) {
                const userName = user.data.name ?? user.inGame?.id ?? "未知";
    return new Promise<{ headline?: string; description?: string, message?: string }>((resolve, reject) => {
        fetch(`${import.meta.env.VITE_API_URL}/checkLogin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.inGame.id }),
        })
            .then(r => r.json())
            .then((data: { isLogin: string } | null) => {
                if (data) {
                    resolve({
                        headline: `${userName}`,
                        description: data.isLogin ? "上机了哟！" : "还没有上机",
                    });
                } else {
                    resolve({
                        message: `[${userName}] 从 InGame 获取信息失败`,
                    });
                }
            })
            .catch(e => {
                reject({
                    message: `[${userName}] 获取 InGame 数据失败：${e.toString()}`,
                });
            });
    });
}