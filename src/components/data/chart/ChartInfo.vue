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
                <img src="/favicon.ico" alt="icon" class="favicon-icon favicon" />
            </mdui-button>
            <mdui-top-app-bar-title
                @click="copyTextToClipboard(chart?.music?.info.title || '')"
                style="cursor: pointer"
            >
                {{ chart?.music?.info.title || "" }}
            </mdui-top-app-bar-title>
        </mdui-top-app-bar>

        <img
            class="song-cover"
            :src="chart?.music ? getCoverURL(chart.music.id) : ''"
            crossorigin="anonymous"
        />

        <div class="chip-container" v-if="chart?.music" center>
            <mdui-chip
                icon="music_note"
                @click="copyTextToClipboard(chart.music.info.id.toString() || '?')"
                style="cursor: pointer"
            >
                id{{ chart.music.info.id || "?" }}
            </mdui-chip>
            <mdui-chip
                icon="music_note"
                @click="copyTextToClipboard(chart.music.info.artist || '未知')"
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

        <mdui-tabs :value="expandedValue.toString()" placement="top" full-width v-if="chart">
            <mdui-tab
                v-for="chartInfo of singleLevel ? [chart] : chart.music?.charts"
                :key="chartInfo.info.grade"
                :value="chartInfo.info.grade.toString()"
                @click="expandedValue = chartInfo.info.grade"
            >
                <span class="difficulty-constant">{{ chartInfo.info.constant }}</span>
                <div class="tab-header" slot="icon">
                    <span class="difficulty-badge" :class="`difficulty-${chartInfo.info.grade}`">
                        {{ ["BAS", "ADV", "EXP", "MAS", "ReM"][chartInfo.info.grade] }}
                    </span>
                </div>
            </mdui-tab>
        </mdui-tabs>

        <div class="tab-content" v-if="currentChart">
            <!-- 当前用户成绩信息 -->
            <div class="score-summary" v-if="currentChartScore && currentChartScore.rankRate">
                <!-- 第一行：rank图标和achievement百分比 -->
                <div class="score-row-main">
                    <div class="rank-section">
                        <img
                            v-if="currentChartScore.rankRate"
                            :src="`/icons/${currentChartScore.rankRate.replace('p', 'plus')}.png`"
                            class="rank-icon-large"
                        />
                    </div>
                    <div class="achievement-section">
                        <div class="achievement-percentage">
                            {{ currentChartScore.achievements?.toFixed(4) }}%
                        </div>
                    </div>
                </div>

                <!-- 第二行：fc/fs图标和rating -->
                <div class="score-row-secondary">
                    <div class="score-badges">
                        <span class="badge-slot">
                            <img
                                v-if="currentChartScore.comboStatus"
                                :src="`/icons/music_icon_${currentChartScore.comboStatus}.png`"
                                class="badge-icon"
                            />
                            <span v-else class="badge-placeholder"></span>
                        </span>
                        <span class="badge-slot">
                            <img
                                v-if="currentChartScore.syncStatus"
                                :src="`/icons/music_icon_${currentChartScore.syncStatus.replace('sd', 'dx')}.png`"
                                class="badge-icon"
                            />
                            <span v-else class="badge-placeholder"></span>
                        </span>
                    </div>
                    <div class="rating-display" v-if="currentChartScore.deluxeRating">
                        <div class="rating-score-display">
                            <div class="dx-score-value">{{ currentChartScore.playCount }} 次</div>
                            <div class="dx-score-value">
                                {{ currentChartScore.deluxeRating }}
                            </div>
                            <div class="dx-score-value">
                                {{ currentChartScore.deluxeScore }} /
                                {{ currentChart.info.deluxeScoreMax }}
                            </div>
                        </div>
                        <div class="dx-score-stars">
                            <img
                                v-if="dxScoreStarsCount > 0"
                                :src="dxScoreStarsImg"
                                class="dx-stars-img"
                                v-for="i in dxScoreStarsCount"
                                :key="i"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div class="chart-search-urls">
                <mdui-chip
                    v-for="site in getChartSearchUrls(currentChart)"
                    :href="site.url"
                    target="_blank"
                    :icon="site.icon"
                >
                    {{ site.name }}
                </mdui-chip>
            </div>

            <!-- 谱面基本信息 -->
            <div class="chart-basic-info">
                <div class="info-row">
                    <span class="info-label">谱师</span>
                    <span
                        class="info-value"
                        @click="copyTextToClipboard(currentChart.info.charter)"
                        style="cursor: pointer"
                    >
                        {{ currentChart.info.charter }}
                    </span>
                </div>
                <div class="info-row">
                    <span class="info-label">拟合定数</span>
                    <span
                        class="info-value"
                        @click="currentChart.info.stat && showChartStats(currentChart.info.stat)"
                        style="cursor: pointer"
                    >
                        {{
                            currentChart.info.stat
                                ? currentChart.info.stat.fit_diff.toFixed(4)
                                : "蛤 怎么没数据"
                        }}
                    </span>
                </div>
                <!-- <div class="info-row" v-if="currentChart.score?.playCount">
                    <span class="info-label">游玩次数</span>
                    <span class="info-value">{{ currentChart.score.playCount }}</span>
                </div> -->
                <div class="info-row">
                    <span class="info-label">项目位置</span>
                    <span class="info-value">{{ getCurrentChartPosition(currentChart) }}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">
                        Note 统计
                        <br />
                        <br />

                        <mdui-button
                            variant="text"
                            icon="calculate"
                            @click="showScoreCalculator = true"
                        >
                            容错
                        </mdui-button>
                        <br />
                        <mdui-dropdown stay-open-on-click @open.stop @close.stop>
                            <mdui-button slot="trigger" variant="text" icon="playlist_add">
                                收藏
                            </mdui-button>
                            <mdui-menu>
                                <mdui-menu-item
                                    v-for="fav in shared.favorites"
                                    :key="fav.name"
                                    :value="fav.name"
                                    @click="toggleFavorite(fav, currentChart)"
                                    :style="{
                                        backgroundColor: fav.charts.some(
                                            ({ i, d }) =>
                                                i === currentChart.music.id && d === expandedValue
                                        )
                                            ? 'rgba(var(--mdui-color-primary),12%)'
                                            : '',
                                    }"
                                    :icon="
                                        fav.charts.some(
                                            ({ i, d }) =>
                                                i === currentChart.music.id && d === expandedValue
                                        )
                                            ? 'check'
                                            : ''
                                    "
                                >
                                    {{ fav.name }}
                                </mdui-menu-item>
                                <mdui-menu-item icon="add" @click="newFavList">新增</mdui-menu-item>
                            </mdui-menu>
                        </mdui-dropdown>
                    </span>
                    <span class="info-value notes-breakdown">
                        <span class="note-type">TAP: {{ noteCounts.tap }}</span>
                        <span class="note-type">HOLD: {{ noteCounts.hold }}</span>
                        <span class="note-type">SLIDE: {{ noteCounts.slide }}</span>
                        <span class="note-type" v-if="noteCounts.hasTouch">
                            TOUCH: {{ noteCounts.touch }}
                        </span>
                        <span class="note-type">BREAK: {{ noteCounts.break }}</span>
                        <span class="note-total">总计: {{ noteCounts.total }}</span>
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
                <mdui-select
                    v-model="ratingDisplayMode"
                    style="width: 5em; --mdui-comp-select-menu-container-shape: 8px"
                    @change="handleDisplayModeChange"
                >
                    <mdui-menu-item value="简洁">简洁</mdui-menu-item>
                    <mdui-menu-item value="吃分" v-if="chartRatingTables.filtered.length > 3">
                        吃分
                    </mdui-menu-item>
                    <mdui-menu-item value="完整">全部</mdui-menu-item>
                </mdui-select>
            </div>
            <mdui-list>
                <mdui-list-item
                    v-for="i of getDisplayedChartRaTable()"
                    :key="i.achievements"
                    nonclickable
                >
                    <div class="list-container">
                        <div class="list-title">
                            {{ RANK_RATE_DISPLAY_NAMES[i.rank] }}
                            <span class="description">{{ i.achievements.toFixed(4) }}%</span>
                        </div>
                        <span
                            v-if="
                                currentUserLowestRaInChartOrSection &&
                                i.rating > (currentUserLowestRaInChartOrSection || 0)
                            "
                        >
                            +{{ i.rating - (currentUserLowestRaInChartOrSection || 0) }}
                        </span>
                        {{ i.rating }}
                    </div>
                </mdui-list-item>
            </mdui-list>

            <div v-if="chartFriendsScores.length > 1" class="friends-section">
                <h3>好友排名</h3>
                <mdui-list>
                    <mdui-list-item
                        v-for="(f, idx) in chartFriendsScores"
                        :key="f.name"
                        nonclickable
                        :active="f.user === currentUser"
                        rounded
                    >
                        <div class="friend-score-row">
                            <span class="friend-rank">
                                {{ getRanks(chartFriendsScores)[idx] }}
                            </span>
                            <span class="friend-name">
                                {{ getUserDisplayName(f.user) }}
                            </span>
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
                @click="copyTextToClipboard(alias)"
                style="cursor: pointer"
            >
                {{ alias }}
            </mdui-chip>
        </div>
    </mdui-dialog>

    <ScoreCalculatorDialog
        :open="showScoreCalculator"
        :chart="currentChart"
        @update:open="showScoreCalculator = $event"
        :copyTextToClipboard="copyTextToClipboard"
    />
</template>

<script setup lang="ts">
    import type { Chart } from "@/components/data/music/type";
    import { getDetailedRatingsByConstant } from "@/components/data/chart/rating";
    import { RANK_RATE_DISPLAY_NAMES } from "@/components/data/maiTypes";
    import { defineProps, watch, nextTick, ref, onMounted, onUnmounted, computed } from "vue";
    import { markDialogOpen, markDialogClosed } from "@/components/app/router.vue";
    import { useShared } from "@/components/app/shared";
    import { prompt, dialog } from "mdui";
    import { copyTextToClipboard } from "@/components/app/utils";
    import { getChartPositionFromCache } from "@/components/data/chart/chartPosition";
    import type { FavoriteList, FavoriteChart } from "@/components/data/user/type";
    import type { ChartStats } from "@/components/integrations/diving-fish/type";
    import { chartScoreFromDF } from "@/components/integrations/diving-fish";
    import { type User, getUserDisplayName } from "@/components/data/user/type";
    import { getCoverURL } from "@/components/integrations/assets";
    import { getChartSearchUrls } from "./getSearchUrls";
    import ScoreCalculatorDialog from "./ScoreCalculatorDialog.vue";

    const shared = useShared();

    const props = defineProps<{
        open: boolean;
        chart: Chart | null;
        singleLevel?: boolean;
        targetUserId?: string;
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
    const currentUser = ref<User | null>(null);
    const ratingDisplayMode = ref<"简洁" | "吃分" | "完整">("简洁");
    const expandedValue = ref<number>(0);
    const isSmallScreen = ref(false);
    const showScoreCalculator = ref(false);

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
            currentUser.value = null;
            ratingDisplayMode.value = "简洁";
            chartFriendsScoresMap.value.clear();

            if (!props.chart?.music?.charts) return;

            expandedValue.value = props.chart.info.grade || 0;

            if (shared.users.length > 0) {
                // If targetUserId is provided, use that user, otherwise use the first user (current user)
                if (props.targetUserId) {
                    const targetUserIndex = parseInt(props.targetUserId);
                    const targetUser = shared.users[targetUserIndex];
                    if (targetUser) {
                        currentUser.value = targetUser;
                    } else {
                        currentUser.value = shared.users[0] || null;
                    }
                } else {
                    currentUser.value = shared.users[0] || null;
                }
            }

            // 从缓存中加载项目位置
            await loadChartPositionsFromCache();

            // 为每个难度生成好友成绩数据
            props.chart.music.charts.forEach(chartInfo => {
                const chartFriends: any[] = [];

                shared.users.forEach(user => {
                    const uname = String(
                        user.remark ||
                            user.divingFish?.name ||
                            user.inGame?.name ||
                            user.inGame?.id ||
                            ""
                    );
                    if (!uname) return;

                    const key = `${props.chart!.music.id}-${chartInfo.info.grade}`;
                    const detail = user.data?.detailed?.[key];

                    if (detail) {
                        chartFriends.push({
                            name: uname,
                            user,
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
                            user,
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

    const currentChart = computed(() => {
        if (!props.chart) return null as unknown as Chart;
        if (props.chart.info.grade === expandedValue.value) return props.chart;
        return props.chart.music.charts.find(
            chart => chart.info.grade === expandedValue.value
        ) as Chart;
    });
    const currentChartScore = computed(() => {
        if (!props.chart) return null;
        if (props.chart.info.grade === expandedValue.value && props.chart.score)
            return props.chart.score;
        if (!currentUser.value || !currentUser.value.data.detailed) return null;
        const score =
            currentUser.value.data.detailed[`${props.chart.music.id}-${expandedValue.value}`];
        if (!score) return null;
        return chartScoreFromDF(score);
    });

    const noteCounts = computed(() => {
        const notes = (currentChart.value?.info.notes ?? []) as Array<number | undefined>;
        const [tap = 0, hold = 0, slide = 0] = notes;
        const hasTouch = notes.length === 5 || currentChart.value?.music?.info.type === "DX";
        const touch = notes.length === 5 ? (notes[3] ?? 0) : 0;
        const brk = notes.length === 5 ? (notes[4] ?? 0) : (notes[3] ?? 0);
        let total = 0;
        for (const n of notes) total += n ?? 0;

        return {
            tap,
            hold,
            slide,
            touch,
            break: brk,
            total,
            hasTouch,
        };
    });

    // 计算排名
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

    // 指定难度的 Rating 阶段表
    const chartRatingTables = computed(() => {
        if (!currentChart.value)
            return {
                all: [],
                filtered: [],
                current: [],
            };

        const all = getDetailedRatingsByConstant(currentChart.value.info.constant);
        // 当前的和能吃分的
        const filtered =
            currentChartScore.value && currentChartScore.value.achievements
                ? getDetailedRatingsByConstant(
                      currentChart.value.info.constant,
                      currentChartScore.value.achievements
                  )
                : all;

        return {
            all,
            filtered,
            current: ratingDisplayMode.value === "完整" ? all : filtered,
        };
    });

    // 获取指定难度的显示 Rating 阶段表
    function getDisplayedChartRaTable() {
        const raTable = chartRatingTables.value.current;

        if (ratingDisplayMode.value === "简洁") {
            // 简洁模式：只显示第一个和最后两个
            if (raTable.length <= 3) {
                return raTable;
            }
            return [raTable[0], ...raTable.slice(-2)];
        } else {
            // 吃分和完整模式：显示全部
            return raTable;
        }
    }

    // 当前用户在指定类别的最低rating
    const currentUserLowestRaInSection = computed(() => {
        if (!currentUser.value || !props.chart) return null;
        const section = props.chart.music.info.isNew
            ? currentUser.value.data.b50?.dx
            : currentUser.value.data.b50?.sd;
        if (!section) return null;
        return section[section.length - 1].ra;
    });

    const currentUserLowestRaInChartOrSection = computed(() => {
        if (!props.chart) return null;

        const chart = props.chart.score ? props.chart.score.deluxeRating : null;
        const section = currentUserLowestRaInSection.value;

        if (!chart || !section) return chart || section;
        return Math.max(chart, section);
    });

    // 指定难度的好友成绩
    const chartFriendsScores = computed(() => {
        if (!props.chart) return [];
        return chartFriendsScoresMap.value.get(currentChart.value.info.grade) || [];
    });

    // 获取当前谱面在对应难度的项目位置
    function getCurrentChartPosition(chartInfo: Chart): string {
        if (!props.chart) return "-";

        // 从缓存的Map中获取项目位置
        return chartPositionMap.value.get(chartInfo.info.grade) || "-";
    }

    // 切换收藏状态
    function toggleFavorite(favoriteList: FavoriteList, chartInfo: Chart) {
        if (!props.chart?.music) return;

        const chartId = props.chart.music.id;
        const chartLevel = chartInfo.info.grade;

        const existingIndex = favoriteList.charts.findIndex(
            chart => chart.i === chartId && chart.d === chartLevel
        );

        if (existingIndex >= 0) {
            // 如果已收藏，则取消收藏
            favoriteList.charts.splice(existingIndex, 1);
        } else {
            // 如果未收藏，则添加收藏
            favoriteList.charts.push({
                i: chartId,
                d: chartLevel,
            } as FavoriteChart);
        }
    }

    // 新增收藏夹
    function newFavList() {
        prompt({
            headline: "新增收藏夹",
            confirmText: "新增",
            cancelText: "取消",
            closeOnOverlayClick: true,
            closeOnEsc: true,
            onOpen: markDialogOpen,

            validator: value => {
                if (!value || value.trim() === "") {
                    return "收藏夹名称不能为空";
                }
                if (shared.favorites.some(fav => fav.name === value)) {
                    return "收藏夹已存在";
                }
                return true;
            },
            onConfirm: value => {
                shared.favorites.push({
                    name: value,
                    charts: [],
                });
                toggleFavorite(shared.favorites[shared.favorites.length - 1], props.chart!);
            },
        });
    }

    function showChartStats(stat: ChartStats) {
        dialog({
            headline: "谱面统计数据",
            body: `
                样本容量: ${stat.cnt}<br>
                拟合定数: ${stat.fit_diff}<br>
                平均达成率: ${stat.avg}<br>
                平均 DX 分: ${stat.avg_dx}<br>
                达成率标准差: ${stat.std_dev}<br>
            `,
            closeOnOverlayClick: true,
            closeOnEsc: true,
            onOpen: markDialogOpen,
            onClose: markDialogClosed,
        });
    }

    function handleDisplayModeChange(event: Event) {
        const target = event.target as HTMLSelectElement;
        const value = target.value as typeof ratingDisplayMode.value;

        if (value) ratingDisplayMode.value = value;
        else {
            // 阻止点击已经选择的项目时清空项目
            const previousValue = ratingDisplayMode.value;
            ratingDisplayMode.value = value;
            ratingDisplayMode.value = previousValue;
            // wtf
        }
    }

    // 计算DX Score星星显示
    const dxScoreStarsCount = computed(() => {
        if (!currentChartScore.value || !currentChart.value) return 0;

        const currentScore = currentChartScore.value.deluxeScore;
        const maxScore = currentChart.value.info.deluxeScoreMax;

        if (!currentScore || !maxScore) return 0;

        const percentage = (currentScore / maxScore) * 100;

        if (percentage >= 99) return 6;
        else if (percentage >= 97) return 5;
        else if (percentage >= 95) return 4;
        else if (percentage >= 93) return 3;
        else if (percentage >= 90) return 2;
        else if (percentage >= 85) return 1;
        return 0;
    });

    const dxScoreStarsImg = computed(() => {
        if (dxScoreStarsCount.value < 3) return "/icons/star1.png";
        if (dxScoreStarsCount.value < 5) return "/icons/star2.png";
        return "/icons/star3.png";
    });
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

        background: image("https://jacket.maimai.realtvop.top/00000.png");
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
        margin-bottom: 1rem;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    @media (max-width: 480px) {
        .score-summary {
            padding: 1rem;
            margin-bottom: 0.5rem;
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
        height: 2.25rem;
        object-fit: cover;
        object-position: center;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
    }

    @media (max-width: 480px) {
        .rank-icon-large {
            height: 1.75rem;
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
        justify-content: flex-end;
        align-items: flex-end;
        flex-direction: column;
        gap: 0.25rem;
    }

    .rating-score-display {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.5rem;
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

    .dx-score-display {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        justify-content: center;
        gap: 0.25rem;
        flex: 1;
        margin: 0 0.5rem;
    }

    .dx-score-value {
        font-size: 0.8rem;
        font-weight: 600;
        color: rgb(var(--mdui-color-secondary));
        background: rgba(var(--mdui-color-secondary), 0.1);
        padding: 0.15rem 0.4rem;
        border-radius: 4px;
        border: 1px solid rgba(var(--mdui-color-secondary), 0.2);
        line-height: 1;
        font-family: monospace;
    }

    .dx-score-stars {
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 0.05rem;
    }

    .dx-stars-img {
        height: 1rem;
        width: auto;
        object-fit: contain;
    }

    @media (max-width: 480px) {
        .dx-score-display {
            margin: 0 0.25rem;
            gap: 0.15rem;
        }

        .dx-score-value {
            font-size: 0.7rem;
            padding: 0.1rem 0.3rem;
        }

        .dx-stars-img {
            height: 1.2rem;
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
        min-width: 2rem;
        min-height: 2rem;
    }

    .badge-icon {
        height: 2rem;
        object-fit: contain;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
    }

    .badge-placeholder {
        width: 2rem;
        height: 2rem;
        display: inline-block;
    }

    @media (max-width: 480px) {
        .score-badges {
            gap: 4px;
        }

        .badge-slot {
            min-width: 1.5rem;
            min-height: 1.5rem;
        }

        .badge-icon {
            height: 1.5rem;
        }

        .badge-placeholder {
            width: 1.5rem;
            height: 1.5rem;
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

    .chart-search-urls {
        display: flex;
        justify-content: center;
        align-items: center;
        flex-wrap: wrap;
        align-content: center;
        gap: 0.5rem;
        padding-bottom: 0.5rem;
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
