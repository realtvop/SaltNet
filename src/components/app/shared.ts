import { defineStore } from "pinia";
import { ref, watch, toRaw } from "vue";
import localForage from "localforage";

import type { ChartsSortCached, FavoriteList, User } from "@/components/data/user/type";
import type { Chart } from "@/components/data/music/type";
import type { NearcadeData } from "../integrations/nearcade/type";
import type { SaltNetDatabaseLogin } from "@/components/data/user/database";

const darkModeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

// MARK: shared
export const useShared = defineStore("shared", () => {
    const users = ref<User[]>([]);
    const favorites = ref<FavoriteList[]>([]);
    const nearcadeData = ref<NearcadeData>({
        currentShopId: null,
        favoriteShopIds: [],
        APIKey: null,
    });
    const chartsSort = ref<ChartsSortCached>({
        identifier: {
            name: null as unknown as string,
            updateTime: null as unknown as number,
            verBuildTime: null as unknown as number,
        },
        charts: null as unknown as Chart[],
    });
    const isUpdated = ref<boolean>(false);
    const isDarkMode = ref<boolean>(darkModeMediaQuery.matches);
    const isSmallScreen = ref<boolean>(window.innerWidth < 560);
    const saltNetAccount = ref<SaltNetDatabaseLogin | null>(null);

    const handleScreenSizeChange = () => {
        isSmallScreen.value = window.innerWidth < 560;
    };

    window.addEventListener("resize", handleScreenSizeChange);
    handleScreenSizeChange();

    darkModeMediaQuery.addEventListener("change", event => (isDarkMode.value = !!event.matches));
    localForage.getItem<User[]>("users").then((v: User[] | null) => {
        if (Array.isArray(v)) {
            // Migrate users without settings property
            const migratedUsers = v.map(user => {
                if (!user.settings) {
                    return {
                        ...user,
                        settings: { manuallyUpdate: false },
                    };
                }
                return user;
            });
            users.value = migratedUsers;
        }
    });
    localForage.getItem<FavoriteList[]>("favorites").then((v: FavoriteList[] | null) => {
        if (Array.isArray(v)) favorites.value = v;
    });
    localForage.getItem<ChartsSortCached>("chartsSortCached").then((v: ChartsSortCached | null) => {
        if (v) chartsSort.value = v;
    });
    localForage.getItem<NearcadeData>("nearcadeData").then((v: NearcadeData | null) => {
        if (v) nearcadeData.value = v;
    });
    localForage.getItem<SaltNetDatabaseLogin>("saltNetAccount").then((v: SaltNetDatabaseLogin | null) => {
        if (v) saltNetAccount.value = v;
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
    watch(chartsSort, (newChartsSort: ChartsSortCached) => {
        if (!newChartsSort) return;
        localForage.setItem("chartsSortCached", toRaw(newChartsSort)).catch((err: any) => {
            console.error("Failed to save charts sort:", err);
        });
    });
    watch(
        nearcadeData,
        (newNearcadeData: NearcadeData) => {
            if (!newNearcadeData) return;
            localForage.setItem("nearcadeData", toRaw(newNearcadeData)).catch((err: any) => {
                console.error("Failed to save nearcade data:", err);
            });
        },
        { deep: true }
    );
    watch(
        saltNetAccount,
        (newSaltNetAccount: SaltNetDatabaseLogin | null) => {
            if (newSaltNetAccount) {
                localForage.setItem("saltNetAccount", toRaw(newSaltNetAccount)).catch((err: any) => {
                    console.error("Failed to save saltnet account:", err);
                });
            } else {
                localForage.removeItem("saltNetAccount").catch((err: any) => {
                    console.error("Failed to remove saltnet account:", err);
                });
            }
        },
        { deep: true }
    );

    return { users, chartsSort, favorites, isUpdated, isDarkMode, isSmallScreen, nearcadeData, saltNetAccount };
});
