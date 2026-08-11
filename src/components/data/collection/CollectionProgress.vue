<script setup lang="ts">
    import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
    import ScoreCard from "@/components/data/chart/ScoreCard.vue";
    import { createDetailedScoreLookup, toChartScore } from "@/components/data/chart/scoreLookup";
    import { getMusicInfoAsync } from "@/components/data/music";
    import type { Chart } from "@/components/data/music/type";
    import type { User } from "@/components/data/user/type";
    import { RankRate } from "@/components/data/maiTypes";
    import type { Collection } from "./type";
    import {
        getCollectionCharts,
        getCollectionProgress,
        isCollectionScoreEvaluable,
        sortCollectionChartsByCompletion,
    } from "./versionPlate";

    const props = defineProps<{
        collection: Collection;
        user?: User | null;
    }>();
    const emit = defineEmits<{
        openChart: [chart: Chart];
    }>();

    const PAGE_SIZE = 60;
    const PRELOAD_REMAINING_CARDS = 12;

    const charts = ref<Chart[]>([]);
    const loading = ref(false);
    const visibleCount = ref(PAGE_SIZE);
    const scoreGridRef = ref<HTMLElement | null>(null);
    let preloadObserver: IntersectionObserver | null = null;

    const evaluable = computed(() => isCollectionScoreEvaluable(props.collection));
    const progress = computed(() => getCollectionProgress(props.collection, charts.value));
    const visibleCharts = computed(() => charts.value.slice(0, visibleCount.value));
    const firstRequirement = computed(() => props.collection.required?.[0]);
    const chartLoadKey = computed(() =>
        JSON.stringify({
            type: props.collection.type,
            id: props.collection.id,
            requirements: (props.collection.required ?? []).map(requirement => ({
                difficulties: requirement.difficulties ?? [],
                rate: requirement.rate,
                fc: requirement.fc,
                fs: requirement.fs,
                songs: (requirement.songs ?? []).map(song => ({
                    id: song.id,
                    type: song.type,
                })),
            })),
        })
    );
    const compactPresentation = computed(() => {
        const requirement = firstRequirement.value;
        if (requirement?.rate) {
            return { mode: "rankRate" as const, filter: requirement.rate };
        }
        if (requirement?.fs) {
            return { mode: "syncStatus" as const, filter: requirement.fs };
        }
        if (requirement?.fc) {
            return { mode: "comboStatus" as const, filter: requirement.fc };
        }
        return { mode: "rankRate" as const, filter: RankRate.d };
    });

    function loadMore(): void {
        if (visibleCount.value >= charts.value.length) return;
        visibleCount.value = Math.min(visibleCount.value + PAGE_SIZE, charts.value.length);
    }

    function observePreloadCard(): void {
        preloadObserver?.disconnect();

        const grid = scoreGridRef.value;
        if (!grid || visibleCount.value >= charts.value.length) return;

        const triggerIndex = Math.max(0, grid.children.length - PRELOAD_REMAINING_CARDS);
        const triggerCard = grid.children.item(triggerIndex);
        if (triggerCard) preloadObserver?.observe(triggerCard);
    }

    async function loadCharts(): Promise<void> {
        if (!evaluable.value) {
            charts.value = [];
            return;
        }

        loading.value = true;
        try {
            const musicData = await getMusicInfoAsync();
            if (!musicData) {
                charts.value = [];
                return;
            }

            const scoreLookup = createDetailedScoreLookup(props.user?.data.detailed);
            const withScores = Object.values(musicData.chartList).map(chart => ({
                ...chart,
                score: toChartScore(scoreLookup?.findScoreForChart(chart)),
            }));
            charts.value = sortCollectionChartsByCompletion(
                props.collection,
                getCollectionCharts(props.collection, withScores)
            );
        } finally {
            loading.value = false;
        }
    }

    watch([chartLoadKey, () => props.user?.data.updateTime], () => {
        visibleCount.value = PAGE_SIZE;
        void loadCharts();
    });

    watch([visibleCount, loading, () => charts.value.length], observePreloadCard, {
        flush: "post",
    });

    onMounted(() => {
        if (typeof IntersectionObserver !== "undefined") {
            preloadObserver = new IntersectionObserver(entries => {
                if (!entries.some(entry => entry.isIntersecting)) return;
                preloadObserver?.disconnect();
                loadMore();
            });
        }
        void loadCharts();
    });

    onBeforeUnmount(() => {
        preloadObserver?.disconnect();
    });
</script>

<template>
    <section v-if="evaluable" class="collection-progress">
        <div class="progress-header">
            <slot name="condition"></slot>
            <div class="progress-value">
                <mdui-circular-progress
                    v-if="progress.total > 0"
                    :value="progress.completed"
                    :max="progress.total"
                ></mdui-circular-progress>
                <span>{{ progress.completed }} / {{ progress.total }}</span>
            </div>
        </div>

        <div v-if="loading" class="progress-state">
            <mdui-circular-progress></mdui-circular-progress>
        </div>
        <div v-else ref="scoreGridRef" class="score-grid">
            <ScoreCard
                v-for="chart in visibleCharts"
                :key="chart.id"
                :data="chart"
                :compact="compactPresentation?.mode"
                :compact-filter="compactPresentation?.filter"
                @click="emit('openChart', chart)"
            />
        </div>
        <mdui-button
            v-if="visibleCount < charts.length"
            class="load-more"
            variant="text"
            @click="loadMore"
        >
            加载更多（{{ visibleCount }} / {{ charts.length }}）
        </mdui-button>
    </section>
</template>

<style scoped>
    .collection-progress {
        min-width: 0;
    }

    .progress-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
        padding-inline: 4px;
        box-sizing: border-box;
    }

    .progress-value {
        display: flex;
        align-items: center;
        gap: 7px;
        white-space: nowrap;
    }

    .progress-value mdui-circular-progress {
        width: 24px;
        height: 24px;
    }

    .progress-state {
        display: flex;
        justify-content: center;
        padding: 24px;
    }

    .score-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
        gap: 6px;
        margin-top: 8px;
    }

    .load-more {
        display: block;
        margin: 8px auto 0;
    }

    @media (max-width: 560px) {
        .score-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
        }
    }
</style>
