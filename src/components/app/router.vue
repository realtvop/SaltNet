<script lang="ts">
    import { createRouter, createMemoryHistory } from "vue-router";
    import { Dialog } from "mdui";

    import IndexPage from "../../pages/index.vue";
    import UserPage from "../../pages/b50.vue";
    import AboutPage from "../../pages/About.vue";
    import UsersPage from "../../pages/users.vue";
    import SettingsPage from "../../pages/settings.vue";
    import SongsPage from "../../pages/songs.vue";
    import CollectionsPage from "../../pages/collections.vue";
    import RenderingPage from "../../pages/b50ToRender.vue";
    import ShopPage from "../../pages/Shop.vue";

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
    ];

    const routesNeedAddHistory = ["/settings", "/b50/:id", "/songs/:id", "/nearcade"];
    const routesNeedFixedPage = ["/", "/about", "/songs", "/songs/:id", "/collections"];

    const router = createRouter({
        history: createMemoryHistory(),
        routes,
    });

    let addedHistory = false;
    let previousRoute: string | null = null;
    let isHandlingPopstate = false;
    let previousHash: string = "";

    window.addEventListener("load", () => {
        if (window.location.hash)
            history.replaceState(null, "", window.location.pathname + window.location.search);
    });

    router.beforeEach((to, from, next) => {
        if (isHandlingPopstate) {
            isHandlingPopstate = false;
            next();
            return;
        }

        const needsHistory = routesNeedAddHistory.some(route => {
            const regex = new RegExp("^" + route.replace(/:\w+/g, "[^/]+") + "$");
            return regex.test(to.path);
        });

        if (needsHistory && !addedHistory) {
            // 保存当前的 from.path 作为返回路径，如果为空则使用根路径
            previousRoute = from.path && from.path !== "/" ? from.path : "/";
            addedHistory = true;

            history.pushState({ isCustomHistory: true }, "", `#${to.path}`);
        } else if (
            !needsHistory &&
            from.path &&
            from.path !== "/" &&
            !routesNeedAddHistory.some(route => {
                const regex = new RegExp("^" + route.replace(/:\w+/g, "[^/]+") + "$");
                return regex.test(from.path);
            })
        ) {
            // 更新 previousRoute 为正常的页面路径
            previousRoute = from.path;
        }

        next();
    });

    router.afterEach(to => {
        window.scrollTo(0, 0);

        // Check if the current route needs fixed page
        const needsFixedPage = routesNeedFixedPage.some(route => {
            const regex = new RegExp("^" + route.replace(/:\w+/g, "[^/]+") + "$");
            return regex.test(to.path);
        });

        if (needsFixedPage) {
            document.body.style.overflowY = "hidden";
        } else {
            document.body.style.overflowY = "";
        }
    });

    window.addEventListener("popstate", () => {
        const currentHash = window.location.hash;
        const openDialogs = document.querySelectorAll("mdui-dialog[open]");

        // if (openDialogs.length === 0 && !currentHash.endsWith("#dialog")) return; // 石山
        if (previousHash.endsWith("#dialog")) {
            // if (openDialogs.length <= 1) dialogHashAdded = false;
            const dialogHashLength = (previousHash.match(/#dialog/g) || []).length;
            if (openDialogs.length >= dialogHashLength) {
                const topDialog =
                    openDialogs.length > 0 ? openDialogs[openDialogs.length - 1] : null;
                if (topDialog) (topDialog as any).open = false;
            }
            return (previousHash = currentHash);
        }
        if (currentHash.endsWith("#dialog"))
            history.replaceState(
                null,
                "",
                currentHash.replace("#dialog", "") ||
                    window.location.pathname + window.location.search
            );

        if (addedHistory && previousRoute) {
            if (!currentHash || currentHash === "") {
                addedHistory = false;
                isHandlingPopstate = true;
                const targetRoute = previousRoute;
                previousRoute = null;

                // 删除之前添加的历史记录，防止用户点击向前箭头
                history.replaceState(null, "", window.location.pathname + window.location.search);

                router.push(targetRoute);
            }
        }

        previousHash = currentHash;
    });

    router.afterEach((to, from) => {
        const fromNeedsHistory = routesNeedAddHistory.some(route => {
            const regex = new RegExp("^" + route.replace(/:\w+/g, "[^/]+") + "$");
            return regex.test(from.path);
        });

        const toNeedsHistory = routesNeedAddHistory.some(route => {
            const regex = new RegExp("^" + route.replace(/:\w+/g, "[^/]+") + "$");
            return regex.test(to.path);
        });

        if (fromNeedsHistory && !toNeedsHistory && addedHistory) {
            addedHistory = false;

            setTimeout(() => {
                if (window.history.length > 1) {
                    window.history.replaceState(
                        null,
                        "",
                        window.location.pathname + window.location.search
                    );
                }
            }, 0);
        }
    });

    export function markDialogOpen(evtOrEle: Element | Event | Dialog) {
        const element =
            evtOrEle instanceof Element ? evtOrEle : ((evtOrEle as Event).target as Element);
        if (element.localName !== "mdui-dialog") return; // fuck mdui-select

        // dialogHashAdded = true;
        const currentHash = window.location.hash;
        const newHash = currentHash ? `${currentHash}#dialog` : "#dialog";
        history.pushState({ isDialogHistory: true }, "", newHash);
        previousHash = newHash;
    }

    export function markDialogClosed(evtOrEle: Element | Event | Dialog) {
        const element =
            evtOrEle instanceof Element ? evtOrEle : ((evtOrEle as Event).target as Element);
        if (element.localName !== "mdui-dialog") return; // fuck mdui-select

        const currentHash = window.location.hash;
        if (currentHash.endsWith("#dialog")) {
            const openDialogs = document.querySelectorAll("mdui-dialog[open]");
            if (
                !Array.from(openDialogs).includes(element) &&
                openDialogs.length < (currentHash.match(/#dialog/g) || []).length
            )
                history.back();
        }
    }

    export default router;
</script>
