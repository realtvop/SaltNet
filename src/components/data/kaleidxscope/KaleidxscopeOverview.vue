<script setup lang="ts">
    import { computed } from "vue";
    import ScoreSection from "@/components/data/chart/ScoreSection.vue";
    import type { Chart } from "@/components/data/music/type";
    import {
        formatKaleidxscopeDateTime,
        getKaleidxscopeCurrentPhase,
        getKaleidxscopePhaseEnd,
        getKaleidxscopePhaseStatus,
        getKaleidxscopePreferredGrade,
        resolveKaleidxscopeSongChart,
    } from "./index";
    import type { KaleidxscopeGate, KaleidxscopePhaseStatus, KaleidxscopeSong } from "./type";

    const props = defineProps<{
        gate: KaleidxscopeGate;
        charts: readonly Chart[];
        now: Date;
        chartInfoDialog: {
            open: boolean;
            chart: Chart | null;
        };
    }>();

    const currentPhase = computed(() => getKaleidxscopeCurrentPhase(props.gate, props.now));
    const preferredGrade = computed(() => getKaleidxscopePreferredGrade(currentPhase.value));
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
                resolveKaleidxscopeSongChart(
                    song,
                    chartsByMusicId.value.get(song.musicId) ?? [],
                    preferredGrade.value
                )
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

        <ScoreSection
            title="钥匙曲目"
            :scores="keyCharts"
            :chart-info-dialog="chartInfoDialog"
            hide-stats
        >
            <template #title>
                <span>钥匙曲目</span>
                <span class="key-condition">
                    <span>钥匙获取条件：{{ gate.keyCondition.summary }}</span>
                    <small>{{ gate.keyCondition.notes.join(" · ") }}</small>
                </span>
            </template>
        </ScoreSection>

        <div class="overview-content selection-content">
            <section class="selection-section">
                <h2>抽选曲目范围</h2>
                <p>TRACK 1、2 从对应曲池随机抽选，TRACK 3 为固定门曲。</p>
            </section>

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

        <ScoreSection
            v-for="pool in gate.selectionPools"
            :key="`${gate.id}-track-${pool.track}`"
            :title="`TRACK ${pool.track} · ${pool.selection === 'fixed' ? '固定' : '随机'} · ${pool.description}`"
            :scores="selectionPoolCharts.get(pool.track) ?? []"
            :chart-info-dialog="chartInfoDialog"
            hide-stats
        />
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
    .selection-section h2,
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
    .selection-section p,
    .card-title > span {
        color: rgb(var(--mdui-color-on-surface-variant));
    }

    .gate-header p,
    .selection-section p {
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

    .key-condition {
        display: inline-flex;
        flex: 1 1 420px;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: var(--mdui-typescale-body-medium-size);
        font-weight: var(--mdui-typescale-body-medium-weight);
        line-height: var(--mdui-typescale-body-medium-line-height);
    }

    .key-condition small {
        font-size: var(--mdui-typescale-body-small-size);
        font-weight: var(--mdui-typescale-body-small-weight);
        line-height: var(--mdui-typescale-body-small-line-height);
    }

    .selection-content {
        padding-top: 30px;
    }

    .selection-section h2 {
        font-size: 1.5rem;
        font-weight: 700;
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
        .key-condition {
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
