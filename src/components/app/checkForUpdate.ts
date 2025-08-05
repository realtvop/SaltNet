import { snackbar } from "mdui";
import { useShared } from "./shared";

declare global {
    interface Window {
        spec: {
            currentVersionBuildTime: string;
        };
    }
}

export function checkForUpdate() {
    fetch("/latest.json")
        .then(r => r.text())
        .then(t => JSON.parse(t))
        .then(l => {
            if (l.buildTime && l.assets && l.buildTime !== window.spec.currentVersionBuildTime) {
                if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({
                        action: "update",
                        assets: l.assets,
                    });
                    showSnackBar("正在更新");
                } else showSnackBar("更新失败");
            }
        });
    // .catch(e => showSnackBar("更新检查失败"));
}

const broadcast = new BroadcastChannel("updateFinish");
broadcast.onmessage = () => {
    useShared().isUpdated = true;

    snackbar({
        message: "更新成功，刷新生效",
        placement: "bottom",
        autoCloseDelay: 2000,
        action: "立即刷新",
        onActionClick: () => {
            window.location.reload();
        },
    });
};

function showSnackBar(message: string) {
    return snackbar({
        message,
        placement: "bottom",
        autoCloseDelay: 1000,
    });
}
