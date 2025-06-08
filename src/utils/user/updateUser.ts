import type { User } from "@/types/user";
import { snackbar, alert } from "mdui";
// @ts-ignore
import UpdateUserWorker from "./updateUser.worker.ts?worker&inline";

const updateUserWorker = new UpdateUserWorker();

export function updateUserWithWorker(user: User) {
    const plainUser = JSON.parse(JSON.stringify(user));

    updateUserWorker.postMessage({ type: "updateUser", user: plainUser });
    updateUserWorker.onmessage = (event: MessageEvent) => {
        const { type, data } = event.data;
        if (type === "snackbar") {
            const { message, errorMsg } = data;
            snackbar({
                message,
                placement: "bottom",
                autoCloseDelay: errorMsg ? 3000 : 1500,
                action: errorMsg ? "复制错误" : undefined,
                onActionClick: errorMsg ? () => navigator.clipboard.writeText(errorMsg) : undefined,
            });
        } else if (type === "updateUserResult") {
            if (data) {
                user.data = { ...user.data, ...data };
                if (
                    user.inGame.id &&
                    typeof user.inGame.id === "number" &&
                    user.inGame.id.toString().length === 8
                )
                    user.inGame.name = data.name;
            }
        } else if (type === "alert") {
            alert(data);
        }
    };
}

export function checkLoginWithWorker(user: User) {
    const plainUser = JSON.parse(JSON.stringify(user));

    updateUserWorker.postMessage({ type: "checkLogin", user: plainUser });
}
