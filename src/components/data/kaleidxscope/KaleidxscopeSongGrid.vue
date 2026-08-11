<script setup lang="ts">
    import { computed, ref } from "vue";
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
            open: false,
        }
    );

    const emit = defineEmits<{
        selectChart: [chart: Chart];
    }>();

    const expanded = ref(props.open);

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

    function getChartDescription(chart: Chart | null, musicId: number): string {
        if (!chart) return `#${musicId} · 谱面数据暂不可用`;
        return `${getChartDifficultyFullLabel(chart.info.grade)} ${chart.info.level}`;
    }

    function selectChart(chart: Chart | null): void {
        if (chart) emit("selectChart", chart);
    }
</script>

<template>
    <mdui-card variant="filled" class="song-section">
        <mdui-collapse accordion :value="expanded ? 'songs' : ''">
            <mdui-collapse-item value="songs" @open="expanded = true" @close="expanded = false">
                <mdui-list-item
                    slot="header"
                    rounded
                    :headline="title"
                    :description="description"
                    description-line="1"
                >
                    <span slot="end-icon" class="section-meta">
                        <span>{{ songs.length }} 首</span>
                        <mdui-icon :name="expanded ? 'expand_less' : 'expand_more'"></mdui-icon>
                    </span>
                </mdui-list-item>

                <mdui-divider></mdui-divider>
                <mdui-list class="song-list">
                    <mdui-list-item
                        v-for="entry in songEntries"
                        :key="entry.song.musicId"
                        rounded
                        :nonclickable="!entry.chart"
                        :headline="entry.song.title"
                        headline-line="1"
                        :description="getChartDescription(entry.chart, entry.song.musicId)"
                        description-line="1"
                        :end-icon="entry.chart ? 'chevron_right' : undefined"
                        @click="selectChart(entry.chart)"
                    >
                        <img
                            slot="icon"
                            class="song-cover"
                            :src="getCoverURL(entry.song.musicId)"
                            :alt="entry.song.title"
                            crossorigin="anonymous"
                            loading="lazy"
                        />
                    </mdui-list-item>
                </mdui-list>
            </mdui-collapse-item>
        </mdui-collapse>
    </mdui-card>
</template>

<style scoped>
    .song-section {
        width: 100%;
    }

    .section-meta {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
    }

    .section-meta > span {
        font-size: var(--mdui-typescale-label-medium-size);
    }

    .song-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
        gap: 2px;
        padding: 8px;
    }

    .song-cover {
        width: 48px;
        height: 48px;
        border-radius: var(--mdui-shape-corner-small);
        background: rgb(var(--mdui-color-surface-container-high));
        object-fit: cover;
    }

    @media (max-width: 599px) {
        .song-list {
            grid-template-columns: 1fr;
            padding: 4px;
        }
    }
</style>
