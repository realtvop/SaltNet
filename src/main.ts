import { createApp } from "vue";
import { createPinia } from "pinia";

import "./style.css";
import App from "./App.vue";
import router from "./components/router.vue";
import "mdui/mdui.css";
import { setColorScheme, snackbar } from "mdui";
import { checkForUpdate } from "./utils/checkForUpdate";

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.use(router);

app.mount("#app");

setColorScheme("#8E92E1"); // #5EEAC7

checkForUpdate();

declare global {
  interface Window {
    navigation?: any;
  }
}
if ('navigation' in window) {
    let isExitToastVisible = false;
    // let toastTimer;

    interface NavigationEvent {
        navigationType: string;
        intercept: (options: { handler: () => void }) => void;
    }

    interface NavigationAPI {
        addEventListener: (event: string, callback: (event: NavigationEvent) => void) => void;
        canGoBack: boolean;
    }

    (window.navigation as NavigationAPI).addEventListener('navigate', (event: NavigationEvent) => {
        const isRoot = new URL(location.href).pathname === '/'; // 檢查當前是否在根目錄
        if (event.navigationType === 'traverse' && isRoot && window.navigation.canGoBack === false) {
            event.intercept({
                handler: () => {
                    if (isExitToastVisible) {
                        // 如果提示已經顯示，則這次什麼都不做，讓App關閉
                        // (注意：攔截後App不會自動關閉，這是API的限制。使用者需要再次按返回)
                        // 這裡的邏輯需要調整以符合預期
                        // 最好的方法是根本不要第二次攔截
                        window.close(); // 嘗試關閉，但不一定成功
                        return;
                    }

                    isExitToastVisible = true;
                    snackbar({
                        message: "再按一次返回鍵即可退出",
                    });

                    // 2秒後重置狀態
                    setTimeout(() => {
                        isExitToastVisible = false;
                    }, 2000);
                },
            });
        }
    });
}