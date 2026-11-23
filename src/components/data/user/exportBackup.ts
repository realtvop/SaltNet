import type { User } from "@core/user/type";
import { buildGameBackup } from "@core/user/gameBackup";
import { snackbar } from "mdui";

export function exportUserBackup(user: User) {
    if (!user.inGame.id) return snackbar({ message: "你怎么进来的！", autoCloseDelay: 2000 });
    if (!user.data.updateTime)
        return snackbar({ message: "用户数据未更新，无法导出备份", autoCloseDelay: 2000 });
    if (!user.data.detailed || !Object.keys(user.data.detailed).length)
        return snackbar({ message: "缺少完整成绩数据，无法导出备份", autoCloseDelay: 2000 });

    const userBackup = buildGameBackup(user);

    const blob = new Blob([JSON.stringify(userBackup, null, 2)], {
        type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SaltNet_游戏内数据备份_${sanitizeFileName(userBackup.userName)}_${getCurrentTime()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFileName(fileName: string) {
    return fileName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "unknown";
}

function getCurrentTime() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}
