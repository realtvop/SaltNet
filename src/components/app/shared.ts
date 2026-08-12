import { defineStore } from "pinia";
import { ref, watch, toRaw } from "vue";
import localForage from "localforage";

import type { ChartsSortCached, FavoriteList, User } from "@/components/data/user/type";
import type { Chart } from "@/components/data/music/type";
import type { NearcadeData } from "../integrations/nearcade/type";
import { normalizeRatingHistory } from "@/components/data/user/ratingHistory";

const darkModeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
type RatingDisplayMode = "简洁" | "吃分" | "完整";
type AppSettings = {
    defaultChartRatingDisplayMode: RatingDisplayMode;
    showDxScoreInB50: boolean;
    reverseSongsDifficultyAndVersionTabs: boolean;
};

function toStorageValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(toRaw(value))) as T;
}

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
    const musicDataLoading = ref<boolean>(false);
    const appSettings = ref<AppSettings>({
        defaultChartRatingDisplayMode: "简洁",
        showDxScoreInB50: false,
        reverseSongsDifficultyAndVersionTabs: false,
    });

    const handleScreenSizeChange = () => {
        isSmallScreen.value = window.innerWidth < 560;
    };

    window.addEventListener("resize", handleScreenSizeChange);
    handleScreenSizeChange();

    darkModeMediaQuery.addEventListener("change", event => (isDarkMode.value = !!event.matches));

    let resolveUsersLoaded: () => void;
    const usersLoaded = new Promise<void>(r => {
        resolveUsersLoaded = r;
    });

    localForage
        .getItem<User[]>("users")
        .then((v: User[] | null) => {
            if (Array.isArray(v)) {
                const migratedUsers = v.map(user => {
                    const hasValidInGameId =
                        typeof user.inGame?.id === "number" &&
                        Number.isFinite(user.inGame.id) &&
                        user.inGame.id.toString().length === 8;

                    const migratedInGame = {
                        ...user.inGame,
                        enabled: Boolean(user.inGame?.enabled ?? hasValidInGameId),
                        useFastUpdate: Boolean(user.inGame?.useFastUpdate ?? false),
                    };
                    const migratedSettings = {
                        manuallyUpdate: user.settings?.manuallyUpdate ?? false,
                    };
                    return {
                        ...user,
                        inGame: migratedInGame,
                        settings: migratedSettings,
                        data: {
                            ...user.data,
                            ratingHistory: normalizeRatingHistory(user),
                        },
                    };
                });
                users.value = migratedUsers;
            }
        })
        .catch((err: unknown) => {
            console.error("Failed to load users:", err);
        })
        .finally(() => {
            resolveUsersLoaded!();
        });
    localForage.getItem<FavoriteList[]>("favorites").then((v: FavoriteList[] | null) => {
        if (Array.isArray(v)) favorites.value = v;
    });
    localForage.removeItem("chartsSortCachedV2").catch((err: unknown) => {
        console.error("Failed to remove stale charts sort cache:", err);
    });
    localForage.getItem<NearcadeData>("nearcadeData").then((v: NearcadeData | null) => {
        if (v) nearcadeData.value = v;
    });
    localForage
        .getItem<Partial<AppSettings>>("appSettings")
        .then((v: Partial<AppSettings> | null) => {
            if (!v) return;
            appSettings.value = {
                ...appSettings.value,
                ...v,
                defaultChartRatingDisplayMode:
                    v.defaultChartRatingDisplayMode ??
                    appSettings.value.defaultChartRatingDisplayMode,
                showDxScoreInB50: v.showDxScoreInB50 ?? appSettings.value.showDxScoreInB50,
                reverseSongsDifficultyAndVersionTabs:
                    v.reverseSongsDifficultyAndVersionTabs ??
                    appSettings.value.reverseSongsDifficultyAndVersionTabs,
            };
        });

    watch(
        users,
        (newUsers: User[]) => {
            if (!newUsers) return;
            localForage.setItem("users", toStorageValue(newUsers)).catch((err: unknown) => {
                console.error("Failed to save users:", err);
            });
        },
        { deep: true }
    );
    watch(
        favorites,
        (newFavorites: FavoriteList[]) => {
            if (!newFavorites) return;
            localForage.setItem("favorites", toRaw(newFavorites)).catch((err: unknown) => {
                console.error("Failed to save favorites:", err);
            });
        },
        { deep: true }
    );
    watch(
        nearcadeData,
        (newNearcadeData: NearcadeData) => {
            if (!newNearcadeData) return;
            localForage.setItem("nearcadeData", toRaw(newNearcadeData)).catch((err: unknown) => {
                console.error("Failed to save nearcade data:", err);
            });
        },
        { deep: true }
    );
    watch(
        appSettings,
        (newAppSettings: AppSettings) => {
            if (!newAppSettings) return;
            localForage.setItem("appSettings", toRaw(newAppSettings)).catch((err: unknown) => {
                console.error("Failed to save app settings:", err);
            });
        },
        { deep: true }
    );

    return {
        users,
        usersLoaded,
        chartsSort,
        favorites,
        isUpdated,
        isDarkMode,
        isSmallScreen,
        nearcadeData,
        musicDataLoading,
        appSettings,
    };
});
