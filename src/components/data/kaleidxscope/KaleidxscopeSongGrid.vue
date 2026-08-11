<script setup lang="ts">
    import { computed } from "vue";
    import type { Chart } from "@/components/data/music/type";
    import { getChartDifficultyFullLabel } from "@/components/data/chart/difficulty";
    import { getCoverURL } from "@/components/integrations/assets";
    import { resolveKaleidxscopeSongChart } from "./index";
    import type { KaleidxscopeSong } from "./type";

    const props = withDefaults(
        defineProps<{
            title: string;
            description?: string;
            songs: readonly KaleidxscopeSong[];
            charts: readonly Chart[];
            preferredGrade?: number;
            open?: boolean;
        }>(),
        {
            description: "",
            preferredGrade: 3,
            open: true,
        }
    );

    const emit = defineEmits<{
        selectChart: [chart: Chart];
    }>();

    const chartsByMusicId = computed(() => {
        const index = new Map<number, Chart[]>();
        for (const chart of props.charts) {
            const existing = index.get(chart.music.id);
            if (existing) existing.push(chart);
            else index.set(chart.music.id, [chart]);
        }
        return index;
    });

    const songEntries = computed(() =>
        props.songs.map(song => ({
            song,
            chart: resolveKaleidxscopeSongChart(
                song,
                chartsByMusicId.value.get(song.musicId) ?? [],
                props.preferredGrade
            ),
        }))
    );

    function selectChart(chart: Chart | null): void {
        if (chart) emit("selectChart", chart);
    }
</script>

<template>
    <details class="song-section" :open="open">
        <summary>
            <span class="summary-copy">
                <strong>{{ title }}</strong>
                <small v-if="description">{{ description }}</small>
            </span>
            <span class="summary-meta">
                <mdui-badge>{{ songs.length }} 首</mdui-badge>
                <mdui-icon name="expand_more" class="summary-expand"></mdui-icon>
            </span>
        </summary>
        <div class="song-grid">
            <mdui-card
                v-for="entry in songEntries"
                :key="entry.song.musicId"
                variant="outlined"
                class="song-card"
                :class="{ 'song-card-clickable': entry.chart }"
                :tabindex="entry.chart ? 0 : undefined"
                @click="selectChart(entry.chart)"
                @keydown.enter="selectChart(entry.chart)"
                @keydown.space.prevent="selectChart(entry.chart)"
            >
                <img
                    :src="getCoverURL(entry.song.musicId)"
                    :alt="entry.song.title"
                    crossorigin="anonymous"
                    loading="lazy"
                />
                <span class="song-card-copy">
                    <strong :title="entry.song.title">{{ entry.song.title }}</strong>
                    <small v-if="entry.chart" class="song-chart-meta">
                        {{ getChartDifficultyFullLabel(entry.chart.info.grade) }}
                        {{ entry.chart.info.level }}
                    </small>
                    <small v-else>#{{ entry.song.musicId }} · 谱面数据暂不可用</small>
                </span>
                <mdui-icon v-if="entry.chart" name="chevron_right"></mdui-icon>
            </mdui-card>
        </div>
    </details>
</template>

<style scoped>
    .song-section {
        border: 1px solid rgb(var(--mdui-color-outline-variant));
        border-radius: 12px;
        background: rgb(var(--mdui-color-surface-container-low));
        overflow: hidden;
    }

    summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 54px;
        padding: 10px 14px;
        cursor: pointer;
        list-style: none;
        box-sizing: border-box;
    }

    summary::-webkit-details-marker {
        display: none;
    }

    .summary-copy {
        display: flex;
        flex-direction: column;
        min-width: 0;
        text-align: left;
    }

    .summary-meta {
        display: inline-flex;
        align-items: center;
        flex-shrink: 0;
        gap: 5px;
    }

    .summary-expand {
        color: rgb(var(--mdui-color-on-surface-variant));
        transition: transform 0.2s ease;
    }

    details[open] .summary-expand {
        transform: rotate(180deg);
    }

    summary strong {
        font-size: 1rem;
    }

    summary small,
    .song-card small {
        color: rgb(var(--mdui-color-on-surface-variant));
    }

    .song-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(210px, 100%), 1fr));
        gap: 10px;
        padding: 0 12px 12px;
    }

    .song-card {
        display: grid;
        grid-template-columns: 64px minmax(0, 1fr) auto;
        align-items: center;
        min-height: 64px;
        overflow: hidden;
        outline: none;
    }

    .song-card-clickable {
        cursor: pointer;
    }

    .song-card-clickable:hover,
    .song-card-clickable:focus-visible {
        border-color: var(--gate-accent);
        background: var(--gate-accent-faint);
    }

    .song-card > img {
        width: 64px;
        height: 64px;
        object-fit: cover;
    }

    .song-card-copy {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        padding: 7px 9px;
        text-align: left;
    }

    .song-card-copy strong {
        overflow: hidden;
        font-size: 0.82rem;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .song-card-copy small {
        overflow: hidden;
        font-size: 0.7rem;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .song-chart-meta {
        color: var(--gate-accent) !important;
    }

    .song-card > mdui-icon {
        margin-right: 5px;
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: 1.1rem;
    }

    @media (max-width: 499px) {
        .song-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
