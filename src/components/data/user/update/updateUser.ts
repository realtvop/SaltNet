import { type User } from "@/components/data/user/type";
import { appendRatingHistory } from "@/components/data/user/ratingHistory";
import { alert, snackbar, prompt } from "mdui";
import { markDialogOpen, markDialogClosed } from "@/components/app/router";
import {
    createScoreHistoryCandidates,
    createUserUid,
    enqueueScoreHistoryBatch,
    getExistingScoreData,
    type ScoreHistorySource,
} from "@/components/data/user/scoreHistory";

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
    } else if (type === "updateUserResult") {
        const requestId = event.data.requestId as string;
        const pending = pendingUsers[requestId];
        if (!pending) return;
        delete pendingUsers[requestId];
        if (latestRequestByUser[pending.userUid] !== requestId) return;
        delete latestRequestByUser[pending.userUid];

        const { result: data } = event.data;
        if (data) {
            const user = pending.user;
            const {
                lxns,
                scoreHistorySource,
                userId,
                ...nextData
            }: {
                lxns?: User["lxns"];
                scoreHistorySource: ScoreHistorySource;
                userId?: number;
                [key: string]: unknown;
            } = data;
            const existing = getExistingScoreData(user.data.detailed, user.data.b50);
            const incomingDetailed = nextData.detailed
                ? Object.values(nextData.detailed as NonNullable<User["data"]["detailed"]>)
                : [];
            const incomingB50 = nextData.b50
                ? [
                      ...(nextData.b50 as NonNullable<User["data"]["b50"]>).sd,
                      ...(nextData.b50 as NonNullable<User["data"]["b50"]>).dx,
                  ]
                : [];
            const incoming = [...incomingDetailed, ...incomingB50];
            const observedAt =
                typeof nextData.updateTime === "number" ? nextData.updateTime : Date.now();
            const candidates = createScoreHistoryCandidates(existing, incoming, observedAt);
            appendRatingHistory(user, nextData.rating, observedAt);

            user.data = {
                ...user.data,
                ...(nextData as Partial<User["data"]>),
                ...(userId !== undefined ? { userId } : {}),
            };
            if (lxns) user.lxns = { ...user.lxns, ...lxns };
            if (userId) user.inGame.id = userId;
            if (
                user.inGame.id &&
                typeof user.inGame.id === "number" &&
                user.inGame.id.toString().length === 8
            )
                user.inGame.name = data.name;

            void enqueueScoreHistoryBatch({
                batchId: requestId,
                userUid: pending.userUid,
                source: scoreHistorySource,
                candidates,
            }).then(saved => {
                if (!saved) {
                    snackbar({
                        message: "成绩已更新，历史记录保存失败，将在稍后重试",
                        placement: "bottom",
                        autoCloseDelay: 3000,
                    });
                }
            });
        }
    } else if (type === "updateUserError") {
        const requestId = event.data.requestId as string;
        const pending = pendingUsers[requestId];
        if (pending) {
            delete pendingUsers[requestId];
            if (latestRequestByUser[pending.userUid] === requestId)
                delete latestRequestByUser[pending.userUid];
        }
        snackbar({
            message: event.data.error || "更新用户失败",
            placement: "bottom",
            autoCloseDelay: 3000,
        });
    } else if (type === "alert") {
        void alert({
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
        }).catch(() => undefined);
    }
};

const pendingUsers: Record<string, { user: User; userUid: string }> = {};
const latestRequestByUser: Record<string, string> = {};

function createRequestId(): string {
    return (
        globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
}

function postUpdateRequest(user: User, plainUser: User, qrCode?: string): void {
    const requestId = createRequestId();
    const userUid = user.uid as string;
    const previousRequest = latestRequestByUser[userUid];
    if (previousRequest) delete pendingUsers[previousRequest];
    latestRequestByUser[userUid] = requestId;
    pendingUsers[requestId] = { user, userUid };
    updateUserWorker.postMessage({ type: "updateUser", requestId, user: plainUser, qrCode });
}

export function updateUserWithWorker(user: User) {
    // 检查并生成 uid
    if (!user.uid) {
        user.uid = createUserUid();
    }

    const plainUser: User = JSON.parse(JSON.stringify(user));
    const shouldPromptQrCode = user.inGame?.enabled && !user.inGame?.useFastUpdate;

    if (shouldPromptQrCode) {
        void prompt({
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
                postUpdateRequest(user, plainUser, value);
                return true;
            },
        }).catch(() => undefined);
        return;
    }

    postUpdateRequest(user, plainUser);
}

export function hasPendingUserUpdates(): boolean {
    return Object.keys(pendingUsers).length > 0;
}

export function cancelPendingUserUpdates(userUid?: string): void {
    for (const [requestId, pending] of Object.entries(pendingUsers)) {
        if (!userUid || pending.userUid === userUid) delete pendingUsers[requestId];
    }
    if (userUid) delete latestRequestByUser[userUid];
    else for (const key of Object.keys(latestRequestByUser)) delete latestRequestByUser[key];
}

export function checkLoginWithWorker(user: User) {
    const plainUser: User = JSON.parse(JSON.stringify(user));
    void prompt({
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
    }).catch(() => undefined);
}

export function clearIllegalTicketsWithWorker(user: User, qrCode: string) {
    const plainUser: User = JSON.parse(JSON.stringify(user));

    updateUserWorker.postMessage({ type: "clearIllegalTickets", user: plainUser, qrCode });
}
export function previewStockedTicketsWithWorker(user: User) {
    const plainUser: User = JSON.parse(JSON.stringify(user));

    updateUserWorker.postMessage({ type: "previewStockedTickets", user: plainUser });
}
