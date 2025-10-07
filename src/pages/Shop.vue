<script lang="ts" setup>
    import type { Game, Shop } from "@/components/integrations/nearcade/type";
    import { snackbar, prompt } from "mdui";
    import { ref, computed, onMounted, watch } from "vue";
    import { useShared } from "@/components/app/shared";
    import type { AttendanceApiResponse } from "@/components/integrations/nearcade/types/Attendance";
    import { markDialogClosed, markDialogOpen } from "@/components/app/router.vue";
    import { setAPIKey } from "@/components/integrations/nearcade/setAPIKey";

    const { nearcadeData } = useShared();
    const nearShops = ref<Shop[] | null>(null);
    const distanceSliderValues = [1, 5, 10, 15, 20, 25, 30];
    const maxDistanceIndex = ref(2);
    const sliderRef = ref<HTMLElement | null>(null);
    const tabsRef = ref<HTMLElement | null>(null);
    const selectedShop = ref<Shop | null>(null);
    const selectShopAttendance = ref<AttendanceApiResponse | null>(null);
    const currentMode = ref<"all" | "nearby">("all");
    const searchQuery = ref("");

    const ArcadeShortenNames: { [key: string]: string } = {
        "maimai DX": "mai",
        CHUNITHM: "chuni",
        "SOUND VOLTEX": "sdvx",
        太鼓之达人: "taiko",
        WACCA: "wacca",
    };

    const filteredShops = computed(() => {
        if (currentMode.value === "all") return nearShops.value;
        if (!nearShops.value) return null;
        return nearShops.value.filter(
            shop =>
                shop.distance! <= distanceSliderValues[maxDistanceIndex.value] &&
                shop.name.includes(searchQuery.value)
        );
    });
    onMounted(() => {
        // 设置 mdui-slider 的 labelFormatter，使 tooltip 显示对应的公里数
        if (sliderRef.value) {
            // mdui 自定义元素上可直接设置 labelFormatter 函数
            (sliderRef.value as any).labelFormatter = (val: number) => {
                const idx = Number(val);
                const km = distanceSliderValues[idx] ?? distanceSliderValues[0];
                return `${km} km`;
            };
        }
        if (nearcadeData.currentShopId) {
            loadShopByID(nearcadeData.currentShopId);
            loadFavShops();
        }
    });
    const favoriteShops = ref<{ shop: Shop; attendance: AttendanceApiResponse }[]>([]);
    async function loadFavShops() {
        const shops: { shop: Shop; attendance: AttendanceApiResponse }[] = [];
        for (const id of nearcadeData.favoriteShopIds) {
            const shop = await fetch(`https://nearcade.phizone.cn/api/shops/bemanicn/${id}`).then(
                response => response.json()
            );
            const attendance = await fetch(
                `https://nearcade.phizone.cn/api/shops/bemanicn/${id}/attendance`
            ).then(response => response.json());
            if (shop && shop.shop)
                shops.push({
                    shop: shop.shop,
                    attendance: attendance,
                });
        }
        favoriteShops.value = shops;
    }
    function loadShopByID(id: number) {
        fetch(`https://nearcade.phizone.cn/api/shops/bemanicn/${id}`)
            .then(response => response.json())
            .then(result => {
                selectedShop.value = result.shop;
                (tabsRef.value as any).value = "view";
                loadAttendance();
            });
    }
    function loadAttendance() {
        if (!selectedShop.value) return;
        fetch(`https://nearcade.phizone.cn/api/shops/bemanicn/${selectedShop.value.id}/attendance`)
            .then(response => response.json())
            .then(result => {
                selectShopAttendance.value = result;
            });
    }
    function getArcadeAttendanceCount(gameId: number) {
        if (!selectShopAttendance.value) return 0;
        const record = selectShopAttendance.value.reported.find(a => a.gameId === gameId);
        return record ? record.currentAttendances : 0;
    }
    function searchAllShops() {
        if (currentMode.value !== "all") return;
        fetch(`https://nearcade.phizone.cn/api/shops?q=${searchQuery.value}&limit=114514`)
            .then(response => response.json())
            .then(result => {
                nearShops.value = result.shops;
            });
    }
    function getNearcades() {
        if (!navigator.geolocation) {
            snackbar({
                message: "获取定位失败: 浏览器不支持定位功能",
            });
            return;
        }

        navigator.geolocation.getCurrentPosition(
            position => {
                const { latitude, longitude } = position.coords;

                fetch(
                    `https://nearcade.phizone.cn/api/discover?longitude=${longitude}&latitude=${latitude}&radius=30&name=`
                )
                    .then(response => response.json())
                    .then(result => {
                        nearShops.value = result.shops;
                        currentMode.value = "nearby";
                    });
            },
            error => {
                snackbar({
                    message: `获取定位失败：${error.message}`,
                });
            }
        );
    }

    watch(selectedShop, (newShop: Shop | null) => {
        if (!newShop) return;
        nearcadeData.currentShopId = newShop.id;
    });

    function switchFavorites(shop: Shop) {
        if (nearcadeData.favoriteShopIds.includes(shop.id)) {
            nearcadeData.favoriteShopIds = nearcadeData.favoriteShopIds.filter(
                id => id !== shop.id
            );
            snackbar({
                message: `已从收藏中移除 ${shop.name}`,
            });
        } else {
            nearcadeData.favoriteShopIds.push(shop.id);
            snackbar({
                message: `已添加 ${shop.name} 到收藏`,
            });
        }
        loadFavShops();
    }

    function updateAtendance(game: Game) {
        if (!nearcadeData.APIKey) {
            snackbar({ message: "请先设置 nearcade API Key" });
            return setAPIKey();
        }
        const evtListener = function (event: KeyboardEvent) {
            if (event.key === "Enter") {
                //@ts-ignore
                document.querySelector("body > mdui-dialog > mdui-button:nth-child(3)").click();
            }
        };
        window.addEventListener("keydown", evtListener);
        prompt({
            headline: `更新 ${game.name} 的卡数`,
            description: "请输入当前的卡数",
            textFieldOptions: {
                type: "number",
            },
            confirmText: "更新",
            cancelText: "取消",
            onOpen: markDialogOpen,
            onClose: markDialogClosed,
            closeOnEsc: true,
            closeOnOverlayClick: true,
            onConfirm: (value: string) => {
                window.removeEventListener("keydown", evtListener);
                const currentAttendances = parseInt(value);
                return fetch(
                    `https://nearcade.phizone.cn/api/shops/bemanicn/${selectedShop.value?.id}/attendance`,
                    {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${nearcadeData.APIKey}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            games: [
                                {
                                    id: game.gameId,
                                    currentAttendances,
                                },
                            ],
                        }),
                    }
                )
                    .then(() => {
                        snackbar({ message: "已更新卡数" });
                        loadAttendance();
                    })
                    .catch(error => {
                        console.error("Error:", error);
                        snackbar({ message: `更新卡数失败: ${error.message}` });
                    });
            },
        });
    }
</script>

<template>
    <mdui-list-item nonclickable>
        <div class="current-shop">
            <div style="display: flex; align-items: center">
                <div>{{ selectedShop ? selectedShop.name : "未选择店铺" }}</div>
                <mdui-button-icon
                    @click="switchFavorites(selectedShop)"
                    :icon="
                        nearcadeData.favoriteShopIds.includes(selectedShop.id)
                            ? 'favorite'
                            : 'favorite_outline'
                    "
                    v-if="selectedShop"
                ></mdui-button-icon>
            </div>
            <div style="display: flex">
                <mdui-button-icon @click="currentMode = 'all'" icon="search"></mdui-button-icon>
                <mdui-button-icon @click="getNearcades" icon="edit_location_alt"></mdui-button-icon>
            </div>
        </div>
    </mdui-list-item>

    <mdui-tabs ref="tabsRef" value="find" full-width>
        <mdui-tab value="view">店铺</mdui-tab>
        <mdui-tab-panel slot="panel" value="view" v-if="selectedShop">
            <mdui-list style="white-space: break-spaces">
                <mdui-list-item nonclickable>
                    {{ selectedShop.address.detailed }}
                    <mdui-icon slot="icon" name="location_on"></mdui-icon>
                </mdui-list-item>
                <mdui-list-item nonclickable>
                    <div slot="description">{{ selectedShop.comment }}</div>
                    <mdui-icon slot="icon" name="description"></mdui-icon>
                </mdui-list-item>
                <mdui-list-item nonclickable>
                    <mdui-divider />
                </mdui-list-item>
                <mdui-list-item
                    v-for="(game, index) in selectedShop.games"
                    :key="index"
                    rounded
                    @click="updateAtendance(game)"
                >
                    {{ game.name }}
                    <span slot="description">
                        [{{ game.cost }}] {{ game.version }} x {{ game.quantity }}
                    </span>
                    <div class="distance-badge" slot="end-icon">
                        <span>{{ getArcadeAttendanceCount(game.gameId) }} 卡</span>
                    </div>
                    <mdui-icon slot="icon" name="videogame_asset"></mdui-icon>
                </mdui-list-item>
            </mdui-list>
        </mdui-tab-panel>

        <mdui-tab value="fav">收藏</mdui-tab>
        <mdui-tab-panel slot="panel" value="fav">
            <mdui-list-item v-for="shop in favoriteShops" :key="shop.shop.id">
                <div @click="loadShopByID(shop.shop.id)" style="width: 100%; text-align: left">
                    {{ shop.shop.name }}
                </div>
                <span slot="description">
                    [{{ shop.shop.address.general[shop.shop.address.general.length - 1] }}]
                    {{ shop.attendance.total }} 人在勤
                    <br />
                    <span v-for="(game, index) in shop.shop.games" :key="index">
                        {{ game.quantity }}{{ ArcadeShortenNames[game.name] || game.name }}&nbsp;
                    </span>
                </span>

                <mdui-button-icon
                    slot="end-icon"
                    icon="delete"
                    @click="switchFavorites({ id: shop.shop.id, name: '' } as Shop)"
                ></mdui-button-icon>
            </mdui-list-item>
        </mdui-tab-panel>

        <mdui-tab value="find">发现</mdui-tab>
        <mdui-tab-panel slot="panel" value="find">
            <mdui-text-field
                label="搜索店铺"
                icon="search"
                @input="searchQuery = $event.target.value"
                @keyup.enter="searchAllShops"
                type="search"
            >
                <mdui-button-icon
                    slot="end-icon"
                    icon="arrow_forward"
                    v-if="currentMode === 'all'"
                ></mdui-button-icon>
            </mdui-text-field>
            <mdui-slider
                ref="sliderRef"
                :max="distanceSliderValues.length - 1"
                @input.number="maxDistanceIndex = $event.target.value"
                :value="maxDistanceIndex"
                v-if="currentMode === 'nearby'"
                tickmarks
            ></mdui-slider>

            <mdui-list>
                <mdui-list-item
                    v-for="shop in filteredShops"
                    :key="shop.id"
                    @click="selectedShop = shop"
                    :active="shop.id === selectedShop?.id"
                >
                    {{ shop.name }}
                    <div class="distance-badge" slot="end-icon" v-if="shop.distance">
                        {{ shop.distance?.toFixed(2) }} km
                    </div>
                    <span slot="description">
                        [{{ shop.address.general[shop.address.general.length - 1] }}]
                        {{ shop.address.detailed }}
                    </span>
                </mdui-list-item>
            </mdui-list>
        </mdui-tab-panel>
    </mdui-tabs>
</template>

<style scoped>
    .current-shop {
        display: flex;
        width: 100%;
        justify-content: space-between;
        align-items: center;
    }
    .distance-badge {
        border-radius: 1rem;
        background-color: rgb(var(--mdui-color-surface-container-highest));
        padding: 0.5rem;
    }
    mdui-slider {
        margin-top: 0.5rem;
    }
    mdui-text-field {
        margin-top: 0.5rem;
        padding: 0 1rem;
    }
    mdui-tabs {
        overflow-x: hidden;
    }
</style>
