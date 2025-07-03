<script setup lang="ts">
    import { defineProps, defineEmits } from "vue";
    import type { Chart } from "@/types/music";
    import type { DivingFishFullRecord } from "@/divingfish/type";

    const { data, rating, cover } = defineProps<{
        data: Chart | DivingFishFullRecord;
        rating?: number | string;
        cover?: string;
    }>();

    const emit = defineEmits(["click"]);
</script>

<template>
    <div class="maimai-card-wrapper">
        <mdui-card variant="filled" class="maimai-result-card" clickable @click="emit('click')">
            <div class="song-jacket-section">
                <div
                    class="song-jacket-image"
                    :style="{
                        'background-image': cover ? `url('${cover}')` : `url('https://www.diving-fish.com/covers/${getChartInfo.musicIdString(data)}.png')`,
                    }"
                ></div>
            </div>
            <div class="result-details-section">
                <div class="result-header">
                    <div class="header-pill">
                        <div class="pill-section charttype" :type="getChartInfo.type(data)">
                            <span>
                                {{ getChartInfo.type(data) }}
                            </span>
                        </div>
                        <div
                            class="pill-section level"
                            :style="{
                                background: `#${['45c124', 'ffba01', 'ff7b7b', '9f51dc', 'dbaaff', 'ff6ffd'][getChartInfo.grade(data)]}`,
                            }"
                        >
                            {{ getChartInfo.constant(data) ? getChartInfo.constant(data).toFixed(1) : "" }}
                        </div>
                        <div class="pill-section points">
                            {{ rating }}
                        </div>
                    </div>
                </div>
                <div class="song-name">{{ getChartInfo.title(data) }}</div>
                <div class="achievement">
                    {{
                        typeof getChartInfo.achievements(data) === "number"
                            ? getChartInfo.achievements(data)?.toFixed(4)
                            : "-"
                    }}
                    <span
                        class="percentage-mark"
                        v-if="typeof getChartInfo.achievements(data) === 'number'"
                    >
                        %
                    </span>
                </div>
                <div class="achievement-badges">
                    <div class="rank-achievement">
                        <img
                            class="achievement-icon"
                            :src="`/icons/${getChartInfo.rankRate(data)?.replace('p', 'plus')}.png`"
                            v-if="getChartInfo.rankRate(data)"
                        />
                    </div>
                    <div class="fc-achievement">
                        <img
                            class="achievement-icon"
                            :src="`/icons/music_icon_${getChartInfo.comboStatus(data) ?? ''}.png`"
                            v-if="getChartInfo.comboStatus(data)"
                        />
                    </div>
                    <div class="sync-achievement">
                        <img
                            class="achievement-icon"
                            :src="`/icons/music_icon_${getChartInfo.syncStatus(data)?.replace('sd', 'dx')}.png`"
                            v-if="getChartInfo.syncStatus(data)"
                        />
                    </div>
                </div>
            </div>
        </mdui-card>
    </div>
</template>

<style scoped>
    .maimai-card-wrapper {
        width: 100%;
        max-width: none;
        padding: 5px;
        box-sizing: border-box;
    }

    .maimai-result-card {
        display: flex;
        overflow: hidden;
        aspect-ratio: 2.5 / 1;
        width: 100%;
        height: auto;
        min-height: 85px;
        text-align: left;
    }

    .song-jacket-section {
        flex: 0 0 40%;
        position: relative;
    }

    .song-jacket-image {
        width: 100%;
        height: 100%;
        position: absolute;
        background-size: cover;
        background-position: center;
    }

    .result-details-section {
        flex: 0 0 60%;
        padding: 6px;
        color: var(--card-text-color, white);
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 60%;
        box-sizing: border-box;
    }

    .result-header {
        height: 15px;
        flex-shrink: 0;
    }

    .header-pill {
        display: flex;
        height: 100%;
        border-radius: 7.5px;
        overflow: hidden;
        margin-left: 1.5%;
        width: 97.5%;
    }

    .pill-section {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 9px;
        text-align: center;
        padding: 0 2.25px;
    }

    .pill-section.charttype {
        background-color: #63acf8;
        font-weight: 1000;
        flex-grow: 0.5;
    }
    .pill-section.charttype[type="DX"] {
        background-color: white;
        /* color: #ff6600; */
    }
    .pill-section.charttype[type="DX"] > span {
        background: linear-gradient(-20deg, #eb5639 55%, #efb03e 45%);
        background-clip: text;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    .pill-section.level {
        color: white;
        flex-grow: 0.75;
    }

    .pill-section.points {
        background: linear-gradient(90deg, #ff9933 0%, #ff6600 100%);
        color: white;
    }

    .song-name {
        font-size: 10.5px;
        font-weight: bold;
        margin-top: 1.5px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-shrink: 0;
        width: 100%;
        max-width: 100%;
        display: block;
        box-sizing: border-box;
    }

    .achievement {
        font-size: 19.5px;
        font-weight: bold;
        line-height: 1;
        margin-bottom: 1.5px;
        flex-shrink: 0;
        white-space: nowrap;
        overflow: hidden;
        width: 100%;
        max-width: 100%;
        display: block;
        box-sizing: border-box;
    }

    .percentage-mark {
        font-size: 12px;
    }

    .achievement-badges {
        display: flex;
        justify-content: space-around;
        align-items: center;
        flex-shrink: 0;
    }

    .rank-achievement,
    .fc-achievement,
    .sync-achievement {
        width: 22.5px;
        height: 22.5px;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .rank-achievement {
        background: transparent;
        border: none;
        box-shadow: none;
        flex-grow: 0.4;
    }

    .fc-achievement,
    .sync-achievement {
        background: var(--badge-bg-color, #666);
        border-radius: 50%;
        position: relative;
        overflow: hidden;
    }

    .achievement-icon {
        width: 100%;
        height: 100%;
        object-fit: contain;
        position: absolute;
    }

    .rank-achievement .achievement-icon {
        position: relative;
        top: unset;
        left: unset;
        transform: none;
    }
</style>

<style>
    :root {
        --card-bg-color: #f0f0f0;
        --card-border-color: #ccc;
        --card-text-color: #333;
        --card-hover-color: #666;
        --badge-bg-color: #ddd;
    }

    @media (prefers-color-scheme: dark) {
        :root {
            --card-bg-color: #333;
            --card-border-color: #555;
            --card-text-color: white;
            --card-hover-color: white;
            --badge-bg-color: #666;
        }
    }
</style>

<script lang="ts">
    export enum ChartDataType {
        Chart,
        DivingFishFullRecord,
    }

    export function checkChartDataType(chart: Chart | DivingFishFullRecord) {
        return "song_id" in chart ? ChartDataType.DivingFishFullRecord : ChartDataType.Chart;
    }

    export const getChartInfo = {
        // 信息
        musicIdString: (chart: Chart | DivingFishFullRecord) => {
            const id =
                checkChartDataType(chart) === ChartDataType.Chart
                    ? (chart as Chart).music.info.id
                    : (chart as DivingFishFullRecord).song_id;
            return `${"0".repeat(5 - id.toString().length)}${id}`;
        },
        title: (chart: Chart | DivingFishFullRecord) =>
            checkChartDataType(chart) === ChartDataType.Chart
                ? (chart as Chart).music.info.title
                : (chart as DivingFishFullRecord).title,
        type: (chart: Chart | DivingFishFullRecord) =>
            checkChartDataType(chart) === ChartDataType.Chart
                ? (chart as Chart).music.info.type
                : (chart as DivingFishFullRecord).type,
        constant: (chart: Chart | DivingFishFullRecord) =>
            checkChartDataType(chart) === ChartDataType.Chart
                ? (chart as Chart).info.constant
                : (chart as DivingFishFullRecord).ds,
        grade: (chart: Chart | DivingFishFullRecord) =>
            checkChartDataType(chart) === ChartDataType.Chart
                ? (chart as Chart).info.grade
                : (chart as DivingFishFullRecord).level_index,
        // 成绩
        deluxeRating: (chart: Chart | DivingFishFullRecord) =>
            checkChartDataType(chart) === ChartDataType.Chart
                ? ((chart as Chart).score?.deluxeRating ?? null)
                : (chart as DivingFishFullRecord).ra,
        achievements: (chart: Chart | DivingFishFullRecord) =>
            checkChartDataType(chart) === ChartDataType.Chart
                ? ((chart as Chart).score?.achievements ?? null)
                : (chart as DivingFishFullRecord).achievements,
        rankRate: (chart: Chart | DivingFishFullRecord) =>
            checkChartDataType(chart) === ChartDataType.Chart
                ? ((chart as Chart).score?.rankRate ?? null)
                : (chart as DivingFishFullRecord).rate,
        comboStatus: (chart: Chart | DivingFishFullRecord) =>
            checkChartDataType(chart) === ChartDataType.Chart
                ? ((chart as Chart).score?.comboStatus ?? null)
                : (chart as DivingFishFullRecord).fc,
        syncStatus: (chart: Chart | DivingFishFullRecord) =>
            checkChartDataType(chart) === ChartDataType.Chart
                ? ((chart as Chart).score?.syncStatus ?? null)
                : (chart as DivingFishFullRecord).fs,
    };
</script>
