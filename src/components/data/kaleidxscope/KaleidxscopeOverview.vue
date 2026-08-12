<script setup lang="ts">
    import { computed } from "vue";
    import ScoreSection from "@/components/data/chart/ScoreSection.vue";
    import type { Chart } from "@/components/data/music/type";
    import {
        formatKaleidxscopeDateTime,
        getKaleidxscopePhaseEnd,
        getKaleidxscopePhaseStatus,
        resolveKaleidxscopeSongChart,
    } from "./index";
    import type {
        KaleidxscopeGate,
        KaleidxscopePhaseStatus,
        KaleidxscopeSelectionPool,
        KaleidxscopeSong,
    } from "./type";

    const props = defineProps<{
        gate: KaleidxscopeGate;
        charts: readonly Chart[];
        now: Date;
        chartInfoDialog: {
            open: boolean;
            chart: Chart | null;
        };
    }>();

    const bossSong = computed(
        () => props.gate.selectionPools.find(pool => pool.track === 3)?.songs[0]
    );

    const chartsByMusicId = computed(() => {
        const index = new Map<number, Chart[]>();
        for (const chart of props.charts) {
            const existing = index.get(chart.music.id);
            if (existing) existing.push(chart);
            else index.set(chart.music.id, [chart]);
        }
        return index;
    });

    function resolveSongCharts(songs: readonly KaleidxscopeSong[]): Chart[] {
        return songs
            .map(song =>
                resolveKaleidxscopeSongChart(song, chartsByMusicId.value.get(song.musicId) ?? [], 3)
            )
            .filter((chart): chart is Chart => chart !== null);
    }

    const keyCharts = computed(() => resolveSongCharts(props.gate.keyCondition.songs));
    const selectionPoolCharts = computed(
        () =>
            new Map(
                props.gate.selectionPools.map(pool => [pool.track, resolveSongCharts(pool.songs)])
            )
    );

    const statusLabels: Record<KaleidxscopePhaseStatus, string> = {
        past: "历史",
        current: "当前",
        future: "未来",
    };

    const statusIcons: Record<KaleidxscopePhaseStatus, string> = {
        past: "history",
        current: "favorite",
        future: "schedule",
    };

    function getPhaseStatus(index: number): KaleidxscopePhaseStatus {
        return getKaleidxscopePhaseStatus(props.gate, index, props.now);
    }

    function formatPhaseRange(index: number): string {
        const lifePhase = props.gate.lifePhases[index];
        const endsAt = getKaleidxscopePhaseEnd(props.gate, index);
        const start = formatKaleidxscopeDateTime(lifePhase.startsAt);
        return endsAt ? `${start} ～ ${formatKaleidxscopeDateTime(endsAt)}` : `${start} 起`;
    }

    function formatSelectionPoolSource(pool: KaleidxscopeSelectionPool): string {
        return pool.description.replace(/^随机/, "");
    }
</script>

<template>
    <main class="kaleidxscope-overview">
        <div class="overview-content gate-content">
            <header class="gate-header">
                <h2>{{ gate.name }}</h2>
                <p>
                    {{ gate.region }}
                    <template v-if="bossSong">· 门曲：{{ bossSong.title }}</template>
                </p>
            </header>
        </div>

        <section class="score-group">
            <div class="section-heading">
                <h2 class="section-title">
                    <span>钥匙曲目</span>
                    <span class="section-description key-description">
                        <span>钥匙获取条件：{{ gate.keyCondition.summary }}</span>
                    </span>
                </h2>
            </div>
            <ScoreSection
                title=""
                :scores="keyCharts"
                :chart-info-dialog="chartInfoDialog"
                hide-title
                hide-stats
            />
        </section>

        <div class="overview-content selection-content">
            <mdui-card variant="filled" class="calendar-card">
                <div class="card-title">
                    <mdui-icon name="favorite"></mdui-icon>
                    <h3>血量日历</h3>
                    <span>北京时间</span>
                </div>
                <mdui-list class="phase-list">
                    <mdui-list-item
                        v-for="(lifePhase, index) in gate.lifePhases"
                        :key="lifePhase.startsAt"
                        rounded
                        nonclickable
                        :active="getPhaseStatus(index) === 'current'"
                        :icon="statusIcons[getPhaseStatus(index)]"
                        :headline="`LIFE ${lifePhase.life} · ${lifePhase.difficulty}`"
                        :description="formatPhaseRange(index)"
                        description-line="2"
                    >
                        <span slot="end-icon" class="phase-status">
                            {{ statusLabels[getPhaseStatus(index)] }}
                        </span>
                    </mdui-list-item>
                </mdui-list>
            </mdui-card>
        </div>

        <section
            v-for="pool in gate.selectionPools"
            :key="`${gate.id}-track-${pool.track}`"
            class="score-group"
        >
            <div class="section-heading">
                <h2 class="section-title">
                    <span>TRACK {{ pool.track }}</span>
                    <small v-if="pool.track !== 3" class="section-description">
                        {{ formatSelectionPoolSource(pool) }}
                    </small>
                </h2>
            </div>
            <ScoreSection
                title=""
                :scores="selectionPoolCharts.get(pool.track) ?? []"
                :chart-info-dialog="chartInfoDialog"
                hide-title
                hide-stats
            />
        </section>
    </main>
</template>

<style scoped>
    .kaleidxscope-overview {
        width: 100%;
        padding-bottom: calc(56px + 1rem);
        box-sizing: border-box;
    }

    .overview-content {
        width: 100%;
        max-width: 1300px;
        margin: 0 auto;
        padding-right: 20px;
        padding-left: 20px;
        box-sizing: border-box;
    }

    .gate-content {
        padding-top: 13px;
    }

    .gate-header {
        padding: 0 4px;
    }

    .gate-header h2,
    .card-title h3 {
        margin: 0;
        color: rgb(var(--mdui-color-on-surface));
    }

    .gate-header h2 {
        font-size: var(--mdui-typescale-title-large-size);
        font-weight: var(--mdui-typescale-title-large-weight);
        line-height: var(--mdui-typescale-title-large-line-height);
    }

    .gate-header p,
    .card-title > span {
        color: rgb(var(--mdui-color-on-surface-variant));
    }

    .gate-header p {
        margin: 4px 0 0;
        font-size: var(--mdui-typescale-body-medium-size);
        line-height: var(--mdui-typescale-body-medium-line-height);
    }

    .calendar-card {
        width: 100%;
        padding: 8px;
        box-sizing: border-box;
    }

    .card-title {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 8px 4px;
    }

    .card-title mdui-icon {
        color: rgb(var(--mdui-color-primary));
        font-size: 1.25rem;
    }

    .card-title h3 {
        font-size: var(--mdui-typescale-title-medium-size);
        font-weight: var(--mdui-typescale-title-medium-weight);
        line-height: var(--mdui-typescale-title-medium-line-height);
    }

    .card-title > span {
        margin-left: auto;
        font-size: var(--mdui-typescale-label-medium-size);
    }

    .score-group,
    .section-title {
        width: 100%;
    }

    .section-heading {
        width: 100%;
        max-width: 1300px;
        margin: 0 auto;
        padding: 0 20px;
        box-sizing: border-box;
    }

    .section-title {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 15px;
        margin-top: 30px;
        margin-bottom: 10px;
        color: var(--text-primary-color, inherit);
        font-size: 1.5rem;
        font-weight: 700;
        text-align: left;
    }

    .section-description {
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: var(--mdui-typescale-body-medium-size);
        font-weight: var(--mdui-typescale-body-medium-weight);
        line-height: var(--mdui-typescale-body-medium-line-height);
    }

    .key-description {
        display: inline-flex;
        flex: 1 1 420px;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    .key-description small {
        font-size: var(--mdui-typescale-body-small-size);
        font-weight: var(--mdui-typescale-body-small-weight);
        line-height: var(--mdui-typescale-body-small-line-height);
    }

    .selection-content {
        padding-top: 30px;
    }

    .calendar-card {
        margin-top: 12px;
    }

    .phase-list {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        padding: 4px 0 0;
    }

    .phase-status {
        white-space: nowrap;
    }

    @media (min-aspect-ratio: 1.001/1) {
        .kaleidxscope-overview {
            padding-bottom: 1rem;
        }
    }

    @media (max-width: 900px) {
        .phase-list {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }

    @media (max-width: 768px) {
        :global(.kaleidxscope-overview .score-group .score-section) {
            padding-right: 20px !important;
            padding-left: 20px !important;
        }

        .section-title {
            flex-direction: column;
            align-items: flex-start;
            gap: 5px;
        }

        .key-description {
            flex-basis: auto;
            width: 100%;
        }
    }

    @media (max-width: 599px) {
        .phase-list {
            grid-template-columns: 1fr;
        }
    }
</style>
