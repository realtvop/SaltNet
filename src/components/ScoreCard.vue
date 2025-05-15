<script setup lang="ts">
import { defineProps, defineEmits } from 'vue';
import type { ChartExtended } from '@/types/music';

const props = defineProps<{
    data: ChartExtended & {
        achievements?: number;
        ra?: number;
        rate?: string;
        fc?: string;
        fs?: string;
        title?: string;
        song_id?: number;
        type?: string;
        level_index?: number;
    };
}>();

const emit = defineEmits(['click']);
</script>

<template>
<div class="maimai-card-wrapper">
    <mdui-card variant="filled" class="maimai-result-card" clickable @click="emit('click')">
        <div class="song-jacket-section">
            <div class="song-jacket-image" :style="{ 'background-image': `url('https://www.diving-fish.com/covers/${props.data.song_id ? '0'.repeat(5 - props.data.song_id.toString().length) + props.data.song_id : '00000'}.png')` }"></div>
        </div>
        <div class="result-details-section">
            <div class="result-header">
                <div class="header-pill">
                    <div class="pill-section charttype" :type="props.data.music ? props.data.music.type : (props.data.type ?? '')"><span>{{ props.data.music ? props.data.music.type : (props.data.type ?? '') }}</span></div>
                    <div class="pill-section level" :style="{ background: `#${['45c124', 'ffba01', 'ff7b7b', '9f51dc', 'dbaaff', 'ff6ffd'][(props.data.grade ?? props.data.level_index ?? 0)]}` }">{{ props.data.ds?.toFixed ? props.data.ds.toFixed(1) : props.data.ds }}</div>
                    <div class="pill-section points">{{ props.data.ra ?? '' }}</div>
                </div>
            </div>
            <div class="song-name">{{ props.data.title ?? '' }}</div>
            <div class="achievement">{{ typeof props.data.achievements === 'number' ? props.data.achievements.toFixed(4) : (props.data.achievements ?? '-') }}<span class="percentage-mark" v-if="typeof props.data.achievements === 'number'">%</span></div>
            <div class="achievement-badges">
                <div class="rank-achievement">
                    <img class="achievement-icon" :src="`/icons/${props.data.rate ? props.data.rate.replace('p', 'plus') : ''}.png`" v-if="props.data.rate">
                </div>
                <div class="fc-achievement">
                    <img class="achievement-icon" :src="`/icons/music_icon_${props.data.fc ?? ''}.png`" v-if="props.data.fc">
                </div>
                <div class="sync-achievement">
                    <img class="achievement-icon" :src="`/icons/music_icon_${props.data.fs ? props.data.fs.replace('sd', 'dx') : ''}.png`" v-if="props.data.fs">
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

.rank-achievement, .fc-achievement, .sync-achievement {
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

.fc-achievement, .sync-achievement {
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