<script setup lang="ts">
    import { defineProps, defineEmits } from "vue";
    import type { Chart } from "@/components/data/music/type";
    import { getDFCoverURL } from "@/components/integrations/diving-fish";
    import { useShared } from "@/components/app/shared";

    const { data, rating, cover } = defineProps<{
        data: Chart;
        rating?: number | string;
        cover?: string;
    }>();
    const { isDarkMode } = useShared();

    const emit = defineEmits(["click"]);
</script>

<template>
    <div class="maimai-card-wrapper">
        <mdui-card
            :variant="isDarkMode ? 'filled' : 'elevated'"
            class="maimai-result-card"
            clickable
            @click="emit('click')"
        >
            <div class="song-jacket-section">
                <img
                    class="song-jacket-image"
                    :src="cover || getDFCoverURL(data.music.info.id)"
                    :alt="data.music.info.title"
                    crossorigin="anonymous"
                />
            </div>
            <div class="result-details-section">
                <div class="result-header">
                    <div class="header-pill">
                        <div class="pill-section charttype" :type="data.music.info.type">
                            <span>
                                {{ data.music.info.type }}
                            </span>
                        </div>
                        <div class="pill-section level" :difficulty="data.info.grade">
                            {{ data.info.constant ? data.info.constant.toFixed(1) : "" }}
                        </div>
                        <div class="pill-section points">
                            {{ rating }}
                        </div>
                    </div>
                </div>
                <div class="song-name">{{ data.music.info.title }}</div>
                <div class="achievement">
                    {{
                        typeof data.score?.achievements === "number"
                            ? data.score.achievements.toFixed(4)
                            : "-"
                    }}
                    <span
                        class="percentage-mark"
                        v-if="typeof data.score?.achievements === 'number'"
                    >
                        %
                    </span>
                </div>
                <div class="achievement-badges">
                    <div class="rank-achievement">
                        <img
                            class="achievement-icon"
                            :src="`/icons/${data.score?.rankRate?.replace('p', 'plus')}.png`"
                            v-if="data.score?.rankRate"
                        />
                    </div>
                    <div class="fc-achievement">
                        <img
                            class="achievement-icon"
                            :src="`/icons/music_icon_${data.score?.comboStatus ?? ''}.png`"
                            v-if="data.score?.comboStatus"
                        />
                    </div>
                    <div class="sync-achievement">
                        <img
                            class="achievement-icon"
                            :src="`/icons/music_icon_${data.score?.syncStatus?.replace('sd', 'dx')}.png`"
                            v-if="data.score?.syncStatus"
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
        /* aspect-ratio: 2.5 / 1; */
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
        object-fit: cover;
        object-position: center;
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
        color: white;
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
    .pill-section.level[difficulty="0"] {
        background: #96d767;
    }
    .pill-section.level[difficulty="1"] {
        background: #eeba41;
    }
    .pill-section.level[difficulty="2"] {
        background: #ef888f;
    }
    .pill-section.level[difficulty="3"] {
        background: #b54fdf;
    }
    .pill-section.level[difficulty="4"] {
        background: #d3acf9;
    }
    .pill-section.level[difficulty="5"] {
        background: #ee78f6;
    }
    @media (prefers-color-scheme: dark) {
        .pill-section.level[difficulty="0"] {
            background: #45c124;
        }
        .pill-section.level[difficulty="1"] {
            background: #ffba01;
        }
        .pill-section.level[difficulty="2"] {
            background: #ff7b7b;
        }
        .pill-section.level[difficulty="3"] {
            background: #9f51dc;
        }
        .pill-section.level[difficulty="4"] {
            background: #dbaaff;
        }
        .pill-section.level[difficulty="5"] {
            background: #ff6ffd;
        }
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
