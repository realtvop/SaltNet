<script lang="ts">
    import { createRouter, createMemoryHistory } from "vue-router";
    import IndexPage from "../pages/index.vue";
    import UserPage from "../pages/b50.vue";
    import AboutPage from "../pages/About.vue";
    import UsersPage from "../pages/users.vue";
    import SettingsPage from "../pages/settings.vue";
    import SongsPage from "../pages/songs.vue";

    const routes = [
        { path: "/", component: IndexPage },
        { path: "/users", component: UsersPage },
        { path: "/songs", component: SongsPage },
        { path: "/b50", component: UserPage },
        { path: "/b50/:id", component: UserPage, props: true },
        { path: "/settings", component: SettingsPage },
        { path: "/about", component: AboutPage },
    ];

    const routesNeedAddHistory = ["/settings", "/b50/:id"];

    const router = createRouter({
        history: createMemoryHistory(),
        routes,
    });

    let addedHistory = false;
    let previousRoute: string | null = null;
    let isHandlingPopstate = false;
    let dialogHashAdded = false;

    // 检测页面刷新并清空hash
    window.addEventListener('beforeunload', () => {
        sessionStorage.setItem('isPageRefresh', 'true');
    });

    window.addEventListener('load', () => {
        const isPageRefresh = sessionStorage.getItem('isPageRefresh');
        if (isPageRefresh) {
            sessionStorage.removeItem('isPageRefresh');
            if (window.location.hash) {
                history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        }
    });

    router.beforeEach((to, from, next) => {
        if (isHandlingPopstate) {
            isHandlingPopstate = false;
            next();
            return;
        }

        const needsHistory = routesNeedAddHistory.some(route => {
            const regex = new RegExp('^' + route.replace(/:\w+/g, '[^/]+') + '$');
            return regex.test(to.path);
        });

        if (needsHistory && !addedHistory) {
            // 保存当前的 from.path 作为返回路径，如果为空则使用根路径
            previousRoute = from.path && from.path !== '/' ? from.path : '/';
            addedHistory = true;
            
            history.pushState({ isCustomHistory: true }, '', `#${to.path}`);
        } else if (!needsHistory && from.path && from.path !== '/' && !routesNeedAddHistory.some(route => {
            const regex = new RegExp('^' + route.replace(/:\w+/g, '[^/]+') + '$');
            return regex.test(from.path);
        })) {
            // 更新 previousRoute 为正常的页面路径
            previousRoute = from.path;
        }

        next();
    });

    window.addEventListener('popstate', () => {
        const currentHash = window.location.hash;
        const openDialogs = document.querySelectorAll('mdui-dialog[open]');

        // if (openDialogs.length === 0 && !currentHash.endsWith("#dialog")) return; // 石山
        if (dialogHashAdded) {
            if (openDialogs.length <= 1) dialogHashAdded = false;
            const topDialog = openDialogs.length > 0 ? openDialogs[openDialogs.length - 1] : null;
            if (topDialog) (topDialog as any).open = false;

            return;
        }
        if (currentHash.endsWith("#dialog")) return; // 手动关闭窗口

        if (addedHistory && previousRoute) {
            if (!currentHash || currentHash === '') {
                addedHistory = false;
                isHandlingPopstate = true;
                const targetRoute = previousRoute;
                previousRoute = null;
                
                // 删除之前添加的历史记录，防止用户点击向前箭头
                history.replaceState(null, '', window.location.pathname + window.location.search);
                
                router.push(targetRoute);
            }
        }
    });

    router.afterEach((to, from) => {
        const fromNeedsHistory = routesNeedAddHistory.some(route => {
            const regex = new RegExp('^' + route.replace(/:\w+/g, '[^/]+') + '$');
            return regex.test(from.path);
        });

        const toNeedsHistory = routesNeedAddHistory.some(route => {
            const regex = new RegExp('^' + route.replace(/:\w+/g, '[^/]+') + '$');
            return regex.test(to.path);
        });

        if (fromNeedsHistory && !toNeedsHistory && addedHistory) {
            addedHistory = false;
            
            setTimeout(() => {
                if (window.history.length > 1) {
                    window.history.replaceState(null, '', window.location.pathname + window.location.search);
                }
            }, 0);
        }
    });

    export function markDialogOpen() {
        dialogHashAdded = true;
        const currentHash = window.location.hash;
        const newHash = currentHash ? `${currentHash}#dialog` : '#dialog';
        history.pushState({ isDialogHistory: true }, '', newHash);
    }

    export function markDialogClosed() {
        if (dialogHashAdded) {
            history.back();
        }
    }

    export default router;
</script>
