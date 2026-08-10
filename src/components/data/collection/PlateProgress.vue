<script setup lang="ts">
    import { computed, onMounted, ref, watch } from "vue";
    import ScoreCard from "@/components/data/chart/ScoreCard.vue";
    import { createDetailedScoreLookup, toChartScore } from "@/components/data/chart/scoreLookup";
    import { getMusicInfoAsync } from "@/components/data/music";
    import type { Chart } from "@/components/data/music/type";
    import type { User } from "@/components/data/user/type";
    import { RankRate } from "@/components/data/maiTypes";
    import type { Plate } from "./type";
    import {
        getPlateCharts,
        getPlateProgress,
        isPlateScoreEvaluable,
        sortPlateChartsByCompletion,
    } from "./versionPlate";

    const props = defineProps<{
        plate: Plate;
        user?: User | null;
    }>();
    const emit = defineEmits<{
        openChart: [chart: Chart];
    }>();

    const charts = ref<Chart[]>([]);
    const loading = ref(false);
    const visibleCount = ref(60);

    const evaluable = computed(() => isPlateScoreEvaluable(props.plate));
    const progress = computed(() => getPlateProgress(props.plate, charts.value));
    const visibleCharts = computed(() => charts.value.slice(0, visibleCount.value));
    const firstRequirement = computed(() => props.plate.required?.[0]);
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
            charts.value = sortPlateChartsByCompletion(
                props.plate,
                getPlateCharts(props.plate, withScores)
            );
        } finally {
            loading.value = false;
        }
    }

    watch(
        () => [props.plate.id, props.user?.data.updateTime],
        () => {
            visibleCount.value = 60;
            void loadCharts();
        }
    );

    onMounted(() => {
        void loadCharts();
    });
</script>

<template>
    <section v-if="evaluable" class="plate-progress">
        <mdui-card class="progress-header" variant="filled">
            <div>
                <div class="progress-title">成绩进度</div>
                <div class="progress-caption">依据当前用户保存的最佳成绩计算</div>
            </div>
            <div class="progress-value">
                <mdui-circular-progress
                    v-if="progress.total > 0"
                    :value="progress.completed"
                    :max="progress.total"
                ></mdui-circular-progress>
                <span>{{ progress.completed }} / {{ progress.total }}</span>
            </div>
        </mdui-card>

        <div v-if="loading" class="progress-state">
            <mdui-circular-progress></mdui-circular-progress>
        </div>
        <div v-else class="score-grid">
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
            @click="visibleCount += 60"
        >
            加载更多（{{ visibleCount }} / {{ charts.length }}）
        </mdui-button>
    </section>
</template>

<style scoped>
    .plate-progress {
        margin-top: 12px;
    }

    .progress-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
        padding: 10px 12px;
        box-sizing: border-box;
    }

    .progress-title {
        font-size: 0.9rem;
        font-weight: 600;
    }

    .progress-caption {
        margin-top: 2px;
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: 0.75rem;
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
