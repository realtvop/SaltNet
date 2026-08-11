<script setup lang="ts">
    import { computed } from "vue";
    import type { Chart } from "@/components/data/music/type";
    import {
        formatKaleidxscopeDateTime,
        getKaleidxscopeCurrentPhase,
        getKaleidxscopePhaseEnd,
        getKaleidxscopePhaseStatus,
        getKaleidxscopePreferredGrade,
    } from "./index";
    import type { KaleidxscopeGate, KaleidxscopePhaseStatus } from "./type";
    import KaleidxscopeSongGrid from "./KaleidxscopeSongGrid.vue";

    const props = defineProps<{
        gate: KaleidxscopeGate;
        charts: readonly Chart[];
        now: Date;
    }>();

    const emit = defineEmits<{
        selectChart: [chart: Chart];
    }>();

    const currentPhase = computed(() => getKaleidxscopeCurrentPhase(props.gate, props.now));
    const preferredGrade = computed(() => getKaleidxscopePreferredGrade(currentPhase.value));
    const bossSong = computed(
        () => props.gate.selectionPools.find(pool => pool.track === 3)?.songs[0]
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
        <header class="gate-header">
            <h2>{{ gate.name }}</h2>
            <p>
                {{ gate.region }}
                <template v-if="bossSong">· 门曲：{{ bossSong.title }}</template>
            </p>
        </header>

        <div class="overview-grid">
            <mdui-card variant="filled" class="overview-card condition-card">
                <div class="card-title">
                    <mdui-icon name="key"></mdui-icon>
                    <h3>钥匙获取条件</h3>
                </div>
                <p class="condition-summary">{{ gate.keyCondition.summary }}</p>
                <ul class="condition-notes">
                    <li v-for="note in gate.keyCondition.notes" :key="note">{{ note }}</li>
                </ul>
            </mdui-card>

            <mdui-card variant="filled" class="overview-card calendar-card">
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

        <KaleidxscopeSongGrid
            :key="`${gate.id}-keys`"
            title="钥匙曲目"
            :description="`共 ${gate.keyCondition.songs.length} 首；点击展开完整列表`"
            :songs="gate.keyCondition.songs"
            :charts="charts"
            :preferred-grade="preferredGrade"
            @select-chart="emit('selectChart', $event)"
        />

        <section class="selection-section">
            <h3>抽选曲目范围</h3>
            <p>TRACK 1、2 从对应曲池随机抽选，TRACK 3 为固定门曲。</p>
        </section>

        <KaleidxscopeSongGrid
            v-for="pool in gate.selectionPools"
            :key="`${gate.id}-track-${pool.track}`"
            :title="`TRACK ${pool.track} · ${pool.selection === 'fixed' ? '固定' : '随机'}`"
            :description="pool.description"
            :songs="pool.songs"
            :charts="charts"
            :preferred-grade="preferredGrade"
            :open="pool.track === 3"
            @select-chart="emit('selectChart', $event)"
        />
    </main>
</template>

<style scoped>
    .kaleidxscope-overview {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
        max-width: 1300px;
        margin: 0 auto;
        padding: 5px 20px calc(56px + 1rem);
        box-sizing: border-box;
    }

    .gate-header {
        padding: 8px 4px 0;
    }

    .gate-header h2,
    .selection-section h3,
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
    .condition-notes,
    .card-title > span {
        color: rgb(var(--mdui-color-on-surface-variant));
    }

    .gate-header p,
    .selection-section p {
        margin: 4px 0 0;
        font-size: var(--mdui-typescale-body-medium-size);
        line-height: var(--mdui-typescale-body-medium-line-height);
    }

    .overview-grid {
        display: grid;
        grid-template-columns: minmax(260px, 0.8fr) minmax(0, 1.4fr);
        align-items: start;
        gap: 12px;
    }

    .overview-card {
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

    .card-title h3,
    .selection-section h3 {
        font-size: var(--mdui-typescale-title-medium-size);
        font-weight: var(--mdui-typescale-title-medium-weight);
        line-height: var(--mdui-typescale-title-medium-line-height);
    }

    .card-title > span {
        margin-left: auto;
        font-size: var(--mdui-typescale-label-medium-size);
    }

    .condition-summary {
        margin: 8px;
        color: rgb(var(--mdui-color-on-surface));
        font-size: var(--mdui-typescale-body-large-size);
        line-height: var(--mdui-typescale-body-large-line-height);
    }

    .condition-notes {
        margin: 8px;
        padding-left: 1.25rem;
        font-size: var(--mdui-typescale-body-small-size);
        line-height: var(--mdui-typescale-body-small-line-height);
    }

    .phase-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        padding: 4px 0 0;
    }

    .phase-status {
        white-space: nowrap;
    }

    .selection-section {
        padding: 8px 4px 0;
    }

    @media (min-aspect-ratio: 1.001/1) {
        .kaleidxscope-overview {
            padding-bottom: 1rem;
        }
    }

    @media (max-width: 900px) {
        .overview-grid {
            grid-template-columns: 1fr;
        }
    }

    @media (max-width: 599px) {
        .kaleidxscope-overview {
            padding-right: 12px;
            padding-left: 12px;
        }

        .phase-list {
            grid-template-columns: 1fr;
        }
    }
</style>
