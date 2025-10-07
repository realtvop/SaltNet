<script lang="ts" setup>
    import type { Shop } from "@/components/integrations/nearcade/type";
    import { snackbar } from "mdui";
    import { ref, computed, onMounted } from "vue";

    const nearShops = ref<Shop[] | null>(null);
    const distanceSliderValues = [1, 5, 10, 15, 20, 25, 30];
    const maxDistanceIndex = ref(2);
    const sliderRef = ref<HTMLElement | null>(null);
    const selectedShop = ref<Shop | null>(null);

    const filteredShops = computed(() => {
        if (!nearShops.value) return null;
        return nearShops.value.filter(
            shop => shop.distance! <= distanceSliderValues[maxDistanceIndex.value]
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
    });
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
                    });
            },
            error => {
                snackbar({
                    message: `获取定位失败：${error.message}`,
                });
            }
        );
    }
</script>

<template>
    <mdui-list-item nonclickable>
        <div class="current-shop">
            <div>当前店铺: {{ selectedShop ? selectedShop.name : "无" }}</div>
            <mdui-button-icon @click="getNearcades" icon="edit_location_alt"></mdui-button-icon>
        </div>
    </mdui-list-item>

    <mdui-slider
        ref="sliderRef"
        :max="distanceSliderValues.length - 1"
        @input.number="maxDistanceIndex = $event.target.value"
        :value="maxDistanceIndex"
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
            <div class="distance-badge" slot="end-icon">{{ shop.distance?.toFixed(2) }} km</div>
            <span slot="description">
                [{{ shop.address.general[shop.address.general.length - 1] }}]
                {{ shop.address.detailed }}
            </span>
        </mdui-list-item>
    </mdui-list>
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
</style>
