import { defineStore } from "pinia";
import { ref, watch, toRaw } from "vue";
import localForage from "localforage";

import type { ChartsSortCached, User } from "@/types/user";

// MARK: shared
export const useShared = defineStore("shared", () => {
    const users = ref<User[]>([]);
    const chartsSort = ref<ChartsSortCached>({
            identifier: {
                name: null,
                updateTime: null,
                verBuildTime: null,
            },
            charts: null,
        });

    localForage.getItem<User[]>("users").then((v: User[] | null) => {
        if (Array.isArray(v)) users.value = v;
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
    watch(chartsSort, (newChartsSort: ChartsSortCached) => {
        if (!newChartsSort) return;
        localForage.setItem("chartsSortCached", toRaw(newChartsSort)).catch((err: any) => {
            console.error("Failed to save charts sort:", err);
        });
    });

    return { users, chartsSort };
});
