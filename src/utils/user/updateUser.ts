import type { User } from "@/types/user";
import { snackbar, alert } from "mdui";
import { markDialogOpen, markDialogClosed } from "@/components/router.vue";
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
            onOpen: markDialogOpen,
            onClose: markDialogClosed,
        });
    } else console.log(type, event.data);
};

const pendingUsers: { [key: string]: User } = {};

export function updateUserWithWorker(user: User) {
    // 检查并生成 uid
    if (!user.uid) {
        user.uid = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    }
    const plainUser: User = JSON.parse(JSON.stringify(user));

    pendingUsers[user.uid] = user;
    updateUserWorker.postMessage({ type: "updateUser", user: plainUser });
}

export function checkLoginWithWorker(user: User) {
    const plainUser: User = JSON.parse(JSON.stringify(user));

    updateUserWorker.postMessage({ type: "checkLogin", user: plainUser });
}
