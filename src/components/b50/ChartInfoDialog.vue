<template>
    <mdui-dialog ref="dialogRef" close-on-esc close-on-overlay-click :open="open" v-if="chart">
        <mdui-top-app-bar slot="header">
            <mdui-button-icon icon="close" @click="dialogRef.open = false"></mdui-button-icon>
            <mdui-top-app-bar-title>{{ chart.music.title }}</mdui-top-app-bar-title>
        </mdui-top-app-bar>

        <img class="song-cover" :src="`https://www.diving-fish.com/covers/${'0'.repeat(5 - chart.music.id.toString().length)}${chart.music.id}.png`" />

        <div class="chip-container">
            <mdui-chip icon="music_note">{{ chart.music.artist || '未知' }}</mdui-chip>
            <mdui-chip icon="access_time_filled">{{ chart.music.genre || '未知' }}</mdui-chip>
            <mdui-chip icon="star">{{ chart.music.type || '未知' }}</mdui-chip>
            <mdui-chip icon="edit">{{ chart.charter || '未知' }}</mdui-chip>
        </div>

        <h3>Rating 阶段</h3>
        <mdui-list>
            <mdui-list-item v-for="i of raTable" nonclickable>
                <div slot="custom" class="list-container">
                    <div class="list-title">
                        {{ i.rank }}
                        <span class="description">{{ i.rate.toFixed(4) }}%</span>
                    </div>
                    <span v-if="i.ra > (chart.ra ?? 0)">
                        +{{ i.ra - (chart.ra ?? 0) }}
                    </span>
                    {{ i.ra }}
                </div>
            </mdui-list-item>
        </mdui-list>
    </mdui-dialog>
</template>

<script setup lang="ts">
import type { ChartExtended } from '@/types/music';
import { defineProps, watch, nextTick, ref, computed } from "vue";

const props = defineProps<{
    open: boolean;
    chart: (ChartExtended & {
        achievements?: number;
        ra?: number;
        rate?: string;
        fc?: string;
        fs?: string;
        title?: string;
        song_id?: number;
    }) | null;
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
    const achievements = typeof props.chart.achievements === 'number' ? props.chart.achievements : 0;
    const ds = props.chart.ds;
    const result = [];
    for (const i of SCORE_COEFFICIENT_TABLE) {
        result.push({
            rate: i[0],
            rank: i[2],
            ra: Math.floor(i[1] * ds * Math.min(100.5, achievements) / 100),
        });
        if (i[0] <= achievements) break;
    }
    return result;
})
</script>

<style scoped>
.song-cover {
    width: 100%;
    height: auto;
    aspect-ratio: 1 / 1;
    margin: 0 auto;
    display: block;

    background: image('https://www.diving-fish.com/covers/00000.png');
}

.chip-container {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 16px 0;
    justify-content: center;
}

h3 {
    margin-bottom: 0;
}
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