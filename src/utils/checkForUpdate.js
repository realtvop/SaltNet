import { snackbar } from "mdui";

export function checkForUpdate() {
    fetch("/latest.json")
        .then(r => r.text())
        .then(t => JSON.parse(t))
        .then(l => {
            if (l.buildTime && l.assets && l.buildTime !== window.spec.currentVersionBuildTime) {
                if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({ action: "update", assets: l.assets });
                    showSnackBar("正在更新")
                } else showSnackBar("更新失败")
            }
        })
        // .catch(e => showSnackBar("更新检查失败"));
}

function showSnackBar(message) {
    return snackbar({
        message,
        placement: "bottom",
        autoCloseDelay: 1000,
    })
}