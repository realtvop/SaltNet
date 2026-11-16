<script setup lang="ts">
    import { ref, computed, onMounted } from "vue";
    import { useRoute, useRouter } from "vue-router";
    import ScoreSection from "@/components/data/chart/ScoreSection.vue";
    import RatingPlate from "@/components/data/user/RatingPlate.vue";
    import ChartInfoDialog from "@/components/data/chart/ChartInfo.vue";
    import type { ComboFilterMode } from "@/components/data/chart/b50Query";
    import {
        createMusicChartMap,
        recordsHaveLastChangedAt,
        selectB50Charts,
        sumChartRatings,
    } from "@/components/data/chart/b50Query";
    import type { Chart } from "@core/music/type";
    import { getUserDisplayName } from "@core/user/type";
    import { getMusicInfoAsync, isMusicDataLoading } from "@/components/data/music";
    import { useShared } from "@/components/app/shared";
    import { renderB50WithTakumi } from "@/components/rendering/takumiB50";
    import { dialog, snackbar, type Dialog } from "mdui";
    import { markDialogOpen, markDialogClosed } from "@/components/app/router";
    import {
        type B50RenderChart as B50RenderChartPayload,
        type B50RenderPayload,
    } from "../../shared/rendering/b50-payload";
    import { createB50DownloadFilename } from "../../shared/rendering/b50-filename";

    const DOWNLOAD_URL_REVOKE_DELAY_MS = 60_000;

    interface FileSystemWritableFileStreamLike {
        write(data: Blob): Promise<void>;
        close(): Promise<void>;
    }

    interface FileSystemFileHandleLike {
        createWritable(): Promise<FileSystemWritableFileStreamLike>;
    }

    interface WindowWithSaveFilePicker extends Window {
        showSaveFilePicker?: (options: {
            suggestedName: string;
            types: Array<{
                description: string;
                accept: Record<string, string[]>;
            }>;
        }) => Promise<FileSystemFileHandleLike>;
    }

    const route = useRoute();
    const router = useRouter();
    const shared = useShared();
    const userId = ref(route.params.id as string);
    const error = ref<string | null>(null);
    const pending = ref(false);
    const musicChartMap = ref<Map<string, Chart>>(new Map());

    // 构建高效查找表
    async function buildMusicChartMap() {
        pending.value = true;
        try {
            const musicInfo = await getMusicInfoAsync();
            if (!musicInfo) return;
            musicChartMap.value = createMusicChartMap(
                Object.values(musicInfo.chartList) as Chart[]
            );
        } finally {
            pending.value = false;
        }
    }

    onMounted(() => {
        buildMusicChartMap();
    });

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

    const isNb50Mode = computed(() => {
        const queryValue = route.query.nb50;
        if (typeof queryValue === "string") return queryValue.toLowerCase() === "y";
        if (Array.isArray(queryValue))
            return queryValue.some(item => typeof item === "string" && item.toLowerCase() === "y");
        return false;
    });

    const hasLastChangedAt = computed(() => recordsHaveLastChangedAt(player.value?.data));

    const isPc50Mode = computed(() => {
        if (!hasLastChangedAt.value) return false;
        const queryValue = route.query.pc50;
        if (typeof queryValue === "string") return queryValue.toLowerCase() === "y";
        if (Array.isArray(queryValue))
            return queryValue.some(item => typeof item === "string" && item.toLowerCase() === "y");
        return false;
    });

    const comboFilterMode = computed((): ComboFilterMode => {
        const queryValue = route.query.combo_filter;
        if (typeof queryValue === "string") {
            const lower = queryValue.toLowerCase();
            if (lower === "ap" || lower === "fc") return lower;
        }
        return null;
    });

    const modeLabel = computed(() => {
        if (comboFilterMode.value === "ap") return "AP50";
        if (comboFilterMode.value === "fc") return "FC50";
        if (isPc50Mode.value) return "PC50";
        if (isNb50Mode.value) return "牛逼 50";
        if (isFitDiffMode.value) return "拟合 B50";
        return null;
    });

    function setMode(mode: "fit" | "ap" | "fc" | "nb" | "pc") {
        const query: Record<string, string> = {};
        if (mode === "fit") query.fit_diff = "y";
        else if (mode === "nb") query.nb50 = "y";
        else if (mode === "pc") query.pc50 = "y";
        else query.combo_filter = mode;
        router.replace({ query });
    }

    function clearMode() {
        router.replace({ query: {} });
    }

    const hasDetailedData = computed(() => !!player.value?.data?.detailed);

    const errorMessage = computed(() => {
        if (!error.value) return "";
        const msg =
            error.value === "user not exists"
                ? `玩家 "${userId.value}" 不存在`
                : error.value || "加载数据时出错";
        return msg;
    });

    const chartsByNewness = computed(() =>
        selectB50Charts(player.value?.data, musicChartMap.value, {
            fitDiff: isFitDiffMode.value,
            nb50: isNb50Mode.value,
            comboFilter: comboFilterMode.value,
            pc50: isPc50Mode.value,
        })
    );

    const b50SdCharts = computed(() => chartsByNewness.value.old);
    const b50DxCharts = computed(() => chartsByNewness.value.newer);

    const displayedRating = computed(
        () => sumChartRatings(b50SdCharts.value) + sumChartRatings(b50DxCharts.value)
    );

    const chartInfoDialog = ref<{ open: boolean; chart: Chart | null }>({
        open: false,
        chart: null,
    });

    function requestBlobDownload(blob: Blob, filename: string, requireUserActivation: boolean) {
        if (
            requireUserActivation &&
            navigator.userActivation &&
            !navigator.userActivation.isActive
        ) {
            throw new Error("浏览器需要再次确认后才能保存文件。");
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.style.display = "none";

        try {
            document.body.appendChild(link);
            link.click();
        } catch (error) {
            URL.revokeObjectURL(url);
            throw error;
        } finally {
            link.remove();
        }

        window.setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_REVOKE_DELAY_MS);
    }

    async function saveBlobAfterConfirmation(blob: Blob, filename: string): Promise<string> {
        const saveFilePicker = (window as WindowWithSaveFilePicker).showSaveFilePicker;
        if (saveFilePicker) {
            const handle = await saveFilePicker.call(window, {
                suggestedName: filename,
                types: [
                    {
                        description: "PNG 图片",
                        accept: { "image/png": [".png"] },
                    },
                ],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return "B50 图片已保存。";
        }

        const file = new File([blob], filename, { type: "image/png" });
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: filename });
            return "已打开系统保存菜单。";
        }

        requestBlobDownload(blob, filename, true);
        return "已请求浏览器下载 B50 图片。";
    }

    function showDownloadFallbackAfterClose(
        currentDialog: Dialog,
        blob: Blob,
        filename: string
    ): void {
        currentDialog.addEventListener(
            "closed",
            () => {
                dialog({
                    headline: "需要再次确认",
                    description: "图片已经生成，但浏览器未能直接启动保存。请再次点击保存。",
                    actions: [
                        { text: "取消" },
                        {
                            text: "保存",
                            onClick: async () => {
                                try {
                                    const message = await saveBlobAfterConfirmation(blob, filename);
                                    snackbar({ message });
                                } catch (error) {
                                    if (
                                        error instanceof DOMException &&
                                        error.name === "AbortError"
                                    ) {
                                        snackbar({ message: "已取消保存。" });
                                        return;
                                    }
                                    snackbar({
                                        message:
                                            error instanceof Error
                                                ? error.message
                                                : "保存失败，请稍后重试。",
                                    });
                                }
                            },
                        },
                    ],
                    closeOnEsc: true,
                    closeOnOverlayClick: true,
                    onOpen: markDialogOpen,
                    onClose: markDialogClosed,
                });
            },
            { once: true }
        );
        currentDialog.open = false;
    }

    function downloadB50Png() {
        async function renderLocalBlob(): Promise<Blob> {
            return renderB50WithTakumi(buildB50RenderPayload());
        }

        const copyAction = {
            text: "复制",
            onClick: async () => {
                const renderingSnackbar = snackbar({
                    message: "正在渲染 B50...",
                    autoCloseDelay: 0,
                });
                try {
                    const blob = await renderLocalBlob();
                    const clipboardItem = new ClipboardItem({ "image/png": blob });
                    await navigator.clipboard.write([clipboardItem]);
                    renderingSnackbar.open = false;
                    snackbar({ message: "B50 图片已成功复制到剪贴板!" });
                } catch (err) {
                    renderingSnackbar.open = false;
                    snackbar({
                        message:
                            err instanceof Error
                                ? err.message
                                : "复制失败，请检查浏览器权限或稍后重试。",
                    });
                }
            },
        };

        const downloadAction = {
            text: "下载",
            onClick: async (currentDialog: Dialog) => {
                const renderingSnackbar = snackbar({
                    message: "正在渲染 B50...",
                    autoCloseDelay: 0,
                });

                let blob: Blob;
                try {
                    blob = await renderLocalBlob();
                } catch (err) {
                    renderingSnackbar.open = false;
                    snackbar({
                        message: err instanceof Error ? err.message : "渲染失败，请稍后重试。",
                    });
                    return;
                }

                const filename = createB50DownloadFilename({
                    modeLabel: modeLabel.value,
                    playerName: getUserDisplayName(player.value),
                });

                try {
                    requestBlobDownload(blob, filename, true);
                    snackbar({ message: "已请求浏览器下载 B50 图片。" });
                } catch {
                    showDownloadFallbackAfterClose(currentDialog, blob, filename);
                } finally {
                    renderingSnackbar.open = false;
                }
            },
        };

        const localAction = {
            text: "本地",
            onClick: () => showLocalSaveOptions(),
        };

        const onlineRenderAction = {
            text: "在线",
            onClick: () => {
                const rendererUrl = getRendererBaseUrl();
                if (!rendererUrl) {
                    snackbar({ message: "未配置 Takumi 渲染服务地址" });
                    return;
                }
                try {
                    const form = document.createElement("form");
                    form.method = "POST";
                    form.action = `${rendererUrl}/render/b50`;
                    form.target = "_blank";
                    form.style.display = "none";

                    const input = document.createElement("input");
                    input.type = "hidden";
                    input.name = "payload";
                    input.value = JSON.stringify(buildB50RenderPayload());

                    form.appendChild(input);
                    document.body.appendChild(form);
                    form.submit();
                    document.body.removeChild(form);
                } catch (err) {
                    snackbar({
                        message: err instanceof Error ? err.message : "在线渲染失败。",
                    });
                }
            },
        };

        const isSupported = true; //isLocalRenderSupported();
        const baseActions = [
            {
                text: "取消",
            },
        ];

        function showLocalSaveOptions() {
            const localActions = [...baseActions, copyAction, downloadAction];

            dialog({
                headline: "本地渲染",
                description: "选择保存方式",
                actions: localActions,
                closeOnEsc: true,
                closeOnOverlayClick: true,
                onOpen: markDialogOpen,
                onClose: markDialogClosed,
            });
        }

        const mainActions = [
            ...baseActions,
            ...(isSupported ? [localAction] : []),
            onlineRenderAction,
        ];

        dialog({
            headline: "生成 B50 图片",
            description: isSupported
                ? "请选择渲染方式"
                : "本地渲染在 iOS 与基于 Firefox 的浏览器上不可用，请使用其他浏览器或在线渲染",
            actions: mainActions,
            closeOnEsc: true,
            closeOnOverlayClick: true,
            onOpen: markDialogOpen,
            onClose: markDialogClosed,
        });
    }

    function buildB50RenderPayload(): B50RenderPayload {
        return {
            playerName: getUserDisplayName(player.value),
            playerSecondaryName: getPlayerSecondaryName(),
            playerRating: displayedRating.value || null,
            modeLabel: modeLabel.value ?? "B50",
            showDxScore: shared.appSettings.showDxScoreInB50,
            sd: b50SdCharts.value.map(toRenderChartPayload),
            dx: b50DxCharts.value.map(toRenderChartPayload),
        };
    }

    function toRenderChartPayload(chart: Chart): B50RenderChartPayload {
        const fitConstant = (chart.score as Record<string, unknown> | undefined)?.fitConstant;
        const ds =
            typeof fitConstant === "number" && !Number.isNaN(fitConstant)
                ? fitConstant
                : chart.info.constant;

        return {
            songId: chart.music.info.id,
            title: chart.music.info.title,
            type: chart.music.info.type,
            levelIndex: chart.info.grade,
            ds,
            achievements: chart.score?.achievements ?? null,
            fc: chart.score?.comboStatus ?? "",
            fs: chart.score?.syncStatus ?? "",
            rate: chart.score?.rankRate ?? "",
            ra: chart.score?.deluxeRating ?? 0,
            deluxeScore: chart.score?.deluxeScore,
            deluxeScoreMax: chart.info.deluxeScoreMax,
        };
    }

    function getPlayerSecondaryName(): string | null {
        if (!player.value?.remark) return null;
        return (
            player.value.data?.name ??
            player.value.divingFish?.name ??
            player.value.inGame?.name ??
            null
        );
    }

    function getRendererBaseUrl(): string {
        return (import.meta.env.VITE_TAKUMI_RENDERER_URL || "").replace(/\/+$/, "");
    }
</script>

<template>
    <div class="player-profile">
        <div v-if="isMusicDataLoading" class="songs-loading-container">
            <mdui-circular-progress></mdui-circular-progress>
            <div class="loading-text">正在更新谱面列表...</div>
        </div>

        <div v-else-if="pending" class="loading-message">
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
            <div v-if="hasDetailedData" class="mode-selector">
                <mdui-chip
                    :selected="isFitDiffMode"
                    @click="isFitDiffMode ? clearMode() : setMode('fit')"
                >
                    拟合 B50
                </mdui-chip>
                <mdui-chip
                    :selected="comboFilterMode === 'ap'"
                    @click="comboFilterMode === 'ap' ? clearMode() : setMode('ap')"
                >
                    AP50
                </mdui-chip>
                <mdui-chip
                    :selected="comboFilterMode === 'fc'"
                    @click="comboFilterMode === 'fc' ? clearMode() : setMode('fc')"
                >
                    FC50
                </mdui-chip>
                <mdui-chip
                    v-if="hasLastChangedAt"
                    :selected="isPc50Mode"
                    @click="isPc50Mode ? clearMode() : setMode('pc')"
                >
                    PC50
                </mdui-chip>
                <mdui-chip :selected="isNb50Mode" @click="isNb50Mode ? clearMode() : setMode('nb')">
                    牛逼 50
                </mdui-chip>
            </div>
            <ScoreSection
                v-if="b50SdCharts.length"
                title="旧版本成绩"
                :scores="b50SdCharts"
                :chartInfoDialog="chartInfoDialog"
                :showDxScoreNum="shared.appSettings.showDxScoreInB50"
            />
            <ScoreSection
                v-if="b50DxCharts.length"
                title="新版本成绩"
                :scores="b50DxCharts"
                :chartInfoDialog="chartInfoDialog"
                :showDxScoreNum="shared.appSettings.showDxScoreInB50"
            />
            <p
                v-if="!(b50SdCharts.length || b50DxCharts.length)"
                style="text-align: center; color: orange; margin-top: 20px"
            >
                未更新成绩或成绩更新失败，请到“用户”更新成绩
                <br />
                也可能是正在加载谱面信息，如已更新成绩请稍等
            </p>
        </div>

        <div v-else class="error-message">
            <h2>无法加载玩家数据</h2>
            <p>未能获取到有效的玩家信息，是不是还没有添加用户？</p>
        </div>
    </div>

    <ChartInfoDialog
        v-model:open="chartInfoDialog.open"
        :chart="chartInfoDialog.chart"
        :targetUserId="userId"
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

    .mode-selector {
        display: flex;
        gap: 8px;
        padding: 0 20px;
        margin-bottom: 16px;
        overflow-x: scroll;
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

    .songs-loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 50px 20px;
        text-align: center;
        gap: 16px;
    }

    .songs-loading-container .loading-text {
        font-size: 16px;
        color: var(--mdui-color-on-background);
        opacity: 0.7;
    }
</style>
