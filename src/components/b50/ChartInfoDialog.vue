<template>
    <mdui-dialog ref="dialogRef" close-on-esc close-on-overlay-click :open="open">
        <mdui-top-app-bar slot="header">
            <mdui-button-icon icon="close" @click="dialogRef.open = false"></mdui-button-icon>
            <mdui-top-app-bar-title>{{ chart?.title }}</mdui-top-app-bar-title>
        </mdui-top-app-bar>

        Rating 阶梯：
        <mdui-list>
            <mdui-list-item v-for="i of raTable" nonclickable>
                <div slot="custom" class="list-container">
                    <div class="list-title">
                        {{ i.rank }}
                        <span class="description">{{ i.rate.toFixed(4) }}%</span>
                    </div>
                    <span v-if="i.ra > chart?.ra">
                        +{{ i.ra - chart?.ra }}
                    </span>
                    {{ i.ra }}
                </div>
            </mdui-list-item>
        </mdui-list>
    </mdui-dialog>
</template>

<script setup lang="ts">
import type { DivingFishMusicChart } from "@/divingfish/type";
import { defineProps, watch, nextTick, ref, computed } from "vue";

const props = defineProps<{
    open: boolean;
    chart: DivingFishMusicChart | null;
}>();
const dialogRef = ref<any>(null);

watch(() => props.open, async () => {
    await nextTick();
    if (dialogRef.value) {
        dialogRef.value.open = true;
    }
});

const SCORE_COEFFICIENT_TABLE: [number, number, string][] = [
    [100.5, 22.4, 'SSS+'],
    [100.4999, 22.2, 'SSS'],
    [100, 21.6, 'SSS'],
    [99.9999, 21.4, 'SS+'],
    [99.5, 21.1, 'SS+'],
    [99, 20.8, 'SS'],
    [98.9999, 20.6, 'S+'],
    [98, 20.3, 'S+'],
    [97, 20.0, 'S'],
    [96.9999, 17.6, 'AAA'],
    [94, 16.8, 'AAA'],
    [90, 15.2, 'AA'],
    [80, 13.6, 'A'],
    [79.9999, 12.8, 'BBB'],
    [75, 12.0, 'BBB'],
    [70, 11.2, 'BB'],
    [60, 9.6, 'B'],
    [50, 8.0, 'C'],
    [40, 6.4, 'D'],
    [30, 4.8, 'D'],
    [20, 3.2, 'D'],
    [10, 1.6, 'D'],
    [0, 0, 'D'],
]
const raTable = computed(() => {
    if (!props.chart) return [];
    const result = [];
    for (const i of SCORE_COEFFICIENT_TABLE) {
        result.push({
            rate: i[0],
            rank: i[2],
            ra: Math.floor(i[1] * props.chart.ds * Math.min(100.5, props.chart.achievements) / 100),
        });
        if (i[0] <= props.chart.achievements) break;
    }
    return result;
})
</script>

<style scoped>

.list-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 1.5rem 0.5rem 1rem;
}
.list-title {
    display: flex;
    flex-direction: column;
}
.description {
    color: rgb(var(--mdui-color-on-surface-variant));
    font-size: var(--mdui-typescale-body-medium-size);
    font-weight: var(--mdui-typescale-body-medium-weight);
    letter-spacing: var(--mdui-typescale-body-medium-tracking);
    line-height: var(--mdui-typescale-body-medium-line-height);
}
</style>