import { createRouter, createMemoryHistory, createWebHistory } from "vue-router";
import type { Dialog } from "mdui";

import IndexPage from "../../pages/index.vue";
import UserPage from "../../pages/b50.vue";
import AboutPage from "../../pages/About.vue";
import UsersPage from "../../pages/users.vue";
import SettingsPage from "../../pages/settings.vue";
import SongsPage from "../../pages/songs.vue";
import CollectionsPage from "../../pages/collections.vue";
import RenderingPage from "../../pages/b50ToRender.vue";
import ShopPage from "../../pages/Shop.vue";
import MePage from "../../pages/me.vue";
import OAuthCallbackPage from "../../pages/oauth-callback.vue";

import { useRouterStore } from "../../stores/router";
import { useDialogStore } from "../../stores/dialog";
import { isDBEnabled } from "../data/user/database";

const routes = [
    { path: "/", component: IndexPage },
    { path: "/users", component: UsersPage },
    { path: "/songs", component: SongsPage },
    { path: "/songs/:id", component: SongsPage, props: true },
    { path: "/b50", component: UserPage },
    { path: "/b50/render", component: RenderingPage },
    { path: "/b50/:id", component: UserPage, props: true },
    { path: "/settings", component: SettingsPage },
    { path: "/about", component: AboutPage },
    { path: "/collections", component: CollectionsPage },
    { path: "/nearcade", component: ShopPage },
    // Only register /me and OAuth callback routes when DB is enabled
    ...(isDBEnabled
        ? [
              { path: "/me", component: MePage },
              { path: "/oauth/callback", component: OAuthCallbackPage },
          ]
        : []),
];

const router = createRouter({
    history: import.meta.env.PROD ? createMemoryHistory() : createWebHistory(),
    routes,
});

// 延迟初始化 stores（等待 Pinia 就绪）
let routerStore: ReturnType<typeof useRouterStore> | null = null;
let dialogStore: ReturnType<typeof useDialogStore> | null = null;

function getStores() {
    if (!routerStore) routerStore = useRouterStore();
    if (!dialogStore) dialogStore = useDialogStore();
    return { routerStore, dialogStore };
}

// 初始化：清理 URL hash
window.addEventListener("load", () => {
    if (window.location.hash) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
    }
});

// 路由守卫
router.beforeEach((to, from, next) => {
    const { routerStore } = getStores();
    routerStore.onBeforeRoute(to, from);
    next();
});

router.afterEach((to, from) => {
    const { routerStore } = getStores();

    // 滚动到顶部
    window.scrollTo(0, 0);

    // 控制页面滚动
    document.body.style.overflowY = routerStore.needsFixed(to.path) ? "hidden" : "";

    // 处理历史记录清理
    routerStore.onAfterRoute(to, from);
});

// popstate 事件处理
window.addEventListener("popstate", () => {
    const { routerStore, dialogStore } = getStores();

    // 先让 dialog 处理
    if (dialogStore.handlePopstate()) {
        return;
    }

    // 再让路由处理
    routerStore.handlePopstate(router);
});

// 导出 dialog 标记函数
export function markDialogOpen(evtOrEle: Element | Event | Dialog) {
    const { dialogStore } = getStores();
    dialogStore.markOpen(evtOrEle);
}

export function markDialogClosed(evtOrEle: Element | Event | Dialog) {
    const { dialogStore } = getStores();
    dialogStore.markClosed(evtOrEle);
}

export default router;
