<script setup lang="ts">
    import { computed } from "vue";
    import { useRoute, useRouter } from "vue-router";
    import { useShared } from "@/components/app/shared";
    import { getUserDisplayName, type RatingHistoryEntry } from "@/components/data/user/type";
    import { normalizeRatingHistory } from "@/components/data/user/ratingHistory";
    import RatingPlate from "@/components/data/user/RatingPlate.vue";

    const route = useRoute();
    const router = useRouter();
    const shared = useShared();

    const userIndex = computed(() => Number(route.params.id ?? "0"));
    const user = computed(() => shared.users[userIndex.value] ?? null);
    const history = computed(() => (user.value ? normalizeRatingHistory(user.value) : []));
    const reversedHistory = computed(() => [...history.value].reverse());
    const currentRating = computed(() => user.value?.data.rating ?? null);

    const chart = computed(() => buildChart(history.value));

    const summary = computed(() => {
        if (!history.value.length) return null;
        const first = history.value[0];
        const last = history.value[history.value.length - 1];
        return {
            first,
            last,
            delta: last.rating - first.rating,
        };
    });

    type ChartPoint = {
        x: number;
        y: number;
        entry: RatingHistoryEntry;
    };

    type ChartModel = {
        width: number;
        height: number;
        padding: { top: number; right: number; bottom: number; left: number };
        plotWidth: number;
        plotHeight: number;
        path: string;
        points: ChartPoint[];
        pointString: string;
        ratingTicks: number[];
        labels: { x: number; text: string; anchor: "start" | "middle" | "end" }[];
        yFor: (rating: number) => number;
    };

    function formatTime(time: number) {
        return new Date(time).toLocaleString();
    }

    function formatDelta(delta: number) {
        if (delta > 0) return `+${delta}`;
        return `${delta}`;
    }

    function getPreviousDelta(indexInReversed: number) {
        const originalIndex = history.value.length - 1 - indexInReversed;
        if (originalIndex <= 0) return null;
        return history.value[originalIndex].rating - history.value[originalIndex - 1].rating;
    }

    function buildChart(entries: RatingHistoryEntry[]): ChartModel {
        const width = 760;
        const height = 300;
        const padding = { top: 24, right: 24, bottom: 42, left: 56 };
        const plotWidth = width - padding.left - padding.right;
        const plotHeight = height - padding.top - padding.bottom;
        const emptyYFor = () => padding.top + plotHeight / 2;

        if (!entries.length) {
            return {
                width,
                height,
                padding,
                plotWidth,
                plotHeight,
                path: "",
                points: [],
                pointString: "",
                ratingTicks: [],
                labels: [],
                yFor: emptyYFor,
            };
        }

        const times = entries.map(entry => entry.time);
        const ratings = entries.map(entry => entry.rating);
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        const rawMinRating = Math.min(...ratings);
        const rawMaxRating = Math.max(...ratings);
        const ratingPadding = Math.max(10, Math.ceil((rawMaxRating - rawMinRating) * 0.12));
        const minRating =
            rawMinRating === rawMaxRating ? rawMinRating - 10 : rawMinRating - ratingPadding;
        const maxRating =
            rawMinRating === rawMaxRating ? rawMaxRating + 10 : rawMaxRating + ratingPadding;

        const xFor = (time: number, index: number) => {
            if (minTime === maxTime) {
                return (
                    padding.left +
                    (entries.length === 1
                        ? plotWidth / 2
                        : (plotWidth * index) / (entries.length - 1))
                );
            }
            return padding.left + ((time - minTime) / (maxTime - minTime)) * plotWidth;
        };
        const yFor = (rating: number) =>
            padding.top + ((maxRating - rating) / (maxRating - minRating)) * plotHeight;

        const points = entries.map((entry, index) => ({
            x: xFor(entry.time, index),
            y: yFor(entry.rating),
            entry,
        }));
        const path = points
            .map(
                (point, index) =>
                    `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
            )
            .join(" ");
        const pointString = points
            .map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
            .join(" ");
        const ratingTicks = Array.from({ length: 5 }, (_, index) =>
            Math.round(minRating + ((maxRating - minRating) * index) / 4)
        ).reverse();

        const labels: ChartModel["labels"] = [
            { x: padding.left, text: formatShortDate(minTime), anchor: "start" },
            {
                x: padding.left + plotWidth / 2,
                text: formatShortDate(minTime + (maxTime - minTime) / 2),
                anchor: "middle",
            },
            { x: padding.left + plotWidth, text: formatShortDate(maxTime), anchor: "end" },
        ];

        return {
            width,
            height,
            padding,
            plotWidth,
            plotHeight,
            path,
            points,
            pointString,
            ratingTicks,
            labels,
            yFor,
        };
    }

    function formatShortDate(time: number) {
        return new Date(time).toLocaleDateString(undefined, {
            month: "2-digit",
            day: "2-digit",
        });
    }
</script>

<template>
    <div class="rating-history-page">
        <template v-if="user">
            <section class="header-section">
                <div>
                    <p class="eyebrow">Rating 历史</p>
                    <h1>{{ getUserDisplayName(user, "未知用户") }}</h1>
                </div>
                <RatingPlate
                    v-if="typeof currentRating === 'number'"
                    :ra="currentRating"
                    class="current-rating"
                />
            </section>

            <section class="stats-row">
                <div class="stat-block">
                    <span class="stat-label">记录数</span>
                    <strong>{{ history.length }}</strong>
                </div>
                <div class="stat-block">
                    <span class="stat-label">首次记录</span>
                    <strong>{{ summary ? summary.first.rating : "无" }}</strong>
                </div>
                <div class="stat-block">
                    <span class="stat-label">累计变化</span>
                    <strong
                        :class="{
                            positive: (summary?.delta ?? 0) > 0,
                            negative: (summary?.delta ?? 0) < 0,
                        }"
                    >
                        {{ summary ? formatDelta(summary.delta) : "无" }}
                    </strong>
                </div>
            </section>

            <section class="chart-section" v-if="history.length">
                <svg
                    class="rating-chart"
                    :viewBox="`0 0 ${chart.width} ${chart.height}`"
                    role="img"
                    aria-label="Rating 时间趋势折线图"
                >
                    <g class="grid">
                        <line
                            v-for="tick in chart.ratingTicks"
                            :key="tick"
                            :x1="chart.padding.left"
                            :x2="chart.padding.left + chart.plotWidth"
                            :y1="chart.yFor(tick)"
                            :y2="chart.yFor(tick)"
                        />
                    </g>
                    <g class="axis-labels">
                        <text
                            v-for="tick in chart.ratingTicks"
                            :key="`label-${tick}`"
                            :x="chart.padding.left - 10"
                            :y="chart.yFor(tick) + 4"
                            text-anchor="end"
                        >
                            {{ tick }}
                        </text>
                        <text
                            v-for="label in chart.labels"
                            :key="`${label.x}-${label.text}`"
                            :x="label.x"
                            :y="chart.height - 12"
                            :text-anchor="label.anchor"
                        >
                            {{ label.text }}
                        </text>
                    </g>
                    <polyline class="area-line" :points="chart.pointString" />
                    <path class="trend-line" :d="chart.path" />
                    <g>
                        <circle
                            v-for="point in chart.points"
                            :key="`${point.entry.time}-${point.entry.rating}`"
                            class="chart-point"
                            :cx="point.x"
                            :cy="point.y"
                            r="5"
                        >
                            <title>
                                {{ `${formatTime(point.entry.time)} - ${point.entry.rating}` }}
                            </title>
                        </circle>
                    </g>
                </svg>
            </section>

            <section class="empty-state" v-else>
                <mdui-icon name="show_chart"></mdui-icon>
                <p>还没有 Rating 历史。下次更新成绩时会自动记录变化。</p>
            </section>

            <section class="history-list" v-if="history.length">
                <div
                    class="history-row"
                    v-for="(entry, index) in reversedHistory"
                    :key="`${entry.time}-${entry.rating}`"
                >
                    <div>
                        <strong>{{ entry.rating }}</strong>
                        <span
                            v-if="getPreviousDelta(index) !== null"
                            class="delta"
                            :class="{
                                positive: Number(getPreviousDelta(index)) > 0,
                                negative: Number(getPreviousDelta(index)) < 0,
                            }"
                        >
                            {{ formatDelta(Number(getPreviousDelta(index))) }}
                        </span>
                    </div>
                    <time>{{ formatTime(entry.time) }}</time>
                </div>
            </section>
        </template>

        <section class="empty-state" v-else>
            <mdui-icon name="person_off"></mdui-icon>
            <p>找不到这个用户。</p>
            <mdui-button variant="tonal" @click="router.push('/users')">返回用户列表</mdui-button>
        </section>
    </div>
</template>

<style scoped>
    .rating-history-page {
        width: min(100%, 960px);
        margin: 0 auto;
        padding-bottom: calc(3.5rem + 32px);
    }

    .header-section,
    .stats-row,
    .chart-section,
    .history-list,
    .empty-state {
        width: 100%;
        box-sizing: border-box;
    }

    .header-section {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 12px 2px 18px;
    }

    .eyebrow {
        margin: 0 0 4px;
        color: rgb(var(--mdui-color-primary));
        font-size: 0.85rem;
        font-weight: 700;
    }

    h1 {
        margin: 0;
        font-size: 1.8rem;
        line-height: 1.2;
        word-break: break-word;
    }

    .current-rating {
        flex: 0 0 auto;
    }

    .stats-row {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 12px;
    }

    .stat-block,
    .chart-section,
    .history-row,
    .empty-state {
        background: rgb(var(--mdui-color-surface-container));
        border: 1px solid rgb(var(--mdui-color-outline-variant));
        border-radius: 8px;
    }

    .stat-block {
        padding: 12px;
        min-width: 0;
    }

    .stat-label {
        display: block;
        margin-bottom: 6px;
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: 0.85rem;
    }

    .stat-block strong {
        font-size: 1.25rem;
    }

    .chart-section {
        padding: 12px;
        overflow-x: auto;
    }

    .rating-chart {
        display: block;
        width: 100%;
        min-width: 520px;
        height: auto;
    }

    .grid line {
        stroke: rgb(var(--mdui-color-outline-variant));
        stroke-width: 1;
    }

    .axis-labels text {
        fill: rgb(var(--mdui-color-on-surface-variant));
        font-size: 13px;
    }

    .area-line {
        fill: none;
        stroke: rgba(var(--mdui-color-primary), 0.18);
        stroke-width: 14;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    .trend-line {
        fill: none;
        stroke: rgb(var(--mdui-color-primary));
        stroke-width: 3;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    .chart-point {
        fill: rgb(var(--mdui-color-primary));
        stroke: rgb(var(--mdui-color-surface-container));
        stroke-width: 2;
    }

    .history-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 12px;
    }

    .history-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
    }

    .history-row strong {
        font-size: 1.15rem;
    }

    .delta {
        margin-left: 8px;
        color: rgb(var(--mdui-color-on-surface-variant));
        font-weight: 700;
    }

    .positive {
        color: rgb(var(--mdui-color-primary));
    }

    .negative {
        color: rgb(var(--mdui-color-error));
    }

    time {
        color: rgb(var(--mdui-color-on-surface-variant));
        text-align: right;
    }

    .empty-state {
        display: flex;
        min-height: 220px;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 14px;
        padding: 24px;
        text-align: center;
        color: rgb(var(--mdui-color-on-surface-variant));
    }

    .empty-state mdui-icon {
        font-size: 42px;
        color: rgb(var(--mdui-color-primary));
    }

    @media (max-width: 640px) {
        .header-section {
            align-items: flex-start;
            flex-direction: column;
        }

        .stats-row {
            grid-template-columns: 1fr;
        }

        .history-row {
            align-items: flex-start;
            flex-direction: column;
        }

        time {
            text-align: left;
        }
    }
</style>
