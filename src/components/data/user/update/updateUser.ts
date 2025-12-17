import { getUserDisplayName, type User } from "@/components/data/user/type";
import { snackbar, alert } from "mdui";
import { markDialogOpen, markDialogClosed } from "@/components/app/router.vue";
import { fetchLXNSScore } from "@/components/integrations/lxns/fetchScore";
import { toHalfWidth } from "@/utils";
// @ts-ignore
import UpdateUserWorker from "./updateUser.worker.ts?worker&inline";

const updateUserWorker = new UpdateUserWorker();
updateUserWorker.onmessage = (event: MessageEvent) => {
    const { type } = event.data;
    if (type === "snackbar") {
        const { message, errorMsg } = event.data.data;
        snackbar({
            message,
            placement: "bottom",
            autoCloseDelay: errorMsg ? 3000 : 1500,
            action: errorMsg ? "复制错误" : undefined,
            onActionClick: errorMsg ? () => navigator.clipboard.writeText(errorMsg) : undefined,
        });
    } else if (type.startsWith("updateUserResult::")) {
        const { result: data } = event.data;
        if (data) {
            const user = pendingUsers[type.slice(18)];

            user.data = { ...user.data, ...data };
            if (
                user.inGame.id &&
                typeof user.inGame.id === "number" &&
                user.inGame.id.toString().length === 8
            )
                user.inGame.name = data.name;
        }
    } else if (type === "alert") {
        alert({
            ...event.data.data,
            onOpen: dialog => {
                markDialogOpen(dialog);
                // 允许 description 换行显示
                (
                    (dialog.shadowRoot as unknown as HTMLElement).querySelector(
                        "div.panel.has-description > div > slot.description"
                    ) as HTMLElement
                ).style.whiteSpace = "pre-wrap";
            },
            onClose: markDialogClosed,
        });
    } else console.log(type, event.data);
};

const pendingUsers: { [key: string]: User } = {};

export function updateUserWithWorker(user: User, updateItem: boolean = false) {
    // 检查并生成 uid
    if (!user.uid) {
        user.uid = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    }

    // LXNS uses useShared which is not supported in workers, handle it on main thread
    if (user.lxns?.auth?.accessToken) {
        updateFromLXNS(user);
        return;
    }

    const plainUser: User = JSON.parse(JSON.stringify(user));

    pendingUsers[user.uid] = user;
    updateUserWorker.postMessage({ type: "updateUser", user: plainUser, updateItem });
}

async function updateFromLXNS(user: User) {
    snackbar({
        message: `正在从落雪获取用户信息：${getUserDisplayName(user)}`,
        placement: "bottom",
        autoCloseDelay: 1500,
    });
    try {
        const data = await fetchLXNSScore(user);
        if (data) {
            user.data = {
                ...user.data,
                rating: data.rating,
                name: toHalfWidth(data.name),
                b50: data.b50,
                detailed: data.scores,
                updateTime: data.updateTime,
            };
            snackbar({
                message: `从落雪获取用户信息成功：${getUserDisplayName(user)}`,
                placement: "bottom",
                autoCloseDelay: 1500,
            });
        } else {
            snackbar({
                message: `从落雪获取 ${getUserDisplayName(user)} 信息失败`,
                placement: "bottom",
                autoCloseDelay: 3000,
            });
        }
    } catch (e) {
        const errorMsg = e?.toString?.() || "Unknown error";
        snackbar({
            message: `从落雪获取 ${getUserDisplayName(user)} 信息失败：${errorMsg}`,
            placement: "bottom",
            autoCloseDelay: 3000,
            action: "复制错误",
            onActionClick: () => navigator.clipboard.writeText(errorMsg),
        });
    }
}

export function checkLoginWithWorker(user: User) {
    const plainUser: User = JSON.parse(JSON.stringify(user));

    updateUserWorker.postMessage({ type: "checkLogin", user: plainUser, updateItem: false });
}

export function previewRivalsWithWorker(user: User) {
    const plainUser: User = JSON.parse(JSON.stringify(user));

    updateUserWorker.postMessage({ type: "previewRivals", user: plainUser });
}

export function clearIllegalTicketsWithWorker(user: User) {
    const plainUser: User = JSON.parse(JSON.stringify(user));

    updateUserWorker.postMessage({ type: "clearIllegalTickets", user: plainUser });
}
export function previewStockedTicketsWithWorker(user: User) {
    const plainUser: User = JSON.parse(JSON.stringify(user));

    updateUserWorker.postMessage({ type: "previewStockedTickets", user: plainUser });
}
