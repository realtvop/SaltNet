<script setup lang="ts">
    import { computed, ref } from "vue";
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

    const hoveredIndex = ref<number | null>(null);

    const activeTooltip = computed(() => {
        if (hoveredIndex.value === null || !chart.value.points.length) return null;
        const point = chart.value.points[hoveredIndex.value];
        const tooltipWidth = 75;
        const tooltipHeight = 38;

        const x = Math.max(
            8,
            Math.min(chart.value.width - tooltipWidth - 8, point.x - tooltipWidth / 2)
        );
        const y = point.y - tooltipHeight - 10 < 8 ? point.y + 12 : point.y - tooltipHeight - 10;

        return {
            x,
            y,
            width: tooltipWidth,
            height: tooltipHeight,
            rating: point.entry.rating,
            time: formatTimeMobile(point.entry.time),
        };
    });

    type ChartPoint = {
        x: number;
        y: number;
        entry: RatingHistoryEntry;
        triggerX: number;
        triggerWidth: number;
    };

    type ChartModel = {
        width: number;
        height: number;
        padding: { top: number; right: number; bottom: number; left: number };
        plotWidth: number;
        plotHeight: number;
        path: string;
        areaPath: string;
        points: ChartPoint[];
        pointString: string;
        ratingTicks: number[];
        labels: { x: number; text: string; anchor: "start" | "middle" | "end" }[];
        yFor: (rating: number) => number;
    };

    function formatTime(time: number) {
        return new Date(time).toLocaleString();
    }

    function formatTimeMobile(time: number) {
        const date = new Date(time);
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        const hh = String(date.getHours()).padStart(2, "0");
        const mm = String(date.getMinutes()).padStart(2, "0");
        return `${m}-${d} ${hh}:${mm}`;
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
                areaPath: "",
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
            triggerX: 0,
            triggerWidth: 0,
        }));

        for (let i = 0; i < points.length; i++) {
            let leftBoundary = padding.left;
            let rightBoundary = padding.left + plotWidth;

            if (points.length > 1) {
                if (i === 0) {
                    rightBoundary = (points[0].x + points[1].x) / 2;
                } else if (i === points.length - 1) {
                    leftBoundary = (points[i - 1].x + points[i].x) / 2;
                } else {
                    leftBoundary = (points[i - 1].x + points[i].x) / 2;
                    rightBoundary = (points[i].x + points[i + 1].x) / 2;
                }
            }

            points[i].triggerX = leftBoundary;
            points[i].triggerWidth = rightBoundary - leftBoundary;
        }
        const path = points
            .map(
                (point, index) =>
                    `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
            )
            .join(" ");

        const bottomY = padding.top + plotHeight;
        const areaPath =
            points.length > 0
                ? `M ${points[0].x.toFixed(2)} ${bottomY.toFixed(2)} ` +
                  points.map(p => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ") +
                  ` L ${points[points.length - 1].x.toFixed(2)} ${bottomY.toFixed(2)} Z`
                : "";

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
            areaPath,
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
            <!-- 用户信息 -->
            <div class="player-header">
                <div class="player-info">
                    <div class="player-name-container">
                        <span class="player-name">
                            {{ getUserDisplayName(user, "未知用户") }}
                        </span>
                        <span
                            v-if="
                                user.remark &&
                                (user.data.name ?? user.divingFish?.name ?? user.inGame?.name)
                            "
                            class="player-original-name"
                        >
                            {{ user.data.name ?? user.divingFish?.name ?? user.inGame?.name }}
                        </span>
                    </div>
                    <RatingPlate v-if="typeof currentRating === 'number'" :ra="currentRating" />
                </div>
            </div>

            <!-- 统计图 -->
            <mdui-card variant="outlined" class="chart-card" v-if="history.length">
                <div class="chart-container">
                    <svg
                        class="rating-chart"
                        :viewBox="`0 0 ${chart.width} ${chart.height}`"
                        role="img"
                        aria-label="Rating 时间趋势折线图"
                    >
                        <defs>
                            <linearGradient id="chart-area-gradient" x1="0" y1="0" x2="0" y2="1">
                                <stop
                                    offset="0%"
                                    stop-color="rgb(var(--mdui-color-primary))"
                                    stop-opacity="0.25"
                                />
                                <stop
                                    offset="100%"
                                    stop-color="rgb(var(--mdui-color-primary))"
                                    stop-opacity="0.0"
                                />
                            </linearGradient>
                        </defs>
                        <!-- Guideline when hovered -->
                        <line
                            v-if="hoveredIndex !== null"
                            :x1="chart.points[hoveredIndex].x"
                            :x2="chart.points[hoveredIndex].x"
                            :y1="chart.padding.top"
                            :y2="chart.padding.top + chart.plotHeight"
                            class="hover-guideline"
                        />
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
                        <!-- 渐变填充区域 -->
                        <path
                            class="area-fill"
                            :d="chart.areaPath"
                            fill="url(#chart-area-gradient)"
                        />
                        <!-- 折线 -->
                        <path class="trend-line" :d="chart.path" />
                        <!-- 数据点 -->
                        <g>
                            <circle
                                v-for="(point, index) in chart.points"
                                :key="`${point.entry.time}-${point.entry.rating}`"
                                class="chart-point"
                                :class="{ 'chart-point-active': hoveredIndex === index }"
                                :cx="point.x"
                                :cy="point.y"
                                r="4"
                            />
                        </g>
                        <!-- Tooltip group -->
                        <g v-if="activeTooltip" class="chart-tooltip-group">
                            <rect
                                :x="activeTooltip.x"
                                :y="activeTooltip.y"
                                :width="activeTooltip.width"
                                :height="activeTooltip.height"
                                rx="6"
                                class="tooltip-bg"
                            />
                            <text
                                :x="activeTooltip.x + activeTooltip.width / 2"
                                :y="activeTooltip.y + 15"
                                text-anchor="middle"
                                class="tooltip-text-rating"
                            >
                                {{ activeTooltip.rating }}
                            </text>
                            <text
                                :x="activeTooltip.x + activeTooltip.width / 2"
                                :y="activeTooltip.y + 29"
                                text-anchor="middle"
                                class="tooltip-text-date"
                            >
                                {{ activeTooltip.time }}
                            </text>
                        </g>
                        <!-- Invisible interaction triggers -->
                        <g>
                            <rect
                                v-for="(point, idx) in chart.points"
                                :key="`trigger-${idx}`"
                                :x="point.triggerX"
                                :y="chart.padding.top"
                                :width="point.triggerWidth"
                                :height="chart.plotHeight"
                                fill="transparent"
                                style="cursor: default"
                                @mouseenter="hoveredIndex = idx"
                                @mouseleave="hoveredIndex = null"
                            />
                        </g>
                    </svg>
                </div>
            </mdui-card>

            <!-- 暂无历史记录的空状态 -->
            <div class="empty-state" v-else>
                <mdui-icon name="show_chart" class="empty-icon"></mdui-icon>
                <p class="empty-text">还没有 Rating 历史。下次更新成绩时会自动记录变化。</p>
            </div>

            <!-- 历史记录表 -->
            <div class="table-responsive" v-if="history.length">
                <table class="history-table">
                    <thead>
                        <tr>
                            <th class="col-time">时间</th>
                            <th class="col-rating">Rating</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="entry in reversedHistory" :key="`${entry.time}-${entry.rating}`">
                            <td class="col-time">
                                <span class="time-desktop">{{ formatTime(entry.time) }}</span>
                                <span class="time-mobile">
                                    {{ formatTimeMobile(entry.time) }}
                                </span>
                            </td>
                            <td class="col-rating font-mono">
                                <strong>{{ entry.rating }}</strong>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </template>

        <!-- 找不到用户时的空状态 -->
        <div class="empty-state" v-else>
            <mdui-icon name="person_off" class="empty-icon"></mdui-icon>
            <p class="empty-text">找不到这个用户。</p>
            <mdui-button variant="tonal" @click="router.push('/users')" class="back-btn">
                返回用户列表
            </mdui-button>
        </div>
    </div>
</template>

<style scoped>
    .rating-history-page {
        width: min(100%, 960px);
        margin: 0 auto;
        padding: 16px 16px calc(3.5rem + 32px) 16px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    /* player-header styles matching b50 page */
    .player-header {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        flex-direction: row;
        margin-bottom: 8px;
        gap: 1.5rem;
        padding: 8px 12px 16px 12px;
        justify-content: space-between;
        box-sizing: border-box;
    }

    .player-info {
        display: flex;
        align-items: center;
        gap: 1.5rem;
    }

    .player-name-container {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
    }

    .player-name {
        font-size: 2em;
        font-weight: bold;
        color: rgb(var(--mdui-color-on-surface));
    }

    .player-original-name {
        font-size: 0.9em;
        color: rgb(var(--mdui-color-on-surface-variant));
        font-weight: normal;
    }

    /* chart card styles */
    .chart-card {
        border-radius: 16px !important;
        border: 1px solid rgb(var(--mdui-color-outline-variant)) !important;
        background-color: rgb(var(--mdui-color-surface-container-low)) !important;
        box-shadow: none !important;
    }

    /* chart-card styles */
    .chart-container {
        padding: 12px 20px 20px;
        overflow-x: auto;
        width: 100%;
        box-sizing: border-box;
        scrollbar-width: thin;
        scrollbar-color: rgb(var(--mdui-color-outline-variant)) transparent;
    }

    .chart-container::-webkit-scrollbar {
        height: 6px;
    }

    .chart-container::-webkit-scrollbar-thumb {
        background: rgb(var(--mdui-color-outline-variant));
        border-radius: 3px;
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
        stroke-dasharray: 4 4;
        opacity: 0.7;
    }

    .axis-labels text {
        fill: rgb(var(--mdui-color-on-surface-variant));
        font-size: 12px;
        font-family: inherit;
    }

    .trend-line {
        fill: none;
        stroke: rgb(var(--mdui-color-primary));
        stroke-width: 3.5;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    .chart-point {
        fill: rgb(var(--mdui-color-surface-container-high));
        stroke: rgb(var(--mdui-color-primary));
        stroke-width: 1.5;
        cursor: default;
        pointer-events: none;
    }

    .chart-point-active {
        fill: rgb(var(--mdui-color-primary));
        stroke: rgb(var(--mdui-color-primary));
    }

    .hover-guideline {
        stroke: rgb(var(--mdui-color-primary));
        stroke-width: 1;
        stroke-dasharray: 3 3;
        pointer-events: none;
    }

    .tooltip-bg {
        fill: rgb(var(--mdui-color-inverse-surface));
        pointer-events: none;
    }

    .tooltip-text-rating {
        fill: rgb(var(--mdui-color-inverse-on-surface));
        font-size: 11px;
        font-weight: 700;
        font-family: inherit;
        pointer-events: none;
    }

    .tooltip-text-date {
        fill: rgb(var(--mdui-color-inverse-on-surface));
        font-size: 9px;
        opacity: 0.8;
        font-family: inherit;
        pointer-events: none;
    }

    /* history-card styles */
    .table-responsive {
        width: 100%;
        overflow-x: auto;
    }

    .history-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
    }

    .history-table th,
    .history-table td {
        padding: 14px 20px;
        border-bottom: 1px solid rgb(var(--mdui-color-outline-variant));
    }

    .history-table tr:last-child td {
        border-bottom: none;
    }

    .history-table th {
        font-size: 0.85rem;
        font-weight: 700;
        color: rgb(var(--mdui-color-on-surface-variant));
        background-color: rgba(var(--mdui-color-outline-variant), 0.15);
    }

    .col-time {
        text-align: left;
        color: rgb(var(--mdui-color-on-surface-variant));
    }

    .history-table td.col-time {
        font-size: 0.9rem;
    }

    .col-rating {
        font-size: 1.15rem;
        text-align: right;
        color: rgb(var(--mdui-color-on-surface));
    }

    .font-mono {
        font-family: Monaco, "JetBrains Mono", monospace;
    }

    /* time responsive switch */
    .time-mobile {
        display: none;
    }

    .time-desktop {
        display: inline;
    }

    /* empty and error state styles */
    .empty-state {
        display: flex;
        min-height: 180px;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 32px 20px;
        text-align: center;
    }

    .empty-icon {
        font-size: 48px;
        color: rgb(var(--mdui-color-primary));
    }

    .empty-text {
        margin: 0;
        font-size: 0.95rem;
        color: rgb(var(--mdui-color-on-surface-variant));
        max-width: 400px;
        line-height: 1.5;
    }

    .back-btn {
        margin-top: 8px;
    }

    /* Responsive Adaptation */
    @media (max-width: 600px) {
        .rating-history-page {
            padding: 8px 8px calc(3.5rem + 16px) 8px;
            gap: 12px;
        }

        .player-header {
            flex-direction: column;
            align-items: flex-start;
            padding: 8px 4px 12px 4px;
            gap: 12px;
        }

        .player-name {
            font-size: 1.6em;
        }

        .chart-container {
            padding: 8px 12px 16px;
        }

        .history-table th,
        .history-table td {
            padding: 10px 12px;
        }
        .col-rating {
            font-size: 1rem;
        }
        .time-mobile {
            display: inline;
        }

        .time-desktop {
            display: none;
        }

        .history-table td.col-time {
            font-size: 0.8rem;
        }
    }
</style>
