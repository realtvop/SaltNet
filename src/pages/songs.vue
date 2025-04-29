<script setup lang="ts">
import { ref, watch } from 'vue';
import type { User } from '@/types/user';
import localForage from "localforage";
import type { Chart, SavedMusicList } from '@/types/music';

const users = ref<User[]>([]);
const chartList = ref<Record<string, Chart[]> | null>(null);
const selectedDifficulty = ref<string>("1");
const difficulties = [ "1", "2", "3", "4", "5", "6", "7", "7+", "8", "8+", "9", "9+", "10", "10+", "11", "11+", "12", "12+", "13", "13+", "14", "14+", "15" ];

localForage.getItem<User[]>("users").then(v => {
    if (Array.isArray(v)) users.value = v;
});
localForage.getItem<SavedMusicList>("musicInfo").then(v => {
    if (!v) return;
    const sorted: Record<string, Chart[]> = {};
    // musicList.value = v;
    for (const i in v.chartList) {
        const chart = v.chartList[i] as Chart;
        chart.test = i;
        sorted[chart.level] = sorted[chart.level] || [];
        sorted[chart.level].push(chart);
    }
    for (const i in sorted) {
        sorted[i].sort((a, b) =>  b.ds - a.ds);
    }
    chartList.value = sorted;
    console.log(sorted)
});
</script>

<template>
<mdui-tabs :value="selectedDifficulty">
    <mdui-tab v-for="difficulty in difficulties" :value="difficulty" @click="selectedDifficulty = difficulty">{{ difficulty }}</mdui-tab>
</mdui-tabs>
<mdui-card variant="filled" v-for="chart in chartList[selectedDifficulty]">
    {{ chart.music.title }}
    {{ chart.ds }}
</mdui-card>
</template>

<style scoped>
mdui-tabs {
    width: 100%;
}
mdui-card {
    width: 100%;
    height: 100px;
}
</style>