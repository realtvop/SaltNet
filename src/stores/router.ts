import { defineStore } from "pinia";

// 需要固定页面（禁用滚动）的路由
const ROUTES_NEED_FIXED = ["/"];

function matchRoute(path: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
        const regex = new RegExp("^" + pattern.replace(/:\w+/g, "[^/]+") + "$");
        return regex.test(path);
    });
}

export const useRouterStore = defineStore("router", () => {
    const needsFixed = (path: string) => matchRoute(path, ROUTES_NEED_FIXED);

    return {
        needsFixed,
    };
});
