<script setup lang="ts">
    import type { Chart } from "@/components/data/music/type";
    import type { DivingFishMusicChart } from "@/components/integrations/diving-fish/type";
    import B50ToRender from "@/components/rendering/b50.vue";
    import { useRoute } from "vue-router";

    const route = useRoute();
    const sdo = JSON.parse((route.query.s as string) || "[]");
    const dxo = JSON.parse((route.query.d as string) || "[]");
    const playerName = (route.query.n as string) || "wmc";
    const playerSecondaryName = (route.query.o as string) || null;
    const playerRating = route.query.r ? parseInt(route.query.r as string) : null;

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
                },
            },
        } as Chart;
    }

    const sd: Chart[] = [];
    const dx: Chart[] = [];

    if (dxo)
        for (const chart of dxo as DivingFishMusicChart[]) {
            dx.push(dfToSimpChart(chart));
        }
    if (sdo)
        for (const chart of sdo as DivingFishMusicChart[]) {
            sd.push(dfToSimpChart(chart));
        }
</script>

<template>
    <B50ToRender
        :b50-sd-charts="sd"
        :b50-dx-charts="dx"
        :player-name="playerName"
        :player-secondary-name="playerSecondaryName"
        :player-rating="playerRating"
        style="margin-left: -80px;"
    />
</template>
