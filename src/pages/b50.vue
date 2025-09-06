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

    const errorMessage = computed(() => {
        if (!error.value) return "";
        const msg =
            error.value === "user not exists"
                ? `玩家 "${userId.value}" 不存在`
                : error.value || "加载数据时出错";
        return msg;
    });

    const b50SdCharts = computed(() => {
        if (!player.value?.data?.b50?.sd) return [];
        return player.value.data.b50.sd
            .map(convertDFRecordToChart)
            .filter((chart): chart is Chart => chart !== null);
    });
    const b50DxCharts = computed(() => {
        if (!player.value?.data?.b50?.dx) return [];
        return player.value.data.b50.dx
            .map(convertDFRecordToChart)
            .filter((chart): chart is Chart => chart !== null);
    });

    const chartInfoDialog = ref<{ open: boolean; chart: Chart | null }>({
        open: false,
        chart: null,
    });

    // 将 DivingFishFullRecord 转换为 Chart 类型
    function convertDFRecordToChart(record: DivingFishFullRecord): Chart | null {
        const baseChart = musicChartMap.value.get(`${record.song_id}-${record.level_index}`);
        if (!baseChart) return null;

        const chartScore: Chart["score"] = {
            achievements: record.achievements,
            comboStatus: record.fc,
            syncStatus: record.fs,
            rankRate: record.rate,
            deluxeRating: record.ra,
            deluxeScore: record.dxScore,
        };

        return {
            ...baseChart,
            score: chartScore,
        };
    }

    function getB50Png() {
        return domtoimage.toPng(document.getElementById("player-b50-for-rendering"), {
            scale: 2,
            width: 1175,
            height: 1365,
        });
    }

    function downloadB50Png() {
        dialog({
            headline: "生成 B50 图片",
            description: "[开发阶段 近保证桌面端Chrome效果] 选择保存方式",
            actions: [
                {
                    text: "取消",
                },
                {
                    text: "复制",
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
                    text: "下载",
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
                    <RatingPlate v-if="player.data.rating != null" :ra="player.data.rating" />
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
            :player="player"
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
