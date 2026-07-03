import { type User } from "@/components/data/user/type";
import { appendRatingHistory } from "@/components/data/user/ratingHistory";
import { snackbar, prompt } from "mdui";
import { markDialogOpen, markDialogClosed } from "@/components/app/router";

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
            const { lxns, ...nextData } = data;
            appendRatingHistory(user, nextData.rating, nextData.updateTime);

            user.data = { ...user.data, ...nextData };
            if (lxns) user.lxns = { ...user.lxns, ...lxns };
            if (data.userId) user.inGame.id = data.userId;
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
            onOpen: (dialog: any) => {
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
    }
};

const pendingUsers: { [key: string]: User } = {};

export function updateUserWithWorker(user: User) {
    // 检查并生成 uid
    if (!user.uid) {
        user.uid = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    }
    const userUid = user.uid;

    const plainUser: User = JSON.parse(JSON.stringify(user));
    const shouldPromptQrCode = user.inGame?.enabled && !user.inGame?.useFastUpdate;

    if (shouldPromptQrCode) {
        prompt({
            headline: "更新用户数据",
            description: `输入二维码扫描结果或复制的二维码页面链接（需要登录帐号）${user.data.detailed && user.inGame.id ? `，日常更新建议留空使用快速更新（不会尝试登录帐号）` : ""}`,
            confirmText: "更新",
            cancelText: "取消",
            closeOnEsc: true,
            closeOnOverlayClick: true,
            onOpen: markDialogOpen,
            onClose: markDialogClosed,
            onConfirm: (value: string) => {
                if (!value?.trim() && !(user.data.detailed && user.inGame.id)) {
                    snackbar({
                        message: "首次更新请输入二维码内容",
                        placement: "bottom",
                        autoCloseDelay: 1500,
                    });
                    return false;
                }
                pendingUsers[userUid] = user;
                updateUserWorker.postMessage({
                    type: "updateUser",
                    user: plainUser,
                    qrCode: value,
                });
                return true;
            },
        });
        return;
    }

    pendingUsers[userUid] = user;
    updateUserWorker.postMessage({ type: "updateUser", user: plainUser });
}

export function checkLoginWithWorker(user: User) {
    const plainUser: User = JSON.parse(JSON.stringify(user));
    prompt({
        headline: "检查登录状态",
        description: "输入二维码扫描结果或复制的二维码页面链接。此操作不会尝试登录您的帐户。",
        confirmText: "检查",
        cancelText: "取消",
        closeOnEsc: true,
        closeOnOverlayClick: true,
        onOpen: markDialogOpen,
        onClose: markDialogClosed,
        onConfirm: (value: string) => {
            if (!value?.trim()) {
                snackbar({
                    message: "二维码不能为空",
                    placement: "bottom",
                    autoCloseDelay: 1500,
                });
                return false;
            }
            updateUserWorker.postMessage({ type: "checkLogin", user: plainUser, qrCode: value });
            return true;
        },
    });
}

export function clearIllegalTicketsWithWorker(user: User, qrCode: string) {
    const plainUser: User = JSON.parse(JSON.stringify(user));

    updateUserWorker.postMessage({ type: "clearIllegalTickets", user: plainUser, qrCode });
}
export function previewStockedTicketsWithWorker(user: User) {
    const plainUser: User = JSON.parse(JSON.stringify(user));

    updateUserWorker.postMessage({ type: "previewStockedTickets", user: plainUser });
}
