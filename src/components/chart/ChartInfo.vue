<template>
    <mdui-dialog
        ref="dialogRef"
        close-on-esc
        close-on-overlay-click
        :open="open"
        :fullscreen="isSmallScreen"
        @open="markDialogOpen"
        @close="markDialogClosed"
    >
        <mdui-top-app-bar slot="header">
            <mdui-button-icon
                :icon="isSmallScreen ? 'arrow_back' : 'close'"
                @click="dialogRef.open = false"
            ></mdui-button-icon>
            <mdui-button
                v-if="isSmallScreen"
                variant="text"
                class="icon-btn"
                @click="dialogRef.open = false"
                style="aspect-ratio: 1"
            >
                <img src="/favicon.ico" alt="icon" class="favicon-icon" />
            </mdui-button>
            <mdui-top-app-bar-title
                @click="copyToClipboard(chart?.music?.info.title || '')"
                style="cursor: pointer"
            >
                {{ chart?.music?.info.title || "" }}
            </mdui-top-app-bar-title>
        </mdui-top-app-bar>

        <img
            class="song-cover"
            :src="
                chart?.music
                    ? `https://www.diving-fish.com/covers/${'0'.repeat(5 - chart.music.id.toString().length)}${chart.music.id}.png`
                    : ''
            "
        />

        <div class="chip-container" v-if="chart?.music" center>
            <mdui-chip
                icon="music_note"
                @click="copyToClipboard(chart.music.info.id.toString() || '?')"
                style="cursor: pointer"
            >
                id{{ chart.music.info.id || "?" }}
            </mdui-chip>
            <mdui-chip
                icon="music_note"
                @click="copyToClipboard(chart.music.info.artist || '未知')"
                style="cursor: pointer"
            >
                {{ chart.music.info.artist || "未知" }}
            </mdui-chip>
            <mdui-chip icon="category" style="cursor: pointer">
                {{ chart.music.info.genre || "未知" }}
            </mdui-chip>
            <mdui-chip icon="access_time_filled" style="cursor: pointer">
                {{ chart.music.info.from || "未知" }}
            </mdui-chip>
            <mdui-chip icon="star" style="cursor: pointer">
                {{ chart.music.info.type || "未知" }}
            </mdui-chip>
        </div>

        <mdui-tabs :value="defaultExpandedValue" placement="top" full-width v-if="chart">
            <mdui-tab
                v-for="chartInfo of singleLevel ? [chart] : chart.music?.charts"
                :key="chartInfo.info.grade"
                :value="chartInfo.info.grade.toString()"
            >
                <span class="difficulty-constant">{{ chartInfo.info.constant }}</span>
                <div class="tab-header" slot="icon">
                    <span class="difficulty-badge" :class="`difficulty-${chartInfo.info.grade}`">
                        {{ ["BAS", "ADV", "EXP", "MAS", "ReM"][chartInfo.info.grade] }}
                    </span>
                </div>
            </mdui-tab>

            <mdui-tab-panel
                v-for="chartInfo of singleLevel ? [chart] : chart.music?.charts"
                :key="`panel-${chartInfo.info.grade}`"
                :value="chartInfo.info.grade.toString()"
                slot="panel"
            >
                <div class="tab-content">
                    <!-- 当前用户成绩信息 -->
                    <div class="score-summary" v-if="getCurrentChartScore(chartInfo)">
                        <!-- 第一行：rank图标和achievement百分比 -->
                        <div class="score-row-main">
                            <div class="rank-section">
                                <img
                                    v-if="getCurrentChartScore(chartInfo).rate"
                                    :src="`/icons/${getCurrentChartScore(chartInfo).rate.replace('p', 'plus')}.png`"
                                    class="rank-icon-large"
                                />
                            </div>
                            <div class="achievement-section">
                                <div class="achievement-percentage">
                                    {{ getCurrentChartScore(chartInfo).achievements?.toFixed(4) }}%
                                </div>
                            </div>
                        </div>

                        <!-- 第二行：fc/fs图标和rating -->
                        <div class="score-row-secondary">
                            <div class="score-badges">
                                <span class="badge-slot">
                                    <img
                                        v-if="getCurrentChartScore(chartInfo).fc"
                                        :src="`/icons/music_icon_${getCurrentChartScore(chartInfo).fc}.png`"
                                        class="badge-icon"
                                    />
                                    <span v-else class="badge-placeholder"></span>
                                </span>
                                <span class="badge-slot">
                                    <img
                                        v-if="getCurrentChartScore(chartInfo).fs"
                                        :src="`/icons/music_icon_${getCurrentChartScore(chartInfo).fs.replace('sd', 'dx')}.png`"
                                        class="badge-icon"
                                    />
                                    <span v-else class="badge-placeholder"></span>
                                </span>
                            </div>
                            <div class="rating-display" v-if="getCurrentChartScore(chartInfo).ra">
                                <div class="rating-value">
                                    {{ getCurrentChartScore(chartInfo).ra }}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 谱面基本信息 -->
                    <div class="chart-basic-info">
                        <div class="info-row">
                            <span class="info-label">谱师</span>
                            <span
                                class="info-value"
                                @click="copyToClipboard(chartInfo.info.charter)"
                                style="cursor: pointer"
                            >
                                {{ chartInfo.info.charter }}
                            </span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">项目位置</span>
                            <span class="info-value">{{ getCurrentChartPosition(chartInfo) }}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">音符分布</span>
                            <span class="info-value notes-breakdown">
                                <span class="note-type">TAP: {{ chartInfo.info.notes[0] }}</span>
                                <span class="note-type">HOLD: {{ chartInfo.info.notes[1] }}</span>
                                <span class="note-type">SLIDE: {{ chartInfo.info.notes[2] }}</span>
                                <span class="note-type">BREAK: {{ chartInfo.info.notes[3] }}</span>
                                <span class="note-total">
                                    总计: {{ chartInfo.info.notes.reduce((a, b) => a + b, 0) }}
                                </span>
                            </span>
                        </div>
                    </div>

                    <!-- Rating 阶段 -->
                    <div
                        style="
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            margin-bottom: 0;
                            margin-top: 1rem;
                        "
                    >
                        <h3 style="margin-bottom: 0">Rating 阶段</h3>
                        <mdui-button-icon
                            v-if="getChartRaTable(chartInfo).length > 3"
                            :icon="
                                expandedCharts.has(chartInfo.info.grade)
                                    ? 'expand_less'
                                    : 'expand_more'
                            "
                            @click="toggleChartExpanded(chartInfo.info.grade)"
                        ></mdui-button-icon>
                    </div>
                    <mdui-list>
                        <mdui-list-item
                            v-for="i of getDisplayedChartRaTable(chartInfo)"
                            :key="i.achievements"
                            nonclickable
                        >
                            <div class="list-container">
                                <div class="list-title">
                                    {{ RANK_RATE_DISPLAY_NAMES[i.rank] }}
                                    <span class="description">
                                        {{ i.achievements.toFixed(4) }}%
                                    </span>
                                </div>
                                <span
                                    v-if="
                                        getCurrentChartRa(chartInfo) !== null &&
                                        i.rating > (getCurrentChartRa(chartInfo) || 0)
                                    "
                                >
                                    +{{ i.rating - (getCurrentChartRa(chartInfo) || 0) }}
                                </span>
                                {{ i.rating }}
                            </div>
                        </mdui-list-item>
                    </mdui-list>

                    <div v-if="getChartFriendsScores(chartInfo).length > 1" class="friends-section">
                        <h3>好友排名</h3>
                        <mdui-list>
                            <mdui-list-item
                                v-for="(f, idx) in getChartFriendsScores(chartInfo)"
                                :key="f.name"
                                nonclickable
                                :active="f.name === selfName"
                                rounded
                            >
                                <div class="friend-score-row">
                                    <span class="friend-rank">
                                        {{ getRanks(getChartFriendsScores(chartInfo))[idx] }}
                                    </span>
                                    <span class="friend-name">{{ f.name }}</span>
                                    <span class="friend-achievement">
                                        {{
                                            typeof f.achievements === "number"
                                                ? `${f.achievements.toFixed(4)}%`
                                                : f.played
                                                  ? "0.0000%"
                                                  : "-"
                                        }}
                                    </span>
                                    <span class="friend-fc">
                                        <img
                                            v-if="f.fc"
                                            :src="`/icons/music_icon_${f.fc}.png`"
                                            class="icon"
                                        />
                                        <span v-else class="icon-placeholder"></span>
                                    </span>
                                    <span class="friend-fs">
                                        <img
                                            v-if="f.fs"
                                            :src="`/icons/music_icon_${f.fs.replace('sd', 'dx')}.png`"
                                            class="icon"
                                        />
                                        <span v-else class="icon-placeholder"></span>
                                    </span>
                                </div>
                            </mdui-list-item>
                        </mdui-list>
                    </div>
                </div>
            </mdui-tab-panel>
        </mdui-tabs>

        <h3 v-if="chart?.music && chart?.music.info.aliases && chart.music.info.aliases.length">
            别名
        </h3>
        <div
            class="chip-container"
            v-if="chart?.music && chart?.music.info.aliases && chart.music.info.aliases.length"
        >
            <mdui-chip
                v-for="alias in chart.music.info.aliases"
                :key="alias"
                @click="copyToClipboard(alias)"
                style="cursor: pointer"
            >
                {{ alias }}
            </mdui-chip>
        </div>
    </mdui-dialog>
</template>

<script setup lang="ts">
    import type { Chart } from "@/types/music";
    import { getDetailedRatingsByDs } from "@/utils/rating";
    import { RANK_RATE_DISPLAY_NAMES } from "@/types/maiTypes";
    import { defineProps, watch, nextTick, ref, onMounted, onUnmounted } from "vue";
    import { markDialogOpen, markDialogClosed } from "@/components/router.vue";
    import { useShared } from "@/utils/shared";
    import { snackbar } from "mdui";
    import { getChartPositionFromCache } from "@/utils/chartPosition";

    const shared = useShared();

    const props = defineProps<{
        open: boolean;
        chart: Chart | null;
        singleLevel?: boolean;
    }>();
    const dialogRef = ref<any>(null);
    const friendsScores = ref<
        {
            name: string;
            achievements?: number;
            ra?: number;
            rate?: string;
            fc?: string;
            fs?: string;
            played: boolean;
        }[]
    >([]);
    const selfName = ref("");
    const isRatingExpanded = ref(false);
    const expandedCharts = ref<Set<number>>(new Set());
    const defaultExpandedValue = ref("0");
    const isSmallScreen = ref(false);

    // 存储每个难度对应的好友成绩
    const chartFriendsScoresMap = ref<Map<number, any[]>>(new Map());
    // 存储每个难度对应的项目位置（从缓存中获取）
    const chartPositionMap = ref<Map<number, string>>(new Map());

    // 检查屏幕尺寸
    function checkScreenSize() {
        isSmallScreen.value = window.innerWidth < 560;
    }

    // 处理窗口大小变化
    function handleResize() {
        checkScreenSize();
    }

    // 生命周期钩子
    onMounted(() => {
        checkScreenSize();
        window.addEventListener("resize", handleResize);
    });

    onUnmounted(() => {
        window.removeEventListener("resize", handleResize);
    });

    watch(
        () => props.open,
        async () => {
            await nextTick();
            if (dialogRef.value) {
                dialogRef.value.open = true;
            }
            friendsScores.value = [];
            selfName.value = "";
            isRatingExpanded.value = false;
            expandedCharts.value.clear();
            chartFriendsScoresMap.value.clear();

            if (!props.chart?.music?.charts) return;

            // 设置默认展开对应难度
            defaultExpandedValue.value = props.chart.info.grade?.toString() || "0";

            if (shared.users.length > 0) {
                selfName.value = String(shared.users[0].data.name || "");
            }

            // 从缓存中加载项目位置
            await loadChartPositionsFromCache();

            // 为每个难度生成好友成绩数据
            props.chart.music.charts.forEach(chartInfo => {
                const chartFriends: any[] = [];

                shared.users.forEach(user => {
                    const uname = String(
                        user.divingFish?.name || user.inGame?.name || user.inGame?.id || ""
                    );
                    if (!uname) return;

                    const key = `${props.chart!.music.id}-${chartInfo.info.grade}`;
                    const detail = user.data?.detailed?.[key];

                    if (detail) {
                        chartFriends.push({
                            name: uname,
                            achievements: detail.achievements,
                            ra: detail.ra,
                            rate: detail.rate,
                            fc: detail.fc,
                            fs: detail.fs,
                            played: true,
                        });
                    } else {
                        chartFriends.push({
                            name: uname,
                            achievements: undefined,
                            ra: undefined,
                            rate: undefined,
                            fc: undefined,
                            fs: undefined,
                            played: false,
                        });
                    }
                });

                // 排名：已游玩按成绩降序，未游玩排最后
                chartFriends.sort((a, b) => {
                    if (a.played && b.played) {
                        return (b.achievements ?? 0) - (a.achievements ?? 0);
                    } else if (a.played) {
                        return -1;
                    } else if (b.played) {
                        return 1;
                    } else {
                        return 0;
                    }
                });

                chartFriendsScoresMap.value.set(chartInfo.info.grade, chartFriends);
            });
        }
    );

    // 计算排名，处理并列
    function getRanks(scores: { achievements?: number; played: boolean }[]) {
        let lastScore: number | undefined = undefined;
        let lastRank = 1;
        let playedCount = 0;
        return scores.map(s => {
            if (!s.played) return "-";
            if (typeof s.achievements !== "number") return "-";
            playedCount++;
            if (lastScore === s.achievements) {
                return `#${lastRank}`;
            } else {
                lastRank = playedCount;
                lastScore = s.achievements;
                return `#${playedCount}`;
            }
        });
    }

    function copyToClipboard(text: string) {
        navigator.clipboard.writeText(text);
        snackbar({ message: `已复制：${text}`, autoCloseDelay: 1000 });
    }

    // 从缓存中加载项目位置
    async function loadChartPositionsFromCache() {
        if (!props.chart?.music?.charts) return;

        // 为每个难度加载项目位置
        for (const chartInfo of props.chart.music.charts) {
            try {
                const position = await getChartPositionFromCache(chartInfo, chartInfo.info.level);
                chartPositionMap.value.set(chartInfo.info.grade, position);
            } catch (error) {
                console.error(
                    `Failed to get position for chart ${chartInfo.music.id}-${chartInfo.info.grade}:`,
                    error
                );
                chartPositionMap.value.set(chartInfo.info.grade, "-");
            }
        }
    }

    // 获取指定难度的 Rating 阶段表
    function getChartRaTable(chartInfo: Chart) {
        if (!props.chart) return [];
        const achievements = getCurrentChartAchievements(chartInfo);
        return getDetailedRatingsByDs(chartInfo.info.constant, achievements);
    }

    // 获取指定难度的显示 Rating 阶段表
    function getDisplayedChartRaTable(chartInfo: Chart) {
        const raTable = getChartRaTable(chartInfo);
        if (raTable.length <= 3 || expandedCharts.value.has(chartInfo.info.grade)) {
            return raTable;
        }
        // 只显示第一个和最后两个
        return [raTable[0], ...raTable.slice(-2)];
    }

    // 切换难度展开状态
    function toggleChartExpanded(grade: number) {
        if (expandedCharts.value.has(grade)) {
            expandedCharts.value.delete(grade);
        } else {
            expandedCharts.value.add(grade);
        }
    }

    // 获取当前用户在指定难度的Ra值
    function getCurrentChartRa(chartInfo: Chart): number | null {
        if (!props.chart) return null;
        const chartScores = chartFriendsScoresMap.value.get(chartInfo.info.grade) || [];
        const currentUserScores = chartScores.find(f => f.name === selfName.value);
        return currentUserScores?.ra ?? null;
    }

    // 获取当前用户在指定难度的达成率
    function getCurrentChartAchievements(chartInfo: Chart): number {
        if (!props.chart) return 0;
        const chartScores = chartFriendsScoresMap.value.get(chartInfo.info.grade) || [];
        const currentUserScores = chartScores.find(f => f.name === selfName.value);
        return currentUserScores?.achievements ?? 0;
    }

    // 获取指定难度的好友成绩
    function getChartFriendsScores(chartInfo: Chart) {
        return chartFriendsScoresMap.value.get(chartInfo.info.grade) || [];
    }

    // 获取当前用户在指定难度的成绩信息
    function getCurrentChartScore(chartInfo: Chart) {
        if (!props.chart) return null;
        const chartScores = chartFriendsScoresMap.value.get(chartInfo.info.grade) || [];
        const currentUserScores = chartScores.find(f => f.name === selfName.value);
        return currentUserScores && currentUserScores.played ? currentUserScores : null;
    }

    // 获取当前谱面在对应难度的项目位置
    function getCurrentChartPosition(chartInfo: Chart): string {
        if (!props.chart) return "-";

        // 从缓存的Map中获取项目位置
        return chartPositionMap.value.get(chartInfo.info.grade) || "-";
    }
</script>

<style scoped>
    .icon-btn {
        height: 40px;
        min-width: 40px;
        padding: 0 4px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .favicon-icon {
        width: 24px;
        height: 24px;
        display: block;
    }

    .song-cover {
        width: 100%;
        height: auto;
        aspect-ratio: 1 / 1;
        margin: 0 auto;
        display: block;
        max-width: 300px;

        background: image("https://www.diving-fish.com/covers/00000.png");
    }

    .chip-container {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 16px 1.5rem;
    }
    .chip-container[center] {
        justify-content: center;
        padding: 16px 0 !important;
    }

    h3 {
        margin-bottom: 0;
    }
    .list-container {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 1.5rem 0.5rem 1rem;
    }
    .list-title {
        display: flex;
        flex-direction: column;
    }
    .description {
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: var(--mdui-typescale-body-medium-size);
        font-weight: var(--mdui-typescale-body-medium-weight);
        letter-spacing: var(--mdui-typescale-body-medium-tracking);
        line-height: var(--mdui-typescale-body-medium-line-height);
    }
    .friends-section {
        margin-top: 1rem;
    }
    .friend-score-row {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        padding: 0.5rem 1.5rem 0.5rem 1rem;
        gap: 1rem;
    }

    @media (max-width: 480px) {
        .friend-score-row {
            padding: 0.5rem 1rem 0.5rem 0.75rem;
            gap: 0.5rem;
        }
    }

    .friend-rank {
        min-width: 2.5em;
        text-align: left;
        flex-shrink: 0;
    }

    @media (max-width: 480px) {
        .friend-rank {
            min-width: 2em;
            font-size: 0.9rem;
        }
    }

    .friend-name {
        font-weight: bold;
        min-width: 5em;
        text-align: left;
        flex-shrink: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    @media (max-width: 480px) {
        .friend-name {
            min-width: 3em;
            max-width: 4em;
            font-size: 0.9rem;
        }
    }

    .friend-achievement {
        min-width: 6em;
        text-align: right;
        flex: 1;
        font-family: monospace;
    }

    @media (max-width: 480px) {
        .friend-achievement {
            min-width: 4.5em;
            font-size: 0.85rem;
        }
    }

    .friend-fc,
    .friend-fs {
        min-width: 2.5em;
        text-align: center;
        flex-shrink: 0;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    @media (max-width: 480px) {
        .friend-fc,
        .friend-fs {
            min-width: 2em;
        }
    }

    .icon {
        width: 24px;
        height: 24px;
        object-fit: contain;
    }

    @media (max-width: 480px) {
        .icon {
            width: 20px;
            height: 20px;
        }
    }

    .icon-placeholder {
        width: 24px;
        height: 24px;
        display: inline-block;
    }

    @media (max-width: 480px) {
        .icon-placeholder {
            width: 20px;
            height: 20px;
        }
    }
    .tab-header {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .tab-content {
        padding: 1rem 0;
    }

    .score-summary {
        background: linear-gradient(
            135deg,
            rgba(var(--mdui-color-primary), 0.05),
            rgba(var(--mdui-color-secondary), 0.05)
        );
        border: 1px solid rgba(var(--mdui-color-outline), 0.1);
        border-radius: 16px;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    @media (max-width: 480px) {
        .score-summary {
            padding: 1rem;
            margin-bottom: 1rem;
            border-radius: 12px;
        }
    }

    @media (max-width: 360px) {
        .score-summary {
            padding: 0.75rem;
        }
    }

    .score-row-main {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.75rem;
    }

    .score-row-secondary {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    @media (max-width: 480px) {
        .score-row-main {
            margin-bottom: 0.5rem;
        }
    }

    .rank-section {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: flex-start;
    }

    .rank-icon-large {
        width: 64px;
        height: 32px;
        object-fit: cover;
        object-position: center;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
    }

    @media (max-width: 480px) {
        .rank-icon-large {
            width: 48px;
            height: 24px;
        }
    }

    .achievement-section {
        flex: 1;
        text-align: right;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: flex-end;
    }

    .rating-display {
        display: flex;
        align-items: center;
        justify-content: flex-end;
    }

    .rating-display .rating-value {
        font-size: 0.9rem;
        font-weight: 600;
        color: rgb(var(--mdui-color-tertiary));
        background: rgba(var(--mdui-color-tertiary), 0.15);
        padding: 0.2rem 0.5rem;
        border-radius: 6px;
        border: 1px solid rgba(var(--mdui-color-tertiary), 0.3);
        line-height: 1;
        box-shadow: 0 1px 2px rgba(var(--mdui-color-tertiary), 0.2);
    }

    @media (max-width: 480px) {
        .rating-display .rating-value {
            font-size: 0.8rem;
            padding: 0.15rem 0.4rem;
        }
    }

    .achievement-percentage {
        font-size: 2rem;
        font-weight: 700;
        color: rgb(var(--mdui-color-primary));
        line-height: 1;
        margin-bottom: 0.25rem;
        background: linear-gradient(
            135deg,
            rgb(var(--mdui-color-primary)),
            rgb(var(--mdui-color-secondary))
        );
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        word-break: break-all;
    }

    @media (max-width: 480px) {
        .achievement-percentage {
            font-size: 1.5rem;
        }
    }

    @media (max-width: 360px) {
        .achievement-percentage {
            font-size: 1.25rem;
        }
    }

    .score-badges {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
    }

    .badge-slot {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 22px;
        min-height: 22px;
    }

    .badge-icon {
        width: 22px;
        height: 22px;
        object-fit: contain;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
    }

    .badge-placeholder {
        width: 22px;
        height: 22px;
        display: inline-block;
    }

    @media (max-width: 480px) {
        .score-badges {
            gap: 4px;
        }

        .badge-slot {
            min-width: 18px;
            min-height: 18px;
        }

        .badge-icon {
            width: 18px;
            height: 18px;
        }

        .badge-placeholder {
            width: 18px;
            height: 18px;
        }
    }

    @media (max-width: 360px) {
        .badge-slot {
            min-width: 16px;
            min-height: 16px;
        }

        .badge-icon {
            width: 16px;
            height: 16px;
        }

        .badge-placeholder {
            width: 16px;
            height: 16px;
        }
    }

    /* 移除折叠面板相关样式，保留通用样式 */
    .collapse-header {
        display: flex;
        align-items: center;
        font-weight: 500;
        font-size: 1rem;
    }
    .collapse-content {
        padding: 0 1rem 1rem 1rem;
    }

    mdui-tabs {
        --mdui-color-surface: #6cf;
    }
    /* 难度标识样式 */
    .difficulty-badge {
        padding: 2px 12px;
        border-radius: 16px;
        font-weight: 600;
        font-size: 0.75rem;
        color: white;
        text-align: center;
        display: inline-block;
    }
    .difficulty-constant {
        font-size: 1rem;

        margin-top: 0.25rem;
        margin-bottom: -0.1rem;
    }

    .difficulty-0 {
        background: linear-gradient(45deg, #4caf50, #66bb6a);
    }

    .difficulty-1 {
        background: linear-gradient(45deg, #ff9800, #ffb74d);
    }

    .difficulty-2 {
        background: linear-gradient(45deg, #f44336, #ef5350);
    }

    .difficulty-3 {
        background: linear-gradient(45deg, #9c27b0, #ba68c8);
    }

    .difficulty-4 {
        background: linear-gradient(45deg, #ffffff, #f5f5f5);
        color: #333;
        border: 2px solid #9c27b0;
    }

    .level-info {
        font-weight: 600;
        margin-right: 12px;
        color: rgb(var(--mdui-color-primary));
    }

    .notes-info {
        font-size: 0.875rem;
        color: rgb(var(--mdui-color-on-surface-variant));
        margin-left: auto;
    }

    /* 谱面基本信息样式 */
    .chart-basic-info {
        background: rgba(var(--mdui-color-surface-variant), 0.1);
        border-radius: 8px;
        padding: 1rem;
        margin-bottom: 1rem;
    }

    .info-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
    }

    .info-row:last-child {
        margin-bottom: 0;
    }

    .info-label {
        font-weight: 600;
        color: rgb(var(--mdui-color-on-surface));
        min-width: 80px;
    }

    .info-value {
        flex: 1;
        text-align: right;
        color: rgb(var(--mdui-color-on-surface-variant));
    }

    .info-value.notes-breakdown {
        text-align: right;
    }

    .note-type {
        display: block;
        font-size: 0.875rem;
        margin-bottom: 2px;
    }

    .note-total {
        display: block;
        font-weight: 600;
        color: rgb(var(--mdui-color-primary));
        margin-top: 4px;
        padding-top: 4px;
        border-top: 1px solid rgba(var(--mdui-color-outline), 0.3);
    }

    /* 移除折叠头部布局样式，保留需要的通用样式 */
    .header-left {
        display: flex;
        align-items: center;
        flex: 1;
    }

    .header-right {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
    }

    .combo-icons {
        display: flex;
        align-items: center;
        gap: 2px;
    }

    .mini-icon {
        width: 16px;
        height: 16px;
    }

    .notes-info {
        font-size: 0.75rem;
        color: rgb(var(--mdui-color-on-surface-variant));
        opacity: 0.8;
    }
</style>
