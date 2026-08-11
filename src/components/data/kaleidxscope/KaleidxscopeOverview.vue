<script setup lang="ts">
    import { computed } from "vue";
    import type { Chart } from "@/components/data/music/type";
    import {
        formatKaleidxscopeDateTime,
        getKaleidxscopeCurrentPhase,
        getKaleidxscopeNextPhase,
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
    const nextPhase = computed(() => getKaleidxscopeNextPhase(props.gate, props.now));
    const preferredGrade = computed(() => getKaleidxscopePreferredGrade(currentPhase.value));
    const bossSong = computed(
        () => props.gate.selectionPools.find(pool => pool.track === 3)?.songs[0]
    );

    const statusLabels: Record<KaleidxscopePhaseStatus, string> = {
        past: "历史",
        current: "当前",
        future: "未来",
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
    <div
        class="kaleidxscope-overview"
        :style="{
            '--gate-accent': gate.accent,
            '--gate-accent-soft': `${gate.accent}29`,
            '--gate-accent-faint': `${gate.accent}14`,
        }"
    >
        <mdui-card variant="filled" class="gate-heading">
            <span class="gate-marker"></span>
            <span class="gate-title">
                <strong>{{ gate.name }}</strong>
                <small>{{ gate.region }}</small>
            </span>
            <span v-if="bossSong" class="gate-boss">
                门曲
                <strong>{{ bossSong.title }}</strong>
            </span>
        </mdui-card>

        <div class="overview-grid">
            <mdui-card variant="outlined" class="key-condition-card">
                <h2>
                    <mdui-icon name="key"></mdui-icon>
                    钥匙获取条件
                </h2>
                <p>{{ gate.keyCondition.summary }}</p>
                <ul>
                    <li v-for="note in gate.keyCondition.notes" :key="note">{{ note }}</li>
                </ul>
            </mdui-card>

            <mdui-card variant="outlined" class="life-calendar-card">
                <header>
                    <span>
                        <h2>
                            <mdui-icon name="favorite"></mdui-icon>
                            血量日历
                        </h2>
                        <small>北京时间；阶段切换以游戏内显示为准</small>
                    </span>
                    <span v-if="currentPhase" class="current-life-chip">
                        {{ currentPhase.difficulty }} · LIFE {{ currentPhase.life }}
                    </span>
                    <span v-else class="current-life-chip pending">
                        {{ formatKaleidxscopeDateTime(gate.openedAt, true) }} 开放
                    </span>
                </header>

                <div class="phase-calendar">
                    <div
                        v-for="(lifePhase, index) in gate.lifePhases"
                        :key="lifePhase.startsAt"
                        class="phase-item"
                        :class="`phase-${getPhaseStatus(index)}`"
                    >
                        <span class="phase-status">{{ statusLabels[getPhaseStatus(index)] }}</span>
                        <strong>LIFE {{ lifePhase.life }}</strong>
                        <span>{{ lifePhase.difficulty }}</span>
                        <time :datetime="lifePhase.startsAt">{{ formatPhaseRange(index) }}</time>
                    </div>
                </div>

                <p v-if="nextPhase" class="next-phase">
                    下次放宽：{{ formatKaleidxscopeDateTime(nextPhase.startsAt) }} ·
                    {{ nextPhase.difficulty }} · LIFE {{ nextPhase.life }}
                </p>
                <p v-else class="next-phase">当前已是最终阶段</p>
            </mdui-card>
        </div>

        <KaleidxscopeSongGrid
            title="钥匙曲目"
            :description="gate.keyCondition.summary"
            :songs="gate.keyCondition.songs"
            :charts="charts"
            :preferred-grade="preferredGrade"
            @select-chart="emit('selectChart', $event)"
        />

        <div class="selection-heading">
            <h2>抽选曲目范围</h2>
            <p>挑战门时，TRACK 1 与 TRACK 2 分别从对应曲池随机抽选，TRACK 3 为固定门曲。</p>
        </div>

        <KaleidxscopeSongGrid
            v-for="pool in gate.selectionPools"
            :key="pool.track"
            :title="`TRACK ${pool.track} · ${pool.selection === 'fixed' ? '固定' : '随机'}`"
            :description="pool.description"
            :songs="pool.songs"
            :charts="charts"
            :preferred-grade="preferredGrade"
            :open="pool.track === 3"
            @select-chart="emit('selectChart', $event)"
        />
    </div>
</template>

<style scoped>
    .kaleidxscope-overview {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 8px 20px calc(56px + 1rem);
        box-sizing: border-box;
    }

    .gate-heading {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 64px;
        padding: 10px 16px;
        border-left: 5px solid var(--gate-accent);
        box-sizing: border-box;
    }

    .gate-marker {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--gate-accent);
        box-shadow: 0 0 0 5px var(--gate-accent-soft);
    }

    .gate-title {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-width: 0;
    }

    .gate-title strong {
        font-size: 1.1rem;
    }

    .gate-title small,
    .gate-boss,
    .life-calendar-card small,
    .selection-heading p {
        color: rgb(var(--mdui-color-on-surface-variant));
    }

    .gate-boss {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        min-width: 0;
        font-size: 0.72rem;
    }

    .gate-boss strong {
        max-width: min(40vw, 360px);
        overflow: hidden;
        color: rgb(var(--mdui-color-on-surface));
        font-size: 0.9rem;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .overview-grid {
        display: grid;
        grid-template-columns: minmax(260px, 0.8fr) minmax(0, 2fr);
        gap: 14px;
    }

    .key-condition-card,
    .life-calendar-card {
        padding: 16px;
    }

    h2 {
        margin: 0;
        font-size: 1.05rem;
    }

    h2 mdui-icon {
        margin-right: 6px;
        color: var(--gate-accent);
        font-size: 1.25rem;
        vertical-align: -0.2em;
    }

    .key-condition-card p {
        margin: 10px 0;
        font-weight: 600;
    }

    .key-condition-card ul {
        margin: 0;
        padding-left: 1.25rem;
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: 0.82rem;
    }

    .life-calendar-card > header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
    }

    .life-calendar-card > header > span:first-child {
        display: flex;
        flex-direction: column;
    }

    .current-life-chip {
        flex-shrink: 0;
        padding: 6px 10px;
        border-radius: 999px;
        background: var(--gate-accent-soft);
        color: var(--gate-accent);
        font-size: 0.78rem;
        font-weight: 700;
    }

    .current-life-chip.pending {
        color: rgb(var(--mdui-color-on-surface-variant));
    }

    .phase-calendar {
        display: grid;
        grid-template-columns: repeat(6, minmax(98px, 1fr));
        gap: 7px;
        overflow-x: auto;
        padding-bottom: 4px;
    }

    .phase-item {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 98px;
        padding: 9px;
        border: 1px solid rgb(var(--mdui-color-outline-variant));
        border-radius: 9px;
        box-sizing: border-box;
    }

    .phase-item > strong {
        margin-top: 12px;
        font-size: 0.86rem;
    }

    .phase-item > span:not(.phase-status) {
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: 0.72rem;
    }

    .phase-item time {
        margin-top: 4px;
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: 0.62rem;
        line-height: 1.3;
    }

    .phase-status {
        position: absolute;
        top: 6px;
        right: 6px;
        padding: 1px 5px;
        border-radius: 999px;
        background: rgb(var(--mdui-color-surface-container-high));
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: 0.6rem;
    }

    .phase-past {
        opacity: 0.58;
    }

    .phase-current {
        border-color: var(--gate-accent);
        background: var(--gate-accent-faint);
    }

    .phase-current .phase-status {
        background: var(--gate-accent);
        color: white;
    }

    .phase-future {
        border-style: dashed;
    }

    .next-phase {
        margin: 7px 0 0;
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: 0.74rem;
        text-align: right;
    }

    .selection-heading {
        padding: 2px 2px 0;
    }

    .selection-heading p {
        margin: 4px 0 0;
        font-size: 0.8rem;
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

    @media (max-width: 499px) {
        .kaleidxscope-overview {
            padding-right: 10px;
            padding-left: 10px;
        }

        .gate-heading {
            align-items: flex-start;
        }

        .gate-boss {
            display: none;
        }

        .life-calendar-card > header {
            align-items: flex-start;
            flex-direction: column;
        }
    }
</style>
