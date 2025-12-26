import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { RouteLocationNormalized } from "vue-router";

// 需要添加历史记录的路由（用于支持浏览器后退）
const ROUTES_NEED_HISTORY = [
    "/settings",
    "/b50/:id",
    "/songs/:id",
    "/nearcade",
    "/about",
    "/me",
];

// 需要固定页面（禁用滚动）的路由
const ROUTES_NEED_FIXED = ["/"];

function matchRoute(path: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
        const regex = new RegExp("^" + pattern.replace(/:\w+/g, "[^/]+") + "$");
        return regex.test(path);
    });
}

export const useRouterStore = defineStore("router", () => {
    // 状态
    const historyAdded = ref(false);
    const previousRoute = ref<string | null>(null);
    const isHandlingPopstate = ref(false);

    // 计算属性
    const needsHistory = (path: string) => matchRoute(path, ROUTES_NEED_HISTORY);
    const needsFixed = (path: string) => matchRoute(path, ROUTES_NEED_FIXED);

    // Actions
    function onBeforeRoute(to: RouteLocationNormalized, from: RouteLocationNormalized) {
        if (isHandlingPopstate.value) {
            isHandlingPopstate.value = false;
            return;
        }

        const toNeedsHistory = needsHistory(to.path);

        if (toNeedsHistory && !historyAdded.value) {
            // 保存返回路径
            previousRoute.value = from.path && from.path !== "/" ? from.path : "/";
            historyAdded.value = true;

            history.pushState({ isCustomHistory: true }, "", `#${to.path}`);
        } else if (!toNeedsHistory && from.path && from.path !== "/" && !needsHistory(from.path)) {
            // 更新 previousRoute 为正常的页面路径
            previousRoute.value = from.path;
        }
    }

    function onAfterRoute(to: RouteLocationNormalized, from: RouteLocationNormalized) {
        const fromNeedsHistory = needsHistory(from.path);
        const toNeedsHistory = needsHistory(to.path);

        if (fromNeedsHistory && !toNeedsHistory && historyAdded.value) {
            historyAdded.value = false;

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
    }

    function handlePopstate(router: { push: (path: string) => void }) {
        const currentHash = window.location.hash;

        if (historyAdded.value && previousRoute.value) {
            if (!currentHash || currentHash === "") {
                historyAdded.value = false;
                isHandlingPopstate.value = true;
                const targetRoute = previousRoute.value;
                previousRoute.value = null;

                // 删除之前添加的历史记录
                history.replaceState(null, "", window.location.pathname + window.location.search);

                router.push(targetRoute);
                return true; // 已处理
            }
        }

        return false; // 未处理，交给 dialog 处理
    }

    function reset() {
        historyAdded.value = false;
        previousRoute.value = null;
        isHandlingPopstate.value = false;
    }

    return {
        // State
        historyAdded,
        previousRoute,
        isHandlingPopstate,

        // Getters
        needsHistory,
        needsFixed,

        // Actions
        onBeforeRoute,
        onAfterRoute,
        handlePopstate,
        reset,
    };
});
