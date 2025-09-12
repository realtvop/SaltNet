<script setup lang="ts">
import type { Chart } from "@/components/data/music/type";
import type { DivingFishMusicChart } from "@/components/integrations/diving-fish/type";
import B50ToRender from "@/components/rendering/b50.vue";


function dfToSimpChart(ori: DivingFishMusicChart): Chart {
    return {
        score: {
            rankRate: ori.rate,
            achievements: ori.achievements,
            comboStatus: ori.fc,
            syncStatus: ori.fs,
            deluxeRating: ori.ra,
        },
        info: {
            grade: ori.level_index,
            constant: ori.ds,
        },
        music: {
            info: {
                id: ori.song_id,
                title: ori.title,
                type: ori.type,
            }
        },
    } as Chart;
}

const sd = [
    dfToSimpChart({
      "achievements": 101.0000,
      "ds": 12.4,
      "dxScore": 562,
      "fc": "fc",
      "fs": "",
      "level": "12",
      "level_index": 3,
      "level_label": "Master",
      "ra": 260,
      "rate": "ssp",
      "song_id": 763,
      "title": "Color My World",
      "type": "SD"
    }),
]
</script>

<template>
    <B50ToRender :b50-sd-charts="sd" :b50-dx-charts="sd" :player-name="'maimai'" :player-rating="14514" />
</template>