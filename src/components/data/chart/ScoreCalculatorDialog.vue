<template>
    <mdui-dialog
        ref="dialogRef"
        close-on-esc
        close-on-overlay-click
        :open="open"
        :fullscreen="isSmallScreen"
        @open="markDialogOpen"
        @close="handleClose"
    >
        <mdui-top-app-bar slot="header">
            <mdui-button-icon icon="close" @click="dialogRef.open = false"></mdui-button-icon>
            <mdui-top-app-bar-title>容错计算</mdui-top-app-bar-title>
        </mdui-top-app-bar>

        <div class="calculator-content" v-if="chart">
            <div class="score-mode-select">
                <mdui-tabs :value="scoreMode.name" @change="handleScoreModeChange" full-width>
                    <mdui-tab value="0+">0+</mdui-tab>
                    <mdui-tab value="100-">100-</mdui-tab>
                    <mdui-tab value="101-">101-</mdui-tab>
                </mdui-tabs>
            </div>

            <div class="score-table">
                <table>
                    <thead>
                        <tr>
                            <th>Note</th>
                            <th class="judge-perfect">Perfect</th>
                            <th class="judge-great">Great</th>
                            <th class="judge-good">Good</th>
                            <th class="judge-miss">Miss</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(item, note) in scoreNormal" :key="note">
                            <td>{{ note }}</td>
                            <td
                                class="judge-perfect"
                                @click="props.copyTextToClipboard(item.PERFECT)"
                            >
                                {{ item.PERFECT }}
                            </td>
                            <td class="judge-great" @click="props.copyTextToClipboard(item.GREAT)">
                                {{ item.GREAT }}
                            </td>
                            <td class="judge-good" @click="props.copyTextToClipboard(item.GOOD)">
                                {{ item.GOOD }}
                            </td>
                            <td class="judge-miss" @click="props.copyTextToClipboard(item.MISS)">
                                {{ item.MISS }}
                            </td>
                        </tr>
                    </tbody>
                </table>
                <!-- Break 行单独处理 -->
                <div class="break-row-container">
                    <div class="break-cell break-note">Break</div>
                    <div class="break-cell break-perfect-col">
                        <div
                            class="break-sub-cell judge-cp"
                            @click="props.copyTextToClipboard(scoreBreak.CRITICAL_PERFECT)"
                        >
                            {{ scoreBreak.CRITICAL_PERFECT }}
                        </div>
                        <div
                            class="break-sub-cell judge-perfect"
                            @click="props.copyTextToClipboard(scoreBreak.PERFECT_A)"
                        >
                            {{ scoreBreak.PERFECT_A }}
                        </div>
                        <div
                            class="break-sub-cell judge-perfect"
                            @click="props.copyTextToClipboard(scoreBreak.PERFECT_B)"
                        >
                            {{ scoreBreak.PERFECT_B }}
                        </div>
                    </div>
                    <div class="break-cell break-great-col">
                        <div
                            class="break-sub-cell judge-great"
                            @click="props.copyTextToClipboard(scoreBreak.GREAT_A)"
                        >
                            {{ scoreBreak.GREAT_A }}
                        </div>
                        <div
                            class="break-sub-cell judge-great"
                            @click="props.copyTextToClipboard(scoreBreak.GREAT_B)"
                        >
                            {{ scoreBreak.GREAT_B }}
                        </div>
                        <div
                            class="break-sub-cell judge-great"
                            @click="props.copyTextToClipboard(scoreBreak.GREAT_C)"
                        >
                            {{ scoreBreak.GREAT_C }}
                        </div>
                    </div>
                    <div
                        class="break-cell break-good judge-good"
                        @click="props.copyTextToClipboard(scoreBreak.GOOD)"
                    >
                        {{ scoreBreak.GOOD }}
                    </div>
                    <div
                        class="break-cell break-miss judge-miss"
                        @click="props.copyTextToClipboard(scoreBreak.MISS)"
                    >
                        {{ scoreBreak.MISS }}
                    </div>
                </div>
            </div>

            <div class="target-input">
                <mdui-text-field
                    label="目标达成率"
                    v-model="scoreInput"
                    type="number"
                    step="0.0001"
                    min="0"
                    max="101"
                    suffix="%"
                ></mdui-text-field>
            </div>

            <div class="tolerance-result" v-if="toleranceInfo">
                <div class="tolerance-item">
                    达成
                    <b>{{ Number(scoreInput).toFixed(4) }}%</b>
                    容错为
                    <b>{{ toleranceInfo.tapGreatTolerance }}</b>
                    个 Tap GREAT
                </div>
                <div class="tolerance-item" v-if="noteTotal.Break > 0">
                    BREAK 50落相当于
                    <b>{{ toleranceInfo.break50Equivalent }}</b>
                    个 Tap GREAT
                </div>
                <div class="tolerance-item" v-if="noteTotal.Break > 0">
                    BREAK 粉2000相当于
                    <b>{{ toleranceInfo.breakPink2000Equivalent }}</b>
                    个 Tap GREAT
                </div>
            </div>
        </div>
    </mdui-dialog>
</template>

<script setup lang="ts">
    import { ref, computed, watch, nextTick } from "vue";
    import { markDialogOpen, markDialogClosed } from "@/components/app/router";
    import type { Chart } from "@/components/data/music/type";
    import { useShared } from "@/components/app/shared";

    const { isSmallScreen } = useShared();
    const props = defineProps<{
        open: boolean;
        chart: Chart | null;
        copyTextToClipboard: Function;
    }>();

    const emit = defineEmits(["update:open"]);

    const dialogRef = ref<any>(null);

    const scoreInput = ref("100.5");

    const scoreMode = ref({ name: "0+", score: 0, ex_score: 0 });
    const scoreModes: Record<string, { name: string; score: number; ex_score: number }> = {
        "0+": { name: "0+", score: 0, ex_score: 0 },
        "100-": { name: "100-", score: 1, ex_score: 0 },
        "101-": { name: "101-", score: 1, ex_score: 1 },
    };

    const notes = {
        Tap: { weight: 1 },
        Hold: { weight: 2 },
        Slide: { weight: 3 },
        Touch: { weight: 1 },
        Break: { weight: 5 },
    };

    const judges = {
        PERFECT: { weight: 1 },
        GREAT: { weight: 0.8 },
        GOOD: { weight: 0.5 },
        MISS: { weight: 0 },
    };

    const breakJudges = {
        CRITICAL_PERFECT: { weight: 1, ex_weight: 1 },
        PERFECT_A: { weight: 1, ex_weight: 0.75 },
        PERFECT_B: { weight: 1, ex_weight: 0.5 },
        GREAT_A: { weight: 0.8, ex_weight: 0.4 },
        GREAT_B: { weight: 0.6, ex_weight: 0.4 },
        GREAT_C: { weight: 0.5, ex_weight: 0.4 },
        GOOD: { weight: 0.4, ex_weight: 0.3 },
        MISS: { weight: 0, ex_weight: 0 },
    };

    const noteTotal = computed(() => {
        if (!props.chart) return { Tap: 0, Hold: 0, Slide: 0, Touch: 0, Break: 0 };
        const chartNotes = props.chart.info.notes || [];
        const hasTouch = chartNotes.length === 5 || props.chart.music?.info.type === "DX";
        return {
            Tap: chartNotes[0] ?? 0,
            Hold: chartNotes[1] ?? 0,
            Slide: chartNotes[2] ?? 0,
            Touch: hasTouch ? (chartNotes[3] ?? 0) : 0,
            Break: hasTouch ? (chartNotes[4] ?? 0) : (chartNotes[3] ?? 0),
        };
    });

    const scoreMax = computed(() => {
        let sum = 0;
        for (const note in notes) {
            sum +=
                noteTotal.value[note as keyof typeof noteTotal.value] *
                notes[note as keyof typeof notes].weight;
        }
        return sum;
    });

    const exScoreMax = computed(() => noteTotal.value.Break);

    const scoreNormal = computed(() => {
        const result: Record<string, Record<string, string>> = {};
        for (const note in notes) {
            if (note === "Break") continue;
            const noteKey = note as keyof typeof noteTotal.value;
            const noteCount = noteTotal.value[noteKey];
            if (!noteCount) continue;
            result[note] = {};
            for (const judge in judges) {
                if (/* !noteCount ||  */ !scoreMax.value) {
                    result[note][judge] = "-";
                    continue;
                }
                const judgeKey = judge as keyof typeof judges;
                const val =
                    (notes[note as keyof typeof notes].weight *
                        (judges[judgeKey].weight - scoreMode.value.score)) /
                    scoreMax.value;
                result[note][judge] = (val * 100).toFixed(7) + "%";
            }
        }
        return result;
    });

    const scoreBreak = computed(() => {
        const result: Record<string, string> = {};
        for (const judge in breakJudges) {
            if (!exScoreMax.value || !scoreMax.value) {
                result[judge] = "-";
                continue;
            }
            const judgeKey = judge as keyof typeof breakJudges;
            const val =
                (notes.Break.weight * (breakJudges[judgeKey].weight - scoreMode.value.score)) /
                    scoreMax.value +
                (0.01 * (breakJudges[judgeKey].ex_weight - scoreMode.value.ex_score)) /
                    exScoreMax.value;
            result[judge] = (val * 100).toFixed(7) + "%";
        }
        return result;
    });

    const toleranceInfo = computed(() => {
        const input = parseFloat(scoreInput.value);
        if (!isFinite(input) || input < 0 || input > 101) return null;
        if (!scoreMax.value) return null;

        const tapGreatLoss = 0.2 / scoreMax.value;
        const tapGreatTolerance = ((101 - input) / 100 / tapGreatLoss).toFixed(3);

        let break50Equivalent = "-";
        let breakPink2000Equivalent = "-";

        if (noteTotal.value.Break > 0) {
            break50Equivalent = ((0.01 * 0.25) / noteTotal.value.Break / tapGreatLoss).toFixed(3);
            breakPink2000Equivalent = (
                (0.01 * 0.6) / noteTotal.value.Break / tapGreatLoss +
                5
            ).toFixed(3);
        }

        return {
            tapGreatTolerance,
            break50Equivalent,
            breakPink2000Equivalent,
        };
    });

    function handleScoreModeChange(e: Event) {
        const target = e.target as HTMLElement & { value: string };
        if (target.value && scoreModes[target.value]) {
            scoreMode.value = scoreModes[target.value];
        }
    }

    function handleClose(ref: HTMLElement) {
        markDialogClosed(ref);
        emit("update:open", false);
    }

    watch(
        () => props.open,
        async newValue => {
            await nextTick();
            if (dialogRef.value) {
                dialogRef.value.open = newValue;
            }
        }
    );
</script>

<style scoped>
    .calculator-content {
        padding: 1rem;
    }

    .score-mode-select {
        margin-bottom: 1rem;
        margin-top: -2.5rem;
    }

    .score-table {
        overflow-x: auto;
        margin-bottom: 1rem;
    }

    .score-table table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
        table-layout: fixed;
    }

    .score-table th,
    .score-table td {
        width: 20%;
        padding: 0.5rem 0.25rem;
        text-align: center;
        border: 1px solid rgba(var(--mdui-color-outline), 0.3);
        word-break: break-all;
    }

    .score-table th {
        background: rgba(var(--mdui-color-surface-variant), 0.3);
        font-weight: 600;
    }

    .judge-cp {
        background: rgba(255, 193, 7, 0.3);
    }

    .judge-perfect {
        background: rgba(255, 152, 0, 0.3);
    }

    .judge-great {
        background: rgba(233, 30, 99, 0.2);
    }

    .judge-good {
        background: rgba(76, 175, 80, 0.2);
    }

    .judge-miss {
        background: rgba(158, 158, 158, 0.3);
    }

    /* Make score cells appear clickable */
    .score-table td:not(:first-child),
    .break-cell:not(.break-note),
    .break-sub-cell {
        cursor: pointer;
    }

    .break-row-container {
        display: flex;
        border: 1px solid rgba(var(--mdui-color-outline), 0.3);
        border-top: none;
        font-size: 0.85rem;
    }

    .break-cell {
        flex: 0 0 20%;
        width: 20%;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 0.5rem 0.25rem;
        border-right: 1px solid rgba(var(--mdui-color-outline), 0.3);
        word-break: break-all;
        box-sizing: border-box;
    }

    .break-cell:last-child {
        border-right: none;
    }

    .break-note {
        background: rgba(var(--mdui-color-surface-variant), 0.1);
    }

    .break-perfect-col,
    .break-great-col {
        flex-direction: column;
        padding: 0;
    }

    .break-sub-cell {
        width: 100%;
        padding: 0.5rem 0.25rem;
        border-bottom: 1px solid rgba(var(--mdui-color-outline), 0.3);
        box-sizing: border-box;
    }

    .break-sub-cell:last-child {
        border-bottom: none;
    }

    .target-input {
        margin-bottom: 1rem;
    }

    .tolerance-result {
        background: rgba(var(--mdui-color-primary), 0.08);
        border-radius: 8px;
        padding: 1rem;
    }

    .tolerance-item {
        margin-bottom: 0.5rem;
        font-size: 0.9rem;
    }

    .tolerance-item:last-child {
        margin-bottom: 0;
    }

    .tolerance-item b {
        color: rgb(var(--mdui-color-primary));
    }

    mdui-tabs {
        --mdui-color-surface: #6cf;
    }
</style>
