import { defineStore } from "pinia";
import { ref, watch, toRaw } from "vue";
import localForage from "localforage";

import type { ChartsSortCached, FavoriteList, User } from "@/types/user";
import type { Chart } from "@/types/music";

// MARK: shared
export const useShared = defineStore("shared", () => {
    const users = ref<User[]>([]);
    const favorites = ref<FavoriteList[]>([]);
    const chartsSort = ref<ChartsSortCached>({
        identifier: {
            name: null as unknown as string,
            updateTime: null as unknown as number,
            verBuildTime: null as unknown as number,
        },
        charts: null as unknown as Chart[],
    });

    localForage.getItem<User[]>("users").then((v: User[] | null) => {
        if (Array.isArray(v)) users.value = v;
    });
    localForage.getItem<FavoriteList[]>("favorites").then((v: FavoriteList[] | null) => {
        if (Array.isArray(v)) favorites.value = v;
    });
    localForage.getItem<ChartsSortCached>("chartsSortCached").then((v: ChartsSortCached | null) => {
        if (v) chartsSort.value = v;
    });

    watch(
        users,
        (newUsers: User[]) => {
            if (!newUsers) return;
            localForage.setItem("users", toRaw(newUsers)).catch((err: any) => {
                console.error("Failed to save users:", err);
            });
        },
        { deep: true }
    );
    watch(
        favorites,
        (newFavorites: FavoriteList[]) => {
            if (!newFavorites) return;
            localForage.setItem("favorites", toRaw(newFavorites)).catch((err: any) => {
                console.error("Failed to save favorites:", err);
            });
        },
        { deep: true }
    );
    watch(
        chartsSort,
        (newChartsSort: ChartsSortCached) => {
            if (!newChartsSort) return;
            localForage.setItem("chartsSortCached", toRaw(newChartsSort)).catch((err: any) => {
                console.error("Failed to save charts sort:", err);
            });
        }
    );

    return { users, chartsSort, favorites };
});
