<script setup lang="ts">
    import { ref, computed } from "vue";
    import { useRoute } from "vue-router";
    import ScoreSection from "@/components/data/chart/ScoreSection.vue";
    import RatingPlate from "@/components/data/user/RatingPlate.vue";
    import ChartInfoDialog from "@/components/data/chart/ChartInfo.vue";
    import type { Chart } from "@/components/data/music/type";
    import { getUserDisplayName } from "@/components/data/user/type";
    import type { DivingFishFullRecord } from "@/components/integrations/diving-fish/type";
    import { musicInfo } from "@/components/data/music";
    import { useShared } from "@/components/app/shared";
    import B50ToRender from "@/components/rendering/b50.vue";
    import domtoimage from "dom-to-image-more";
    import { dialog, snackbar } from "mdui";
    import { markDialogOpen, markDialogClosed } from "@/components/app/router.vue";
    import { ScoreCoefficient } from "@/components/data/chart/rating/ScoreCoefficient";

    const route = useRoute();
    const shared = useShared();
    const userId = ref(route.params.id as string);
    const error = ref<string | null>(null);
    const pending = ref(false);
    const musicChartMap = ref<Map<string, Chart>>(new Map());

    // 构建高效查找表
    function buildMusicChartMap() {
        if (!musicInfo) return;
        const map = new Map();
        for (const chart of Object.values(musicInfo.chartList) as Chart[]) {
            // key: `${song_id}-${level_index}`
            map.set(`${chart.music.id}-${chart.info.grade}`, chart);
        }
        musicChartMap.value = map;
    }
    buildMusicChartMap();

    const player = computed(() => {
        return shared.users[Number(userId.value ?? "0")] ?? null;
    });

    const isFitDiffMode = computed(() => {
        const queryValue = route.query.fit_diff;
        if (typeof queryValue === "string") return queryValue.toLowerCase() === "y";
        if (Array.isArray(queryValue))
            return queryValue.some(item => typeof item === "string" && item.toLowerCase() === "y");
        return false;
    });

    const errorMessage = computed(() => {
        if (!error.value) return "";
        const msg =
            error.value === "user not exists"
                ? `玩家 "${userId.value}" 不存在`
                : error.value || "加载数据时出错";
        return msg;
    });

    const chartsByNewness = computed(() => {
        if (!player.value?.data) return { old: [] as Chart[], newer: [] as Chart[] };

        const useFitDiff = isFitDiffMode.value;
        const records = getSourceRecords(useFitDiff);
        const charts = records
            .map(record => convertDFRecordToChart(record, useFitDiff))
            .filter((chart): chart is Chart => chart !== null);

        const oldCharts = charts.filter(chart => chart.music.info.isNew === false);
        const newCharts = charts.filter(chart => chart.music.info.isNew === true);

        if (useFitDiff) {
            return {
                old: sortCharts(oldCharts, 35),
                newer: sortCharts(newCharts, 15),
            };
        }

        return {
            old: oldCharts.slice(0, 35),
            newer: newCharts.slice(0, 15),
        };
    });

    const b50SdCharts = computed(() => chartsByNewness.value.old);
    const b50DxCharts = computed(() => chartsByNewness.value.newer);

    const displayedRating = computed(() => {
        const sumRatings = (charts: Chart[]) =>
            charts.reduce((sum, chart) => sum + (chart.score?.deluxeRating ?? 0), 0);
        return sumRatings(b50SdCharts.value) + sumRatings(b50DxCharts.value);
    });

    const chartInfoDialog = ref<{ open: boolean; chart: Chart | null }>({
        open: false,
        chart: null,
    });

    // 将 DivingFishFullRecord 转换为 Chart 类型
    function convertDFRecordToChart(
        record: DivingFishFullRecord,
        useFitDiff: boolean = false
    ): Chart | null {
        const baseChart = musicChartMap.value.get(`${record.song_id}-${record.level_index}`);
        if (!baseChart) return null;

        let rating = record.ra;
        let fitConstant: number | undefined;

        if (useFitDiff) {
            const rawFitConstant =
                baseChart.info.stat?.fit_diff ??
                (Number.isFinite(record.ds) ? record.ds : undefined) ??
                baseChart.info.constant;
            const normalizedConstant = normalizeConstant(rawFitConstant);
            fitConstant = normalizedConstant ?? baseChart.info.constant;
            rating = calculateRating(record.achievements, fitConstant);
        }

        const chartScore: Chart["score"] = {
            achievements: record.achievements,
            comboStatus: record.fc,
            syncStatus: record.fs,
            rankRate: record.rate,
            deluxeRating: rating,
            deluxeScore: record.dxScore,
            playCount: record.play_count,
        };

        if (typeof fitConstant === "number") {
            (chartScore as unknown as Record<string, unknown>).fitConstant = fitConstant;
        }

        return {
            ...baseChart,
            score: chartScore,
        };
    }

    function getSourceRecords(useFitDiff: boolean): DivingFishFullRecord[] {
        const detailedRecords = player.value?.data?.detailed
            ? Object.values(player.value.data.detailed)
            : [];

        if (useFitDiff && detailedRecords.length) return detailedRecords;

        const b50Records = player.value?.data?.b50;
        if (!b50Records) return [];

        return [...(b50Records.sd ?? []), ...(b50Records.dx ?? [])];
    }

    function sortCharts(charts: Chart[], limit: number): Chart[] {
        const sorted = [...charts].sort((a, b) => {
            const ratingA = a.score?.deluxeRating ?? 0;
            const ratingB = b.score?.deluxeRating ?? 0;
            if (ratingA !== ratingB) return ratingB - ratingA;

            const achA = a.score?.achievements ?? 0;
            const achB = b.score?.achievements ?? 0;
            if (achA !== achB) return achB - achA;

            const fitA = (a.score as Record<string, unknown> | undefined)?.fitConstant;
            const fitB = (b.score as Record<string, unknown> | undefined)?.fitConstant;
            const constantA =
                typeof fitA === "number" && !Number.isNaN(fitA) ? fitA : (a.info.constant ?? 0);
            const constantB =
                typeof fitB === "number" && !Number.isNaN(fitB) ? fitB : (b.info.constant ?? 0);
            return constantB - constantA;
        });

        return sorted.slice(0, limit);
    }

    function calculateRating(achievements: number | null, constant?: number): number {
        if (typeof achievements !== "number") return 0;
        if (typeof constant !== "number" || Number.isNaN(constant)) return 0;

        return new ScoreCoefficient(achievements).ra(constant);
    }

    function normalizeConstant(value?: number | null): number | undefined {
        if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
        return Math.round(value * 10) / 10;
    }

    function getB50Png() {
        return domtoimage.toPng(document.getElementById("player-b50-for-rendering"), {
            scale: 2,
            width: 1175,
            height: 1365,
        });
    }

    function generateRenderUrl(): string {
        const params = new URLSearchParams();

        const sdData = b50SdCharts.value.map(chart => ({
            song_id: chart.music.info.id,
            title: chart.music.info.title,
            type: chart.music.info.type,
            level_index: chart.info.grade,
            ds: chart.info.constant,
            achievements: chart.score?.achievements,
            fc: chart.score?.comboStatus,
            fs: chart.score?.syncStatus,
            rate: chart.score?.rankRate,
            ra: chart.score?.deluxeRating,
        }));

        const dxData = b50DxCharts.value.map(chart => ({
            song_id: chart.music.info.id,
            title: chart.music.info.title,
            type: chart.music.info.type,
            level_index: chart.info.grade,
            ds: chart.info.constant,
            achievements: chart.score?.achievements,
            fc: chart.score?.comboStatus,
            fs: chart.score?.syncStatus,
            rate: chart.score?.rankRate,
            ra: chart.score?.deluxeRating,
        }));

        params.append("s", JSON.stringify(sdData));
        params.append("d", JSON.stringify(dxData));
        params.append("n", getUserDisplayName(player.value));

        const secondaryName =
            player.value?.remark &&
            (player.value?.data?.name ??
                player.value?.divingFish?.name ??
                player.value?.inGame?.name)
                ? (player.value.data?.name ??
                  player.value.divingFish?.name ??
                  player.value.inGame?.name)
                : "";
        if (secondaryName) {
            params.append("o", secondaryName);
        }

        if (displayedRating.value) {
            params.append("r", displayedRating.value.toString());
        }

        return `${import.meta.env.VITE_puppeteer_renderer_improved_URL}/screenshot?deviceScaleFactor=2&width=1175&height=1365&url=https%3A%2F%2Falpha.salt.realtvop.top%2F%3Fgenb50%26${params.toString().replaceAll("&", "%26")}`;
    }

    function downloadB50Png() {
        dialog({
            headline: "生成 B50 图片",
            description: "[开发阶段 仅保证桌面端 Chrome 体验] 选择保存方式",
            actions: [
                {
                    text: "取消",
                },
                {
                    text: "复制图片",
                    onClick: () =>
                        getB50Png()
                            .then((dataUrl: string) => {
                                return fetch(dataUrl)
                                    .then(response => {
                                        if (!response.ok) {
                                            throw new Error("获取图片数据失败");
                                        }
                                        return response.blob();
                                    })
                                    .then(blob => {
                                        const clipboardItem = new ClipboardItem({
                                            "image/png": blob,
                                        });
                                        return navigator.clipboard.write([clipboardItem]);
                                    });
                            })
                            .then(() => {
                                snackbar({
                                    message: "B50 图片已成功复制到剪贴板!",
                                });
                            })
                            .catch(() => {
                                snackbar({
                                    message: "复制失败，请检查浏览器权限或稍后重试。",
                                });
                            }),
                },
                {
                    text: "下载图片",
                    onClick: () =>
                        getB50Png().then((dataUrl: string) => {
                            const link = document.createElement("a");
                            link.href = dataUrl;
                            const formattedTime = new Date().toLocaleString("zh-CN", {
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                            });
                            link.download = `B50_SaltNet_${getUserDisplayName(player.value)}_${formattedTime}.png`;
                            link.click();
                        }),
                },
                {
                    text: "在线渲染",
                    onClick: () => {
                        const renderUrl = generateRenderUrl();
                        window.open(renderUrl, "_blank");
                    },
                },
            ],
            closeOnEsc: true,
            closeOnOverlayClick: true,
            onOpen: markDialogOpen,
            onClose: markDialogClosed,
        });
    }
</script>

<template>
    <div class="player-profile">
        <div v-if="pending" class="loading-message">
            <div class="loading-spinner"></div>
            <p>加载中，请稍候...</p>
        </div>

        <div v-else-if="error" class="error-message">
            <h2>{{ errorMessage }}</h2>
            <p v-if="error !== 'user not exists'">请检查网络连接或稍后再试。</p>
            <p v-else>请检查用户名是否正确。</p>
        </div>

        <div v-else-if="player && player.data" class="player-b50">
            <div class="player-header">
                <div class="player-info">
                    <div class="player-name-container">
                        <span class="player-name">
                            {{ getUserDisplayName(player) }}
                        </span>
                        <span
                            v-if="
                                player.remark &&
                                (player.data.name ?? player.divingFish?.name ?? player.inGame?.name)
                            "
                            class="player-original-name"
                        >
                            {{ player.data.name ?? player.divingFish?.name ?? player.inGame?.name }}
                        </span>
                    </div>
                    <RatingPlate v-if="displayedRating" :ra="displayedRating" />
                </div>
                <mdui-button-icon icon="download" @click="downloadB50Png"></mdui-button-icon>
            </div>
            <ScoreSection
                v-if="b50SdCharts.length"
                title="旧版本成绩"
                :scores="b50SdCharts"
                :chartInfoDialog="chartInfoDialog"
            />
            <ScoreSection
                v-if="b50DxCharts.length"
                title="新版本成绩"
                :scores="b50DxCharts"
                :chartInfoDialog="chartInfoDialog"
            />
            <p
                v-if="!(b50SdCharts.length || b50DxCharts.length)"
                style="text-align: center; color: orange; margin-top: 20px"
            >
                未更新成绩或成绩更新失败，请到“用户”更新成绩
            </p>
        </div>

        <B50ToRender
            v-if="player && player.data"
            :b50SdCharts="b50SdCharts"
            :b50DxCharts="b50DxCharts"
            :playerName="getUserDisplayName(player)"
            :playerSecondaryName="
                player.remark &&
                (player.data.name ?? player.divingFish?.name ?? player.inGame?.name)
                    ? (player.data.name ?? player.divingFish?.name ?? player.inGame?.name)
                    : ''
            "
            :playerRating="displayedRating"
            style="display: none"
        />

        <div v-else class="error-message">
            <h2>无法加载玩家数据</h2>
            <p>未能获取到有效的玩家信息，是不是还没有添加用户？</p>
        </div>
    </div>

    <ChartInfoDialog
        :open="chartInfoDialog.open"
        :chart="chartInfoDialog.chart"
        :targetUserId="userId"
        singleLevel
    ></ChartInfoDialog>
</template>

<style scoped>
    .player-profile {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        box-sizing: border-box;
        overflow-x: hidden;
    }

    .loading-message,
    .error-message {
        text-align: center;
        margin-top: 50px;
        color: var(--text-secondary-color);
    }

    .loading-spinner {
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top: 4px solid var(--accent-color, #fff);
        width: 40px;
        height: 40px;
        animation: spin 1s linear infinite;
        margin: 20px auto;
    }

    @keyframes spin {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }

    .player-b50 {
        width: 100%;
        max-width: 1200px;
        box-sizing: border-box;
        padding-bottom: 5vh;
    }

    .player-header {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        flex-direction: row;
        margin-bottom: 24px;
        gap: 1.5rem;
        padding: 0 20px;
        justify-content: space-between;
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
    }

    .player-original-name {
        font-size: 0.9em;
        color: var(--mdui-color-on-surface-variant);
        font-weight: normal;
    }

    .error-message {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 50px 20px;
        text-align: center;
        color: var(--text-error-color, #ff6b6b);
    }

    .error-message h2 {
        color: var(--error-color, #ff6b6b);
        margin-bottom: 10px;
    }
</style>
