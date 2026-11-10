<script setup lang="ts">
    import { ref, onMounted, computed, watch, onUnmounted, nextTick } from "vue";
    import { useRoute } from "vue-router";
    import type { User } from "@/components/data/user/type";
    import type { Chart } from "@core/music/type";
    import { MusicSort } from "@/components/data/music";
    import ScoreCard from "@/components/data/chart/ScoreCard.vue";
    import ScoreSection from "@/components/data/chart/ScoreSection.vue";
    import ChartInfoDialog from "@/components/data/chart/ChartInfo.vue";
    import {
        getMusicInfoAsync,
        maimaiVersionsCN,
        isMusicDataLoading,
    } from "@/components/data/music";
    import { useShared } from "@/components/app/shared";
    import { prompt, confirm, snackbar } from "mdui";
    import { markDialogOpen, markDialogClosed } from "@/components/app/router";
    import {
        getCollectionDataAsync,
        versionPlateCategories,
        versionPlates,
    } from "@/components/data/collection";
    import type { VersionPlate, VersionPlateCategory } from "@core/collection/type";
    import {
        checkCollectionChartFinish,
        getPlateCompactPresentation,
        getVersionPlateConditionText,
        getVersionPlateTabs,
    } from "@core/collection/versionPlate";
    import type { ComboStatus, RankRate, SyncStatus } from "@core/mai/types";
    import {
        getDifficultyFilterOptions,
        getChartDifficultyFullLabel,
        UTAGE_GRADE,
    } from "@core/chart/difficulty";
    import { getDifficultyTabs, hasAnyScoreChangedTime } from "@core/chart/recent";
    import { createDetailedScoreLookup, toChartScore } from "@/components/data/chart/scoreLookup";
    import {
        addChartPositionIndexes,
        addQueriedPositionIndexes,
        SongsCategory as Category,
        countChartStats,
        createGameOrderComparator,
        createPlayedFirstComparator,
        filterChartsForCategory,
        groupCharts,
        searchCharts,
    } from "@/components/data/chart/songsQuery";
    import {
        formatPlayCount,
        getScoreHistoryChartKey,
        getUserPlayCountEstimates,
    } from "@/components/data/user/scoreHistory";
    import { courses, getCourseTrackKey } from "@core/course";
    import type { Course } from "@core/course";
    import KaleidxscopeOverview from "@/components/data/kaleidxscope/KaleidxscopeOverview.vue";
    import {
        formatKaleidxscopeDateTime,
        formatKaleidxscopeLife,
        getKaleidxscopeCurrentPhase,
        getKaleidxscopeNextPhase,
        getOpenedKaleidxscopeGates,
    } from "@core/kaleidxscope";
    import { getCoverURL } from "@/components/integrations/assets";
    import { handleSelectChange } from "@/utils";

    declare global {
        interface Window {
            spec: {
                currentVersionBuildTime: string;
            };
        }
    }

    const primaryCategories = Object.values(Category).filter(
        item => item !== Category.Kaleidxscope && item !== Category.Course
    );

    const route = useRoute();
    const shared = useShared();
    const userId = ref(route.params.id as string);
    const banquetDifficulties = ["11?", "12?", "12+?", "13?", "13+?", "14?", "14+?"];
    const query = ref<string>("");
    const chartInfoDialog = ref<{
        open: boolean;
        chart: Chart | null;
    }>({
        open: false,
        chart: null,
    });
    const loadedIdentifier = {
        name: "",
        updateTime: 0,
        // verBuildTime: 0,
    };
    let loadChartsRequestId = 0;
    const groupBy = ref<"none" | "constant" | "version" | "rank" | "combo" | "sync">("none");
    const groupByOptions = [
        { value: "none", label: "无" },
        { value: "constant", label: "细分定数" },
        { value: "version", label: "版本" },
        { value: "rank", label: "Rank" },
        { value: "combo", label: "Combo" },
        { value: "sync", label: "Sync" },
    ];

    function onGroupByChange(event: Event) {
        handleSelectChange(event, groupBy);
    }

    const versionGroupBy = ref<"none" | "level" | "difficulty" | "rank" | "combo" | "sync">("none");
    const versionGroupByOptions = [
        { value: "none", label: "无" },
        { value: "level", label: "等级" },
        { value: "difficulty", label: "难度" },
        { value: "rank", label: "Rank" },
        { value: "combo", label: "Combo" },
        { value: "sync", label: "Sync" },
    ];

    function onVersionGroupByChange(event: Event) {
        handleSelectChange(event, versionGroupBy);
    }

    const hasRecentCharts = computed(() => hasAnyScoreChangedTime(shared.chartsSort?.charts));

    const category = ref<Category | VersionPlateCategory>(Category.InGame);
    const kaleidxscopeNow = ref(new Date());
    let kaleidxscopeClock: ReturnType<typeof setInterval> | undefined;
    const openedKaleidxscopeGates = computed(() =>
        getOpenedKaleidxscopeGates(kaleidxscopeNow.value)
    );
    const versionPlateTabs = computed(
        () =>
            Object.fromEntries(
                versionPlateCategories.map(key => [key, getVersionPlateTabs(versionPlates[key])])
            ) as Record<VersionPlateCategory, { value: string; label: string }[]>
    );
    const tabLabels = computed(
        () =>
            new Map(
                versionPlateTabs.value[category.value as VersionPlateCategory]?.map(tab => [
                    tab.value,
                    tab.label,
                ])
            )
    );
    function getTabsForCategory(tabCategory: Category | VersionPlateCategory): string[] {
        if (tabCategory === Category.InGame) {
            return getDifficultyTabs(
                !!shared.appSettings.reverseSongsDifficultyAndVersionTabs,
                hasRecentCharts.value
            );
        }
        if (tabCategory === Category.Banquet) return banquetDifficulties;
        if (tabCategory === Category.Favorite) return shared.favorites.map(f => f.name);
        if (tabCategory === Category.Kaleidxscope) {
            const gateTabs = openedKaleidxscopeGates.value.map(gate => gate.shortName);
            return shared.appSettings.reverseSongsDifficultyAndVersionTabs
                ? gateTabs.reverse()
                : gateTabs;
        }
        if (tabCategory === Category.Course) return courses.map(course => course.name);
        if (tabCategory === Category.Version) {
            return shared.appSettings.reverseSongsDifficultyAndVersionTabs
                ? [...maimaiVersionsCN].reverse()
                : maimaiVersionsCN;
        }
        if (tabCategory in versionPlates) {
            const plateType = tabCategory as VersionPlateCategory;
            return versionPlateTabs.value[plateType].map(tab => tab.value);
        }
        return [];
    }

    const tabs = computed(() => getTabsForCategory(category.value));
    const selectedTab = ref({
        [Category.InGame]: getTabsForCategory(Category.InGame)[0] || "",
        [Category.Banquet]: getTabsForCategory(Category.Banquet)[0] || "",
        [Category.Favorite]: getTabsForCategory(Category.Favorite)[0] || "",
        [Category.Version]: getTabsForCategory(Category.Version)[0] || "",
        [Category.Kaleidxscope]: getTabsForCategory(Category.Kaleidxscope)[0] || "",
        [Category.Course]: getTabsForCategory(Category.Course)[0] || "",
        // 为每个牌子类型添加默认选择
        ...Object.keys(versionPlates).reduce(
            (acc, key) => {
                const plateKey = key as VersionPlateCategory;
                acc[plateKey] = getTabsForCategory(plateKey)[0] || "";
                return acc;
            },
            {} as Record<VersionPlateCategory, string>
        ),
    });

    const selectedDifficulty = computed(() => selectedTab.value[category.value]);

    const selectedCourse = computed<Course | null>(() => {
        if (category.value !== Category.Course) return null;
        return courses.find(course => course.name === selectedDifficulty.value) ?? null;
    });

    const selectedKaleidxscopeGate = computed(() => {
        if (category.value !== Category.Kaleidxscope) return null;
        return (
            openedKaleidxscopeGates.value.find(
                gate => gate.shortName === selectedDifficulty.value
            ) ?? null
        );
    });
    const selectedKaleidxscopeCurrentPhase = computed(() => {
        const gate = selectedKaleidxscopeGate.value;
        return gate ? getKaleidxscopeCurrentPhase(gate, kaleidxscopeNow.value) : null;
    });
    const selectedKaleidxscopeNextPhase = computed(() => {
        const gate = selectedKaleidxscopeGate.value;
        return gate ? getKaleidxscopeNextPhase(gate, kaleidxscopeNow.value) : null;
    });

    const selectedCourseLifeRuleText = computed(() => {
        const course = selectedCourse.value;
        if (!course) return "";

        const damagingJudgments = [
            { judgment: "PERFECT", damage: course.life.damage.perfect },
            { judgment: "GREAT", damage: course.life.damage.great },
            { judgment: "GOOD", damage: course.life.damage.good },
            { judgment: "MISS", damage: course.life.damage.miss },
        ]
            .filter(({ damage }) => damage > 0)
            .map(({ judgment, damage }) => `${judgment} -${damage}`);

        return [`恢复 +${course.life.recovery}`, ...damagingJudgments].join(" ");
    });

    function syncVersionPlateSelections(): void {
        for (const plateCategory of versionPlateCategories) {
            const available = versionPlateTabs.value[plateCategory];
            if (!available.some(tab => tab.value === selectedTab.value[plateCategory])) {
                selectedTab.value[plateCategory] = available[0]?.value ?? "";
            }
        }
    }

    const selectedVersionPlate = computed<VersionPlate | null>(() => {
        if (!(category.value in versionPlates)) return null;
        return (
            versionPlates[category.value as VersionPlateCategory]?.find(
                plate => plate.name === selectedDifficulty.value
            ) ?? null
        );
    });

    const plateFinishStatus = computed(() => {
        const plate = selectedVersionPlate.value;
        if (!plate) return { plate: null, finishedItems: [], conditionText: "正在加载牌子数据…" };
        const finishedItems = itemsToRender.value.filter(chart =>
            checkCollectionChartFinish(plate, chart)
        );

        return {
            plate,
            finishedItems,
            conditionText: getVersionPlateConditionText(plate),
        };
    });
    const plateFinishSort = ref("condition");
    function onPlateSortChange(event: Event) {
        handleSelectChange(event, plateFinishSort);
    }

    const difficultyFilter = ref(3);
    const difficultyFilterOptions = computed(() =>
        getDifficultyFilterOptions(category.value === Category.Favorite)
    );

    function onDifficultyFilterChange(event: Event) {
        handleSelectChange(event, difficultyFilter, value => Number(value));
    }

    function getRandomChart() {
        if (!chartListFiltered.value) return null;
        const charts = chartListFiltered.value[selectedDifficulty.value] || [];
        if (charts.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * charts.length);
        return charts[randomIndex];
    }

    function scrollToConstant(constant: string) {
        visibleItemsCount.value = itemsToRender.value.length;
        nextTick(() => {
            const el = document.getElementById("const-" + constant);
            if (el) {
                el.scrollIntoView({ behavior: "smooth" });
            }
        });
    }
    const randomChartDummy = {
        music: {
            info: {
                title: "随机",
                artist: "",
                id: -1,
                aliases: [],
            },
        },
        info: {
            grade: 3,
            level: "ALL",
            charter: "系统",
            constant: "",
        },
        score: {
            achievements: "-",
            comboStatus: "",
            syncStatus: "",
            rankRate: "",
            deluxeScore: 0,
            deluxeRating: 0,
            index: {
                all: { index: 0, total: 1 },
                difficult: { index: 0, total: 1 },
                queried: { index: 0, total: 1 },
            },
        },
    } as unknown as Chart;

    function yieldToMainThread(): Promise<void> {
        return new Promise(resolve => window.setTimeout(resolve, 0));
    }

    const compareChartsByGameOrder = createGameOrderComparator(MusicSort);

    async function loadChartsWithCache(userData?: User | null) {
        const requestId = ++loadChartsRequestId;
        const currentIdentifier = {
            name: userData?.data.name || "unknown",
            updateTime: userData?.data?.updateTime || 0,
            verBuildTime: parseInt(window.spec?.currentVersionBuildTime || "0"),
        };

        if (
            currentIdentifier.updateTime === loadedIdentifier.updateTime &&
            currentIdentifier.name === loadedIdentifier.name
        )
            return;

        if (
            shared.chartsSort &&
            shared.chartsSort.identifier.name === currentIdentifier.name &&
            shared.chartsSort.identifier.updateTime === currentIdentifier.updateTime &&
            shared.chartsSort.identifier.verBuildTime === currentIdentifier.verBuildTime
        ) {
            loadedIdentifier.name = shared.chartsSort.identifier.name;
            loadedIdentifier.updateTime = shared.chartsSort.identifier.updateTime;

            return;
        }

        const musicInfo = await getMusicInfoAsync();
        if (!musicInfo) return;
        if (requestId !== loadChartsRequestId) return;

        const charts: Chart[] = [];
        const sourceCharts = Object.values(musicInfo.chartList) as Chart[];
        const detailedLookup = createDetailedScoreLookup(userData?.data?.detailed);
        const playCountEstimates = userData?.uid
            ? await getUserPlayCountEstimates(userData.uid, userData.data?.detailed)
            : null;
        if (requestId !== loadChartsRequestId) return;

        for (const [index, chart] of sourceCharts.entries()) {
            if (requestId !== loadChartsRequestId) return;
            // 仅在用户成绩字段齐全且类型匹配时赋值，否则保持原结构
            let chartScore: Chart["score"] = undefined;
            if (detailedLookup) {
                const record = detailedLookup.findScoreForChart(chart);
                chartScore = toChartScore(record);
                if (chartScore && playCountEstimates && record) {
                    const chartKey = getScoreHistoryChartKey(record);
                    const estimate = playCountEstimates.get(chartKey);
                    if (estimate && estimate.playCount !== null) {
                        chartScore.playCount = estimate.playCount;
                        chartScore.isPlayCountEstimated = estimate.isEstimated;
                    }
                }
            }
            charts.push({
                ...chart,
                score: chartScore,
            });

            if (index > 0 && index % 200 === 0) await yieldToMainThread();
        }

        await yieldToMainThread();
        if (requestId !== loadChartsRequestId) return;
        charts.sort(compareChartsByGameOrder);

        if (detailedLookup) {
            await yieldToMainThread();
            if (requestId !== loadChartsRequestId) return;
            charts.sort(createPlayedFirstComparator(detailedLookup.findScoreForChart));
        }

        if (requestId !== loadChartsRequestId) return;
        shared.chartsSort = {
            identifier: currentIdentifier,
            charts: charts,
        };
    }

    const chartListFiltered = computed(() => {
        if (!shared.chartsSort.charts || !shared.chartsSort.charts.length) return null;

        const filteredCharts = filterChartsForCategory({
            charts: shared.chartsSort.charts,
            category: category.value,
            selectedTab: selectedDifficulty.value,
            difficultyFilter: difficultyFilter.value,
            favorites: shared.favorites,
            selectedCourse: selectedCourse.value,
            versionPlates,
            plateSort: plateFinishSort.value,
        });
        const chartsWithOriginalIndex = addChartPositionIndexes(
            shared.chartsSort.charts,
            filteredCharts
        );
        const finalFilteredCharts = searchCharts(chartsWithOriginalIndex, query.value);
        const chartsWithIndex = addQueriedPositionIndexes(
            finalFilteredCharts,
            filteredCharts.length
        );

        return { [selectedDifficulty.value]: chartsWithIndex };
    });

    const compactMode = computed<"rankRate" | "comboStatus" | "syncStatus" | undefined>(() => {
        const plate = selectedVersionPlate.value;
        return plate ? getPlateCompactPresentation(plate).mode : undefined;
    });
    const compactFilter = computed<ComboStatus | RankRate | SyncStatus | undefined>(() => {
        const plate = selectedVersionPlate.value;
        return plate ? getPlateCompactPresentation(plate).filter : undefined;
    });

    const loadPlayerData = async () => {
        const targetUserId = userId.value ? Number(userId.value) : 0;
        if (shared.users[targetUserId]) await loadChartsWithCache(shared.users[targetUserId]);
        else await loadChartsWithCache();
    };

    function openChartInfoDialog(chart: Chart) {
        chartInfoDialog.value.chart = chart;
        chartInfoDialog.value.open = !chartInfoDialog.value.open;
    }

    function getCardRating(chart: Chart): string | number | undefined {
        const setting = shared.appSettings.songsCardTopRightDisplay;
        if (setting === "无") {
            return undefined;
        }
        if (setting === "游玩次数") {
            if (!chart.score?.playCount) return undefined;
            return formatPlayCount(chart.score.playCount, chart.score.isPlayCountEstimated);
        }
        const diff = chart.score?.index?.difficult;
        if (!diff) return undefined;
        return `${diff.index}/${diff.total + 1}`;
    }

    const itemsToRender = computed(() => {
        if (!chartListFiltered.value) return [];
        return chartListFiltered.value[selectedDifficulty.value] || [];
    });

    const courseTrackEntries = computed(() => {
        const course = selectedCourse.value;
        if (!course) return [];

        const chartsByTrack = new Map(
            itemsToRender.value.map(chart => [
                getCourseTrackKey({
                    musicId: chart.music.id,
                    difficulty: chart.info.grade,
                }),
                chart,
            ])
        );

        return course.tracks.map(track => ({
            track,
            chart: chartsByTrack.get(getCourseTrackKey(track)) ?? null,
        }));
    });

    // 虚拟滚动状态管理
    const visibleItemsCount = ref(0);

    // 根据屏幕宽度计算每次加载的项目数
    const getLoadSize = () => {
        const width = window.innerWidth;
        const isCompact = category.value in versionPlates;

        // 根据屏幕宽度和是否为compact模式确定列数
        let columns = 1;
        if (isCompact) {
            // compact模式下的列数计算（100px卡片）
            if (width >= 1254) columns = 9;
            else if (width >= 1000) columns = 8;
            else if (width >= 768) columns = 7;
            else if (width >= 500) columns = 5;
            else if (width >= 350) columns = 3;
            else columns = 3;
        } else {
            // 普通模式下的列数计算（210px卡片）
            if (width >= 1254) columns = 5;
            else if (width >= 1000) columns = 4;
            else if (width >= 768) columns = 3;
            else if (width >= 500) columns = 2;
            else if (width >= 350) columns = 2;
            else columns = 1;
        }

        // 计算行数和总加载数量
        // compact模式下卡片高度更小，可以显示更多行
        const cardHeight = isCompact ? 120 : 200;
        const rowsPerPage = Math.max(Math.floor(window.innerHeight / cardHeight), 2);
        return columns * rowsPerPage * 3; // 一次加载3页的量
    };

    const maxVisibleItems = computed(() =>
        Math.min(visibleItemsCount.value, itemsToRender.value.length)
    );

    const groupedItems = computed(() =>
        groupCharts({
            charts: itemsToRender.value,
            category: category.value,
            selectedTab: selectedDifficulty.value,
            groupBy: groupBy.value,
            versionGroupBy: versionGroupBy.value,
            versions: maimaiVersionsCN,
        })
    );

    const visibleGroupedItems = computed(() => {
        if (!groupedItems.value) return null;

        let remaining = maxVisibleItems.value;
        const result: {
            title: string;
            count: number;
            stats: { sss: number; sssp: number; fc: number; ap: number; fsdx: number };
            visibleCount: number;
            items: Chart[];
        }[] = [];

        for (const group of groupedItems.value) {
            if (remaining <= 0) break;
            const take = Math.min(remaining, group.items.length);
            result.push({
                title: group.title,
                count: group.count,
                stats: group.stats,
                visibleCount: take,
                items: group.items.slice(0, take),
            });
            remaining -= take;
        }

        return result;
    });

    const overallStats = computed(() => {
        if (groupBy.value !== "none" || category.value !== Category.InGame) return null;

        const charts = itemsToRender.value;
        if (!charts.length) return null;

        return countChartStats(charts);
    });

    // 加载更多项目
    const loadMore = () => {
        const remainingItems = itemsToRender.value.length - visibleItemsCount.value;
        if (remainingItems > 0) {
            const loadSize = Math.min(getLoadSize(), remainingItems);
            visibleItemsCount.value += loadSize;
        }
    };

    const getPreloadThreshold = () => Math.max(600, Math.floor(window.innerHeight * 1.5));

    // 滚动事件处理（使用 window 滚动）
    const handleScroll = () => {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        if (scrollTop + windowHeight >= documentHeight - getPreloadThreshold()) {
            loadMore();
        }
    };

    // 窗口大小变化处理
    const handleResize = () => {
        const currentItemsPerPage = getLoadSize() / 3; // 单页数量
        const currentPages = Math.ceil(visibleItemsCount.value / currentItemsPerPage);
        const newVisibleCount = Math.min(
            currentPages * currentItemsPerPage,
            itemsToRender.value.length
        );

        visibleItemsCount.value = Math.max(newVisibleCount, getLoadSize());
    };

    watch(selectedDifficulty, () => {
        visibleItemsCount.value = getLoadSize();
        query.value = "";
        groupBy.value = "none";
        // 滚动到顶部
        window.scrollTo({ top: 0, behavior: "instant" });
    });

    watch(hasRecentCharts, hasRecent => {
        if (!hasRecent && selectedTab.value[Category.InGame] === "最近") {
            selectedTab.value[Category.InGame] = getTabsForCategory(Category.InGame)[0] || "ALL";
        }
    });

    watch(openedKaleidxscopeGates, gates => {
        if (!gates.some(gate => gate.shortName === selectedTab.value[Category.Kaleidxscope])) {
            selectedTab.value[Category.Kaleidxscope] =
                getTabsForCategory(Category.Kaleidxscope)[0] || "";
        }
    });

    watch(category, newCategory => {
        groupBy.value = "none";
        // 切换分类时，重置到该分类的默认选项
        selectedTab.value[newCategory] = getTabsForCategory(newCategory)[0] || "";
        if (
            newCategory === Category.InGame ||
            newCategory === Category.Version ||
            newCategory === Category.Kaleidxscope
        ) {
            if (difficultyFilter.value === UTAGE_GRADE) difficultyFilter.value = 3;
        }
        query.value = "";
        visibleItemsCount.value = getLoadSize();
    });

    watch(
        () => shared.appSettings.reverseSongsDifficultyAndVersionTabs,
        () => {
            selectedTab.value[Category.Version] = getTabsForCategory(Category.Version)[0] || "";
            selectedTab.value[Category.Kaleidxscope] =
                getTabsForCategory(Category.Kaleidxscope)[0] || "";
        }
    );

    watch(
        () =>
            versionPlateCategories.map(key => versionPlates[key].map(plate => plate.id).join(",")),
        syncVersionPlateSelections
    );

    // 监听路由参数变化，重新加载数据
    watch(
        () => route.params.id,
        async newId => {
            userId.value = newId as string;
            await loadPlayerData();
        }
    );

    // 监听排序方式变化，重新计算可视项目数
    watch(plateFinishSort, () => {
        visibleItemsCount.value = getLoadSize();
        // 滚动到顶部
        window.scrollTo({ top: 0, behavior: "instant" });
    });

    // 监听难度筛选变化，重新计算可视项目数
    watch(difficultyFilter, () => {
        visibleItemsCount.value = getLoadSize();
        // 滚动到顶部
        window.scrollTo({ top: 0, behavior: "instant" });
    });

    // 监听分组变化，重新计算可视项目数
    watch(groupBy, () => {
        visibleItemsCount.value = getLoadSize();
        // 滚动到顶部
        window.scrollTo({ top: 0, behavior: "instant" });
    });

    onMounted(async () => {
        visibleItemsCount.value = getLoadSize();
        kaleidxscopeClock = setInterval(() => {
            kaleidxscopeNow.value = new Date();
        }, 60_000);
        window.addEventListener("resize", handleResize);
        window.addEventListener("scroll", handleScroll);
        void getCollectionDataAsync().then(syncVersionPlateSelections);
        loadPlayerData().catch(error => {
            console.error("Failed to load charts:", error);
        });
        shared.usersLoaded
            .then(() => loadPlayerData())
            .catch(error => {
                console.error("Failed to load charts after users loaded:", error);
            });
    });

    onUnmounted(() => {
        if (kaleidxscopeClock) clearInterval(kaleidxscopeClock);
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("scroll", handleScroll);
    });

    // 新增收藏夹
    function newFavList() {
        void prompt({
            headline: "新增收藏夹",
            confirmText: "新增",
            cancelText: "取消",
            closeOnOverlayClick: true,
            closeOnEsc: true,
            onOpen: markDialogOpen,
            onClose: markDialogClosed,

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
            },
        }).catch(() => undefined);
    }
    function importFavList() {
        void prompt({
            headline: "导入收藏夹",
            confirmText: "导入",
            cancelText: "取消",
            closeOnOverlayClick: true,
            closeOnEsc: true,
            onOpen: markDialogOpen,
            onClose: markDialogClosed,

            textFieldOptions: { value: "" },
            validator: value => {
                if (!value || value.trim() === "") {
                    return "请输入收藏夹数据";
                }
                try {
                    const fav = JSON.parse(value);
                    if (!fav.n || !Array.isArray(fav.s)) {
                        return "无效的收藏夹数据格式";
                    }
                } catch (e) {
                    return "无效的 JSON 格式";
                }
                return true;
            },
            onConfirm: value => {
                try {
                    const data = JSON.parse(value);
                    const originalName = data.n;

                    // 检查是否有同名收藏夹
                    if (shared.favorites.some(fav => fav.name === originalName)) {
                        // 弹出重命名对话框
                        void prompt({
                            headline: "收藏夹名称冲突",
                            confirmText: "导入",
                            cancelText: "取消",
                            closeOnOverlayClick: true,
                            closeOnEsc: true,
                            onOpen: markDialogOpen,
                            onClose: markDialogClosed,

                            textFieldOptions: { value: originalName },
                            validator: newName => {
                                if (!newName || newName.trim() === "") {
                                    return "收藏夹名称不能为空";
                                }
                                if (shared.favorites.some(fav => fav.name === newName)) {
                                    return "收藏夹已存在";
                                }
                                return true;
                            },
                            onConfirm: newName => {
                                shared.favorites.push({
                                    name: newName,
                                    charts: data.s,
                                });
                                snackbar({ message: "导入成功" });
                            },
                        }).catch(() => undefined);
                    } else {
                        // 直接导入
                        shared.favorites.push({
                            name: originalName,
                            charts: data.s,
                        });
                        snackbar({ message: "导入成功" });
                    }
                } catch (e) {
                    snackbar({ message: "导入失败，请检查数据格式" });
                }
            },
        }).catch(() => undefined);
    }
    function exportFavList() {
        if (shared.favorites.length === 0) return;
        const currentFavorite = shared.favorites.find(
            f => f.name === selectedTab.value[Category.Favorite]
        );
        if (!currentFavorite) return;

        const json = JSON.stringify({
            n: currentFavorite.name,
            s: currentFavorite.charts,
        });
        navigator.clipboard
            .writeText(json)
            .then(() => {
                snackbar({ message: "导出成功，已复制到剪切板" });
            })
            .catch(() => {
                snackbar({ message: "导出失败，请重试" });
            });
    }
    function renameFavList() {
        if (shared.favorites.length === 0) return;
        const currentFavorite = shared.favorites.find(
            f => f.name === selectedTab.value[Category.Favorite]
        );
        if (!currentFavorite) return;
        void prompt({
            headline: "重命名收藏夹",
            confirmText: "重命名",
            cancelText: "取消",
            closeOnOverlayClick: true,
            closeOnEsc: true,
            onOpen: markDialogOpen,
            onClose: markDialogClosed,

            textFieldOptions: { value: currentFavorite.name },
            validator: value => {
                if (!value || value.trim() === "") {
                    return "收藏夹名称不能为空";
                }
                if (shared.favorites.some(fav => fav.name === value && fav !== currentFavorite)) {
                    return "收藏夹已存在";
                }
                return true;
            },
            onConfirm: value => {
                currentFavorite.name = value;
                selectedTab.value[Category.Favorite] = value;
            },
        }).catch(() => undefined);
    }
    function deleteFavList() {
        if (shared.favorites.length === 0) return;
        const currentFavorite = shared.favorites.find(
            f => f.name === selectedTab.value[Category.Favorite]
        );
        if (!currentFavorite) return;
        void confirm({
            headline: "删除收藏夹",
            description: `确定要删除收藏夹 "${currentFavorite.name}" 吗？`,
            confirmText: "删除",
            cancelText: "取消",
            closeOnOverlayClick: true,
            closeOnEsc: true,
            onOpen: markDialogOpen,
            onClose: markDialogClosed,

            onConfirm: () => {
                const index = shared.favorites.findIndex(f => f.name === currentFavorite.name);
                if (index !== -1) {
                    shared.favorites.splice(index, 1);
                    if (shared.favorites.length > 0) {
                        selectedTab.value[Category.Favorite] = shared.favorites[0].name;
                    } else {
                        selectedTab.value[Category.Favorite] = "";
                    }
                }
            },
        }).catch(() => undefined);
    }
</script>

<template>
    <div
        class="songs-page"
        :class="{
            'songs-page-fixed': userId,
        }"
    >
        <!-- [游戏排序]难度选单 -->
        <div class="category-bar">
            <mdui-dropdown>
                <mdui-chip slot="trigger" end-icon="keyboard_arrow_down">{{ category }}</mdui-chip>
                <mdui-menu class="category-menu">
                    <mdui-menu-item
                        @click="category = item"
                        v-for="(item, index) in primaryCategories"
                        :key="index"
                        :style="{
                            backgroundColor:
                                category == item ? 'rgba(var(--mdui-color-primary),12%)' : '',
                        }"
                        :icon="category == item ? 'check' : ''"
                    >
                        {{ item }}
                    </mdui-menu-item>
                    <mdui-divider />
                    <mdui-menu-item
                        v-for="(plateType, index) in Object.keys(versionPlates)"
                        :key="`plate-${index}`"
                        :icon="category === plateType ? 'check' : ''"
                        :style="{
                            backgroundColor:
                                category === plateType ? 'rgba(var(--mdui-color-primary),12%)' : '',
                        }"
                        @click="category = plateType as VersionPlateCategory"
                    >
                        {{ plateType }}牌
                    </mdui-menu-item>
                    <mdui-divider />
                    <mdui-menu-item
                        :icon="category === Category.Course ? 'check' : ''"
                        :style="{
                            backgroundColor:
                                category === Category.Course
                                    ? 'rgba(var(--mdui-color-primary),12%)'
                                    : '',
                        }"
                        @click="category = Category.Course"
                    >
                        段位
                    </mdui-menu-item>
                    <mdui-menu-item
                        :icon="category === Category.Kaleidxscope ? 'check' : ''"
                        :style="{
                            backgroundColor:
                                category === Category.Kaleidxscope
                                    ? 'rgba(var(--mdui-color-primary),12%)'
                                    : '',
                        }"
                        @click="category = Category.Kaleidxscope"
                    >
                        万花筒
                    </mdui-menu-item>
                </mdui-menu>
            </mdui-dropdown>
            <mdui-tabs :value="selectedDifficulty">
                <mdui-tab
                    v-for="tab in tabs"
                    :key="tab"
                    :value="tab"
                    @click="
                        () => {
                            selectedTab[category] = tab;
                        }
                    "
                >
                    {{ tabLabels.get(tab) ?? tab }}
                </mdui-tab>
            </mdui-tabs>
            <!-- 收藏选项 -->
            <mdui-dropdown v-if="category == Category.Favorite">
                <mdui-button-icon slot="trigger" icon="more_vert"></mdui-button-icon>
                <mdui-menu>
                    <mdui-menu-item icon="add" @click="newFavList">新建收藏夹</mdui-menu-item>
                    <mdui-menu-item icon="content_paste" @click="importFavList">
                        导入收藏夹
                    </mdui-menu-item>
                    <mdui-divider v-if="shared.favorites.length > 0" />
                    <mdui-menu-item
                        v-if="shared.favorites.length > 0"
                        icon="edit"
                        @click="renameFavList"
                    >
                        重命名
                    </mdui-menu-item>
                    <mdui-menu-item
                        v-if="shared.favorites.length > 0"
                        icon="content_copy"
                        @click="exportFavList"
                    >
                        导出
                    </mdui-menu-item>
                    <mdui-menu-item
                        v-if="shared.favorites.length > 0"
                        icon="delete"
                        style="color: red"
                        @click="deleteFavList"
                    >
                        删除
                    </mdui-menu-item>
                </mdui-menu>
            </mdui-dropdown>
        </div>

        <div v-if="category in versionPlates" class="search-input">
            <mdui-select
                style="width: 5rem"
                label="排序"
                :value="plateFinishSort"
                @change="onPlateSortChange"
            >
                <mdui-menu-item value="condition" :selected="plateFinishSort === 'condition'">
                    条件
                </mdui-menu-item>
                <mdui-menu-item
                    value="constant-desc"
                    :selected="plateFinishSort === 'constant-desc'"
                >
                    定数↓
                </mdui-menu-item>
                <mdui-menu-item value="constant-asc" :selected="plateFinishSort === 'constant-asc'">
                    定数↑
                </mdui-menu-item>
            </mdui-select>
            <span>
                {{ plateFinishStatus.conditionText }}
            </span>
            <div>
                <mdui-circular-progress
                    :value="plateFinishStatus.finishedItems.length"
                    :max="itemsToRender.length"
                ></mdui-circular-progress>
                <span>
                    {{ plateFinishStatus.finishedItems.length }} / {{ itemsToRender.length }}
                </span>
            </div>
        </div>
        <div v-else-if="category === Category.Kaleidxscope" class="search-input">
            <mdui-select
                style="width: 4.1rem; flex-shrink: 0"
                label="难度"
                :value="difficultyFilter.toString()"
                @change="onDifficultyFilterChange"
            >
                <mdui-menu-item
                    v-for="option in difficultyFilterOptions"
                    :key="option.grade"
                    :value="option.grade.toString()"
                >
                    {{ option.label }}
                </mdui-menu-item>
            </mdui-select>
            <div class="challenge-life-summary">
                <span v-if="selectedKaleidxscopeCurrentPhase" class="challenge-life-value">
                    <mdui-icon name="favorite"></mdui-icon>
                    {{ formatKaleidxscopeLife(selectedKaleidxscopeCurrentPhase.life) }}
                    <small>{{ selectedKaleidxscopeCurrentPhase.difficulty }}</small>
                </span>
                <span v-else-if="selectedKaleidxscopeGate" class="challenge-life-value pending">
                    <mdui-icon name="event"></mdui-icon>
                    {{ formatKaleidxscopeDateTime(selectedKaleidxscopeGate.openedAt, true) }} 开放
                </span>
                <span v-if="selectedKaleidxscopeNextPhase" class="challenge-life-rules">
                    下次放宽
                    {{ formatKaleidxscopeDateTime(selectedKaleidxscopeNextPhase.startsAt) }} →
                    {{ selectedKaleidxscopeNextPhase.difficulty }} · LIFE
                    {{ selectedKaleidxscopeNextPhase.life }}
                </span>
                <span
                    v-else-if="
                        selectedKaleidxscopeGate?.lifeNote &&
                        !selectedKaleidxscopeGate.lifePhases.length
                    "
                    class="challenge-life-rules"
                >
                    血量日历待确认
                </span>
                <span v-else-if="selectedKaleidxscopeCurrentPhase" class="challenge-life-rules">
                    最终阶段
                </span>
            </div>
        </div>
        <div v-else-if="category === Category.Course" class="search-input challenge-life-summary">
            <span class="challenge-life-value">
                <mdui-icon name="favorite"></mdui-icon>
                {{ selectedCourse?.life.initial ?? "-" }}
            </span>
            <span v-if="selectedCourse" class="challenge-life-rules">
                {{ selectedCourseLifeRuleText }}
            </span>
        </div>
        <div
            v-else-if="category === Category.InGame && selectedDifficulty === 'ALL'"
            class="search-input"
        >
            <mdui-select
                style="width: 4.1rem"
                label="难度"
                :value="difficultyFilter.toString()"
                @change="onDifficultyFilterChange"
            >
                <mdui-menu-item
                    v-for="option in difficultyFilterOptions"
                    :key="option.grade"
                    :value="option.grade.toString()"
                >
                    {{ option.label }}
                </mdui-menu-item>
            </mdui-select>
            <mdui-text-field
                clearable
                icon="search"
                label="搜索"
                placeholder="曲名 别名 id 曲师 谱师"
                @input="query = $event.target.value"
                style="flex: 1"
                id="search-input"
            ></mdui-text-field>
        </div>
        <div
            v-else-if="category === Category.InGame && selectedDifficulty === '最近'"
            class="search-input"
        >
            <mdui-text-field
                clearable
                icon="search"
                label="搜索"
                placeholder="曲名 别名 id 曲师 谱师"
                @input="query = $event.target.value"
                style="flex: 1"
                id="search-input"
            ></mdui-text-field>
        </div>
        <div v-else-if="category === Category.Favorite" class="search-input">
            <mdui-select
                style="width: 4.1rem"
                label="难度"
                :value="difficultyFilter.toString()"
                @change="onDifficultyFilterChange"
            >
                <mdui-menu-item
                    v-for="option in difficultyFilterOptions"
                    :key="option.grade"
                    :value="option.grade.toString()"
                >
                    {{ option.label }}
                </mdui-menu-item>
            </mdui-select>
            <mdui-select
                style="width: 4.1rem"
                label="分类"
                :value="versionGroupBy"
                @change="onVersionGroupByChange"
            >
                <mdui-menu-item
                    v-for="option in versionGroupByOptions"
                    :key="option.value"
                    :value="option.value"
                >
                    {{ option.label }}
                </mdui-menu-item>
            </mdui-select>
            <mdui-text-field
                clearable
                icon="search"
                label="搜索"
                placeholder="曲名 别名 id 曲师 谱师"
                @input="query = $event.target.value"
                style="flex: 1"
                id="search-input"
            ></mdui-text-field>
        </div>
        <div v-else-if="category === Category.Version" class="search-input">
            <mdui-select
                style="width: 4.1rem"
                label="难度"
                :value="difficultyFilter.toString()"
                @change="onDifficultyFilterChange"
            >
                <mdui-menu-item
                    v-for="option in difficultyFilterOptions"
                    :key="option.grade"
                    :value="option.grade.toString()"
                >
                    {{ option.label }}
                </mdui-menu-item>
            </mdui-select>
            <mdui-select
                style="width: 4.1rem"
                label="分类"
                :value="versionGroupBy"
                @change="onVersionGroupByChange"
            >
                <mdui-menu-item
                    v-for="option in versionGroupByOptions"
                    :key="option.value"
                    :value="option.value"
                >
                    {{ option.label }}
                </mdui-menu-item>
            </mdui-select>
            <mdui-text-field
                clearable
                icon="search"
                label="搜索"
                placeholder="曲名 别名 id 曲师 谱师"
                @input="query = $event.target.value"
                style="flex: 1"
                id="search-input"
            ></mdui-text-field>
        </div>

        <div v-else class="search-input">
            <mdui-select
                style="width: 4.1rem"
                label="分类"
                :value="groupBy"
                @change="onGroupByChange"
            >
                <mdui-menu-item
                    v-for="option in groupByOptions"
                    :key="option.value"
                    :value="option.value"
                >
                    {{ option.label }}
                </mdui-menu-item>
            </mdui-select>
            <mdui-text-field
                clearable
                icon="search"
                label="搜索"
                placeholder="曲名 别名 id 曲师 谱师"
                @input="query = $event.target.value"
                style="flex: 1"
                id="search-input"
            ></mdui-text-field>
        </div>

        <KaleidxscopeOverview
            v-if="category === Category.Kaleidxscope && selectedKaleidxscopeGate"
            :gate="selectedKaleidxscopeGate"
            :charts="shared.chartsSort.charts"
            :now="kaleidxscopeNow"
            :chart-info-dialog="chartInfoDialog"
            v-model:preferred-grade="difficultyFilter"
        />
        <div v-else-if="isMusicDataLoading" class="songs-loading-container">
            <mdui-circular-progress></mdui-circular-progress>
            <div class="loading-text">正在更新谱面列表...</div>
        </div>
        <div
            v-else-if="chartListFiltered"
            class="card-container"
            :class="{ 'card-container-fixed': userId }"
        >
            <div v-if="visibleGroupedItems" class="grouped-container">
                <div
                    v-for="group in visibleGroupedItems"
                    :key="group.title"
                    :id="'const-' + group.title"
                    class="group-wrapper"
                >
                    <div
                        class="score-section"
                        style="
                            max-width: 1300px;
                            margin: 0 auto;
                            padding: 0 20px;
                            box-sizing: border-box;
                        "
                    >
                        <h2 class="section-title">
                            <mdui-dropdown v-if="groupedItems">
                                <span slot="trigger" style="cursor: pointer">
                                    {{ group.title }}
                                </span>
                                <mdui-menu>
                                    <mdui-menu-item
                                        v-for="target in groupedItems"
                                        :key="'jump-' + target.title"
                                        @click="scrollToConstant(target.title)"
                                    >
                                        {{ target.title }}
                                    </mdui-menu-item>
                                </mdui-menu>
                            </mdui-dropdown>
                            <span
                                class="stats-info"
                                v-if="
                                    ['rank', 'combo', 'sync', 'difficulty'].includes(
                                        category === Category.Version ||
                                            category === Category.Favorite
                                            ? versionGroupBy
                                            : groupBy
                                    )
                                "
                            >
                                <span class="stat-item">{{ group.count }}</span>
                            </span>
                            <span
                                class="stats-info"
                                v-else-if="
                                    selectedDifficulty !== '最近' &&
                                    (group.stats.sss ||
                                        group.stats.sssp ||
                                        group.stats.fc ||
                                        group.stats.ap ||
                                        group.stats.fsdx)
                                "
                            >
                                <span class="stat-item" v-if="group.stats.sss">
                                    SSS: {{ group.stats.sss + group.stats.sssp }}
                                </span>
                                <span class="stat-item" v-if="group.stats.sssp">
                                    SSS+: {{ group.stats.sssp }}
                                </span>
                                <span class="stat-item" v-if="group.stats.fc">
                                    FC: {{ group.stats.fc }}
                                </span>
                                <span class="stat-item" v-if="group.stats.ap">
                                    AP: {{ group.stats.ap }}
                                </span>
                                <span class="stat-item" v-if="group.stats.fsdx">
                                    FSDX: {{ group.stats.fsdx }}
                                </span>
                            </span>
                        </h2>
                    </div>
                    <ScoreSection
                        title=""
                        :scores="group.items"
                        :chartInfoDialog="chartInfoDialog"
                        hideStats
                        hideTitle
                        :getRating="getCardRating"
                    >
                        <template #prepend>
                            <ScoreCard
                                cover="/icons/random.png"
                                :data="randomChartDummy"
                                @click="
                                    () => {
                                        const chart =
                                            group.items[
                                                Math.floor(Math.random() * group.items.length)
                                            ];
                                        if (chart) openChartInfoDialog(chart);
                                    }
                                "
                            />
                        </template>
                    </ScoreSection>
                </div>
                <div v-if="maxVisibleItems < itemsToRender.length" class="loading-indicator">
                    <div class="loading-text">正在加载更多...</div>
                    <mdui-button variant="text" @click="loadMore">点击加载</mdui-button>
                </div>
            </div>
            <div v-else class="score-grid-wrapper">
                <div
                    class="stats-info"
                    v-if="
                        overallStats &&
                        (overallStats.sss ||
                            overallStats.sssp ||
                            overallStats.fc ||
                            overallStats.ap ||
                            overallStats.fsdx)
                    "
                    style="justify-content: center; padding: 5px 0 10px 0; width: 100%"
                >
                    <span class="stat-item" v-if="overallStats.sss">
                        SSS:{{ overallStats.sss + overallStats.sssp }}
                    </span>
                    <span class="stat-item" v-if="overallStats.sssp">
                        SSS+:{{ overallStats.sssp }}
                    </span>
                    <span class="stat-item" v-if="overallStats.fc">FC:{{ overallStats.fc }}</span>
                    <span class="stat-item" v-if="overallStats.ap">AP:{{ overallStats.ap }}</span>
                    <span class="stat-item" v-if="overallStats.fsdx">
                        FSDX:{{ overallStats.fsdx }}
                    </span>
                </div>
                <div class="score-grid">
                    <template v-if="category === Category.Course">
                        <div
                            v-for="(entry, index) in courseTrackEntries"
                            :key="getCourseTrackKey(entry.track)"
                            class="score-cell"
                        >
                            <ScoreCard
                                v-if="entry.chart"
                                :data="entry.chart"
                                :rating="`${index + 1}`"
                                @click="openChartInfoDialog(entry.chart)"
                            />
                            <mdui-card v-else variant="outlined" class="course-missing-card">
                                <img
                                    :src="getCoverURL(entry.track.musicId)"
                                    :alt="entry.track.title"
                                    crossorigin="anonymous"
                                />
                                <div>
                                    <strong>{{ entry.track.title }}</strong>
                                    <span>
                                        {{ getChartDifficultyFullLabel(entry.track.difficulty) }}
                                    </span>
                                    <small>谱面数据暂不可用</small>
                                </div>
                            </mdui-card>
                        </div>
                    </template>
                    <template v-else>
                        <ScoreCard
                            v-if="
                                !(category in versionPlates) &&
                                (category !== Category.Favorite || shared.favorites.length > 0) &&
                                selectedDifficulty !== '最近'
                            "
                            cover="/icons/random.png"
                            :data="randomChartDummy"
                            @click="
                                () => {
                                    const chart = getRandomChart();
                                    if (chart) openChartInfoDialog(chart);
                                }
                            "
                        />
                        <div
                            v-for="(chart, index) in itemsToRender.slice(0, maxVisibleItems)"
                            :key="`score-cell-${index}`"
                            class="score-cell"
                            :class="{ 'score-cell-compact': category in versionPlates }"
                        >
                            <ScoreCard
                                :data="chart"
                                @click="openChartInfoDialog(chart)"
                                :compact="compactMode"
                                :compact-filter="compactFilter"
                                :rating="getCardRating(chart)"
                            />
                        </div>
                    </template>

                    <div v-if="maxVisibleItems < itemsToRender.length" class="loading-indicator">
                        <div class="loading-text">正在加载更多...</div>
                        <mdui-button variant="text" @click="loadMore">点击加载</mdui-button>
                    </div>
                </div>
            </div>
        </div>

        <ChartInfoDialog
            v-model:open="chartInfoDialog.open"
            :chart="chartInfoDialog.chart"
            :targetUserId="userId"
        />
    </div>
</template>

<style scoped>
    /* 固定页面模式下的全局样式重写 */
    .songs-page {
        padding-top: calc(48px + 64px); /* category-bar + search-input height */
    }
    .songs-page-fixed {
        @media (min-aspect-ratio: 1.001/1) {
            margin-left: -16px;
            padding-left: 16px;
        }
    }

    mdui-select::part(menu) {
        width: unset;
        max-height: 60vh;
        overflow-y: auto;
        min-width: 160px;
        max-width: 90vw;
        text-align: left;
    }

    .category-bar {
        position: fixed;
        top: 56px;
        left: 0;
        right: 0;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        padding: 0 10px;
        gap: 10px;
        overflow: hidden;
        height: 48px;
        background: rgb(var(--mdui-color-background));
        box-sizing: border-box;
    }

    .category-menu {
        max-height: calc(100dvh - 56px - 40px - var(--nav-bar-height) - 8px);
        overflow-y: auto;
        overscroll-behavior: contain;
    }

    @media (min-aspect-ratio: 1.001/1) {
        .category-bar {
            left: 80px; /* navigation rail width */
        }

        .category-menu {
            max-height: calc(100dvh - 56px - 40px - 8px);
        }
    }

    mdui-tabs {
        flex: 1;
        min-width: 0;
        overflow-x: auto;
        overflow-y: hidden;
    }

    .search-input {
        position: fixed;
        top: calc(56px + 48px);
        left: 0;
        right: 0;
        z-index: 99;
        padding: 5px 20px;
        height: 64px;
        background: rgb(var(--mdui-color-background));
        box-sizing: border-box;
    }

    @media (min-aspect-ratio: 1.001/1) {
        .search-input {
            left: 80px; /* navigation rail width */
        }
    }

    div.search-input {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        justify-content: space-between;
        text-align: center;
    }
    div.search-input > div {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .challenge-life-summary {
        flex: 1;
        min-width: 0;
        justify-content: flex-start !important;
        overflow-x: auto;
        white-space: nowrap;
    }

    .challenge-life-value {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        color: rgb(var(--mdui-color-primary));
        font-size: 1rem;
        font-weight: 700;
    }

    .challenge-life-value mdui-icon {
        font-size: 1.3rem;
    }

    .challenge-life-value small {
        font-size: 0.72rem;
    }

    .challenge-life-value.pending,
    .challenge-life-rules {
        color: rgb(var(--mdui-color-on-surface-variant));
    }

    .challenge-life-rules {
        font-size: 0.85rem;
    }

    .card-container {
        padding: 5px 20px;
        min-height: 50vh;
        padding-bottom: calc(56px + 1rem);
    }

    @media (min-aspect-ratio: 1.001/1) {
        .card-container {
            padding-bottom: 1rem;
        }
    }

    .score-grid-wrapper {
        width: 100%;
        overflow: visible;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0;
    }

    .score-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, 210px);
        gap: 15px;
        width: 100%;
        justify-content: center;
        box-sizing: border-box;
    }

    /* 牌子分类使用紧凑布局 */
    .score-grid:has(.score-cell-compact) {
        grid-template-columns: repeat(auto-fill, 100px);
        gap: 10px;
    }

    .score-cell {
        display: flex;
        justify-content: center;
        width: 210px;
        box-sizing: border-box;
        padding: 0;
        height: auto;
    }

    .score-cell-compact {
        width: 100px;
    }

    .course-missing-card {
        display: flex;
        min-height: 95px;
        overflow: hidden;
        width: 100%;
    }

    .course-missing-card > img {
        object-fit: cover;
        width: 40%;
    }

    .course-missing-card > div {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 4px;
        justify-content: center;
        min-width: 0;
        padding: 8px;
        text-align: left;
    }

    .course-missing-card strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .course-missing-card span,
    .course-missing-card small {
        color: rgb(var(--mdui-color-on-surface-variant));
    }

    .grouped-container {
        width: 100%;
    }

    .group-wrapper {
        scroll-margin-top: 180px;
    }

    .section-title {
        width: 100%;
        margin-top: 10px;
        margin-bottom: 10px;
        text-align: left;
        font-size: 1.5rem;
        font-weight: bold;
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 15px;
        color: var(--text-primary-color, inherit);
        cursor: pointer;
    }

    @media (max-width: 768px) {
        .section-title {
            flex-direction: column;
            align-items: flex-start;
            gap: 5px;
        }
        .stats-info {
            margin-left: 5px;
            font-size: 0.8rem;
        }
        .score-section {
            padding: 0 !important;
        }
        :deep(.score-section) {
            padding: 0 !important;
        }
    }

    .section-count {
        font-size: 0.9rem;
        font-weight: normal;
        color: var(--text-secondary-color, #888);
    }

    .stats-info {
        font-size: 0.9rem;
        font-weight: normal;
        color: var(--text-secondary-color, #888);
        display: inline-flex;
        flex-wrap: wrap;
        gap: 10px;
    }

    .stat-item {
        white-space: nowrap;
    }

    @media (min-width: 1254px) {
        .score-grid {
            grid-template-columns: repeat(5, 210px);
            justify-content: center;
        }
        .score-grid:has(.score-cell-compact) {
            grid-template-columns: repeat(9, 100px);
        }
    }

    @media (max-width: 1253px) and (min-width: 1000px) {
        .score-grid {
            grid-template-columns: repeat(4, 210px);
            justify-content: center;
        }
        .score-grid:has(.score-cell-compact) {
            grid-template-columns: repeat(8, 100px);
        }
    }

    @media (max-width: 999px) and (min-width: 768px) {
        .score-grid {
            grid-template-columns: repeat(3, 210px);
            justify-content: center;
        }
        .score-grid:has(.score-cell-compact) {
            grid-template-columns: repeat(7, 100px);
        }
    }

    @media (max-width: 767px) and (min-width: 500px) {
        .score-grid {
            grid-template-columns: repeat(2, 210px);
            justify-content: center;
        }
        .score-grid:has(.score-cell-compact) {
            grid-template-columns: repeat(5, 100px);
        }
    }

    @media (max-width: 499px) {
        .score-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            transform: none;
            width: 100%;
            justify-content: center;
        }
        .score-grid:has(.score-cell-compact) {
            grid-template-columns: repeat(3, 100px);
        }
        .score-cell {
            width: 100%;
            min-width: 0;
            box-sizing: border-box;
            padding: 0;
        }
        .score-cell-compact {
            width: 100px;
        }
    }

    @media (max-width: 349px) {
        .score-grid {
            grid-template-columns: 210px;
            justify-content: center;
        }
        .score-grid:has(.score-cell-compact) {
            grid-template-columns: repeat(3, 100px);
        }
        .score-cell {
            width: 210px;
        }
        .score-cell-compact {
            width: 100px;
        }
    }

    .loading-indicator {
        text-align: center;
        padding: 20px;
        margin-top: 20px;
        width: 100%;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        grid-column: 1 / -1;
    }

    .loading-text {
        color: #666;
        margin-bottom: 10px;
    }

    .songs-loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 300px;
        gap: 16px;
        width: 100%;
        box-sizing: border-box;
    }
    .songs-loading-container .loading-text {
        font-size: 16px;
        color: var(--mdui-color-on-background);
        opacity: 0.7;
    }
</style>
