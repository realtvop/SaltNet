import { defineStore } from "pinia";
import { ref, watch, toRaw, computed } from "vue";
import localForage from "localforage";

import type { ChartsSortCached, FavoriteList, User } from "@/components/data/user/type";
import type { Chart } from "@/components/data/music/type";
import type { NearcadeData } from "../integrations/nearcade/type";
import type { SaltNetDatabaseLogin } from "@/components/data/user/database";
import type { MaimaidxRegion } from "@/components/data/user/database/type";
import { setRegionGetter } from "@/components/data/music";

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
    const musicDataLoading = ref<boolean>(false);

    const saltNetAccount = computed<SaltNetDatabaseLogin | null>({
        get: () => users.value[0]?.saltnetDB ?? null,
        set: (value: SaltNetDatabaseLogin | null) => {
            if (value) {
                if (users.value.length === 0) {
                    users.value.push({
                        remark: null,
                        saltnetDB: value,
                        divingFish: { name: null },
                        inGame: { id: null, enabled: false, useFastUpdate: false },
                        lxns: { auth: null, name: null, id: null },
                        settings: { manuallyUpdate: false },
                        data: {
                            updateTime: null,
                            name: null,
                            rating: null,
                        },
                    });
                } else {
                    users.value[0].saltnetDB = value;
                }
            } else if (users.value.length > 0) {
                users.value[0].saltnetDB = undefined;
            }
        },
    });

    const handleScreenSizeChange = () => {
        isSmallScreen.value = window.innerWidth < 560;
    };

    window.addEventListener("resize", handleScreenSizeChange);
    handleScreenSizeChange();

    darkModeMediaQuery.addEventListener("change", event => (isDarkMode.value = !!event.matches));
    localForage.getItem<User[]>("users").then((v: User[] | null) => {
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
                };
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

    // Migrate old saltNetAccount to first user's saltnetDB
    localForage
        .getItem<SaltNetDatabaseLogin>("saltNetAccount")
        .then((v: SaltNetDatabaseLogin | null) => {
            if (v) {
                saltNetAccount.value = v;
                localForage.removeItem("saltNetAccount");
            }
        });

    // Set up region getter for music module
    setRegionGetter(() => (saltNetAccount.value?.maimaidxRegion as MaimaidxRegion) ?? "cn");

    watch(
        users,
        (newUsers: User[]) => {
            if (!newUsers) return;
            localForage.setItem("users", toRaw(newUsers)).catch((err: unknown) => {
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
    watch(chartsSort, (newChartsSort: ChartsSortCached) => {
        if (!newChartsSort) return;
        localForage.setItem("chartsSortCached", toRaw(newChartsSort)).catch((err: unknown) => {
            console.error("Failed to save charts sort:", err);
        });
    });
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

    return {
        users,
        chartsSort,
        favorites,
        isUpdated,
        isDarkMode,
        isSmallScreen,
        nearcadeData,
        saltNetAccount,
        musicDataLoading,
    };
});
