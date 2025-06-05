<template>
    <mdui-dialog ref="dialogRef" close-on-esc close-on-overlay-click :open="open" v-if="chart">
        <mdui-top-app-bar slot="header">
            <mdui-button-icon icon="close" @click="dialogRef.open = false"></mdui-button-icon>
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
            <mdui-chip icon="access_time_filled" style="cursor: pointer">
                {{ chart.music.info.genre || "未知" }}
            </mdui-chip>
            <mdui-chip icon="star" style="cursor: pointer">
                {{ chart.music.info.type || "未知" }}
            </mdui-chip>
        </div>

        <mdui-collapse accordion :value="defaultExpandedValue">
            <mdui-collapse-item
                v-for="chartInfo of singleLevel ? [chart] : chart.music?.charts"
                :key="chartInfo.info.grade"
                :value="chartInfo.info.grade.toString()"
            >
                <mdui-list-item slot="header">
                    <div class="collapse-header">
                        <div class="header-left">
                            <span
                                class="difficulty-badge"
                                :class="`difficulty-${chartInfo.info.grade}`"
                            >
                                {{
                                    ["BASIC", "ADVANCED", "EXPERT", "MASTER", "Re:MASTER"][
                                        chartInfo.info.grade
                                    ]
                                }}
                            </span>
                            <span class="level-info">
                                {{ chartInfo.info.constant }}
                            </span>
                        </div>
                        <div class="header-right">
                            <div class="score-info" v-if="getCurrentChartScore(chartInfo)">
                                <img
                                    v-if="getCurrentChartScore(chartInfo).rate"
                                    :src="`/icons/${getCurrentChartScore(chartInfo).rate.replace('p', 'plus')}.png`"
                                    class="rank-icon"
                                />
                                <span class="achievement">
                                    {{ getCurrentChartScore(chartInfo).achievements?.toFixed(4) }}%
                                </span>
                                <span class="rating" v-if="getCurrentChartScore(chartInfo).ra">
                                    {{ getCurrentChartScore(chartInfo).ra }}
                                </span>
                                <span class="score-badges">
                                    <img
                                        v-if="getCurrentChartScore(chartInfo).fc"
                                        :src="`/icons/music_icon_${getCurrentChartScore(chartInfo).fc}.png`"
                                        class="mini-icon"
                                    />
                                    <img
                                        v-if="getCurrentChartScore(chartInfo).fs"
                                        :src="`/icons/music_icon_${getCurrentChartScore(chartInfo).fs.replace('sd', 'dx')}.png`"
                                        class="mini-icon"
                                    />
                                </span>
                            </div>
                        </div>
                    </div>
                </mdui-list-item>

                <div class="collapse-content">
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
                                                : ""
                                        }}
                                    </span>
                                    <span class="friend-fc" v-if="f.fc">
                                        <img :src="`/icons/music_icon_${f.fc}.png`" class="icon" />
                                    </span>
                                    <span class="friend-fs" v-if="f.fs">
                                        <img :src="`/icons/music_icon_${f.fs.replace('sd', 'dx')}.png`" class="icon" />
                                    </span>
                                </div>
                            </mdui-list-item>
                        </mdui-list>
                    </div>
                </div>
            </mdui-collapse-item>
        </mdui-collapse>

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
    import { defineProps, watch, nextTick, ref } from "vue";
    import localForage from "localforage";
    import type { User } from "../../types/user";
    import { snackbar } from "mdui";
    import { getChartPositionFromCache } from "@/utils/chartPosition";

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

    // 存储每个难度对应的好友成绩
    const chartFriendsScoresMap = ref<Map<number, any[]>>(new Map());
    // 存储每个难度对应的项目位置（从缓存中获取）
    const chartPositionMap = ref<Map<number, string>>(new Map());

    watch(
        () => props.open,
        async () => {
            await nextTick();
            if (dialogRef.value) {
                dialogRef.value.open = true;
            }
            console.log(props.chart); // REMEMBER TO REMOVE AFTER DEVELOPING
            friendsScores.value = [];
            selfName.value = "";
            isRatingExpanded.value = false;
            expandedCharts.value.clear();
            chartFriendsScoresMap.value.clear();

            if (!props.chart?.music?.charts) return;

            // 设置默认展开对应难度
            defaultExpandedValue.value = props.chart.info.grade?.toString() || "0";

            const users: User[] = (await localForage.getItem("users")) || [];
            // selfName为用户列表第一个用户
            if (users.length > 0) {
                selfName.value = String(
                    users[0].divingFish?.name || users[0].inGame?.name || users[0].inGame?.id || ""
                );
            }

            // 从缓存中加载项目位置
            await loadChartPositionsFromCache();

            // 为每个难度生成好友成绩数据
            props.chart.music.charts.forEach(chartInfo => {
                const chartFriends: any[] = [];

                users.forEach(user => {
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
    .song-cover {
        width: 100%;
        height: auto;
        aspect-ratio: 1 / 1;
        margin: 0 auto;
        display: block;

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
        gap: 1.5rem;
    }
    .friend-rank {
        min-width: 2.5em;
        text-align: left;
    }
    .friend-name {
        font-weight: bold;
        min-width: 5em;
        text-align: left;
    }
    .friend-achievement {
        min-width: 5em;
        text-align: left;
    }
    .friend-fc {
        min-width: 2.5em;
        text-align: left;
    }
    .icon {
        width: 24px;
        height: 24px;
        margin-left: 0.5rem;
    }
    .collapse-header {
        display: flex;
        align-items: center;
        font-weight: 500;
        font-size: 1rem;
    }
    .collapse-content {
        padding: 0 1rem 1rem 1rem;
    }

    /* 难度标识样式 */
    .difficulty-badge {
        padding: 4px 12px;
        border-radius: 16px;
        font-weight: 600;
        font-size: 0.75rem;
        color: white;
        margin-right: 12px;
        min-width: 80px;
        text-align: center;
        display: inline-block;
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

    .collapse-header {
        width: 100%;
        gap: 0;
    }

    .friend-fs {
        min-width: 2.5em;
        text-align: left;
    }

    /* 折叠头部布局样式 */
    .collapse-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
    }

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

    .score-info {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.875rem;
    }

    .achievement {
        font-weight: 600;
        color: rgb(var(--mdui-color-primary));
    }

    .rating {
        font-weight: 600;
        color: rgb(var(--mdui-color-tertiary));
        background: rgba(var(--mdui-color-tertiary), 0.1);
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.75rem;
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

    .score-badges {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .rank-icon {
        width: 32px;
        height: 32px;
        object-fit: contain;
    }
</style>
