<script setup lang="ts">
    import { ref, onMounted, computed, watch, onUnmounted } from "vue";
    import type { User } from "@/types/user";
    import type { Chart } from "@/types/music";
    import { MusicSort } from "@/assets/music";
    import ScoreCard from "@/components/chart/ScoreCard.vue";
    import ChartInfoDialog from "@/components/chart/ChartInfo.vue";
    import { getMusicInfoAsync } from "@/assets/music";
    import { useShared } from "@/utils/shared";
    import { prompt, confirm, snackbar } from "mdui";
    import { markDialogOpen, markDialogClosed } from "@/components/router.vue";

    declare global {
        interface Window {
            spec: {
                currentVersionBuildTime: string;
            };
        }
    }

    enum Category {
        InGame = "难度",
        Favorite = "收藏夹",
    }

    const shared = useShared();
    const difficulties = [
        "ALL",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "7+",
        "8",
        "8+",
        "9",
        "9+",
        "10",
        "10+",
        "11",
        "11+",
        "12",
        "12+",
        "13",
        "13+",
        "14",
        "14+",
        "15",
        // 宴会場
        "11?",
        "12?",
        "12+?",
        "13?",
        "13+?",
        "14?",
        "14+?",
    ];
    const query = ref<string>("");
    const chartInfoDialog = ref({
        open: false,
        chart: null,
    });
    const loadedIdentifier = {
        name: "",
        updateTime: 0,
        // verBuildTime: 0,
    };

    const category = ref<Category>(Category.InGame);
    const tabs = computed(() => {
        if (category.value === Category.InGame) return difficulties;
        if (category.value === Category.Favorite) return shared.favorites.map(f => f.name);
    });
    const selectedTab = ref({
        [Category.InGame]: "ALL",
        [Category.Favorite]: shared.favorites[0]?.name || "",
    });

    const selectedDifficulty = computed(() => selectedTab.value[category.value]);

    function getRandomChart() {
        if (!chartListFiltered.value) return null;
        const charts = chartListFiltered.value[selectedDifficulty.value] || [];
        if (charts.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * charts.length);
        return charts[randomIndex];
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
            constant: 0,
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

    async function loadChartsWithCache(userData?: User | null) {
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

        const charts: Chart[] = [];
        for (const i in musicInfo.chartList) {
            const chart: Chart = musicInfo.chartList[i];
            // 仅在用户成绩字段齐全且类型匹配时赋值，否则保持原结构
            let chartScore: Chart["score"] = undefined;
            if (userData?.data?.detailed) {
                const d = userData.data.detailed[`${chart.music.id}-${chart.info.grade}`];
                if (
                    d &&
                    typeof d.achievements === "number" &&
                    d.fc !== undefined &&
                    d.fs !== undefined &&
                    d.rate !== undefined
                ) {
                    chartScore = {
                        achievements: d.achievements,
                        comboStatus: d.fc,
                        syncStatus: d.fs,
                        rankRate: d.rate,
                        deluxeRating: d.ra,
                        deluxeScore: d.dxScore,
                    };
                }
            }
            charts.push({
                ...chart,
                score: chartScore,
            });
        }

        charts.sort(
            (a, b) =>
                MusicSort.indexOf(b.music.id) +
                b.info.grade * 100000 -
                MusicSort.indexOf(a.music.id) -
                a.info.grade * 100000
        );

        if (userData?.data?.detailed) {
            charts.sort((a, b) => {
                const chartDataA = userData?.data?.detailed?.[`${a.music.id}-${a.info.grade}`];
                const chartDataB = userData?.data?.detailed?.[`${b.music.id}-${b.info.grade}`];
                if (chartDataA?.achievements && chartDataB?.achievements)
                    return chartDataB.achievements - chartDataA.achievements;
                if (chartDataA?.achievements) return -1;
                if (chartDataB?.achievements) return 1;
                return 0;
            });
        }

        if (userData)
            shared.chartsSort = {
                identifier: currentIdentifier,
                charts: charts,
            };
    }
    const chartListFiltered = computed(() => {
        if (!shared.chartsSort.charts.length) return null;

        let filteredCharts: Chart[];

        // 根据当前分类模式筛选曲目
        if (category.value === Category.InGame) {
            // 游戏内难度模式
            if (selectedDifficulty.value === "ALL") {
                filteredCharts = shared.chartsSort.charts.filter(
                    (chart: Chart) => chart.info.grade === 3
                );
            } else {
                filteredCharts = shared.chartsSort.charts.filter(
                    (chart: Chart) => chart.info.level === selectedDifficulty.value
                );
            }
        } else if (category.value === Category.Favorite) {
            // 收藏夹模式
            const currentFavorite = shared.favorites.find(f => f.name === selectedDifficulty.value);
            if (!currentFavorite) {
                filteredCharts = [];
            } else {
                // 根据收藏夹中的曲目ID和难度筛选
                const favoriteChartIds = new Set(
                    currentFavorite.charts.map(fc => `${fc.i}-${fc.d}`)
                );
                filteredCharts = shared.chartsSort.charts.filter((chart: Chart) =>
                    favoriteChartIds.has(`${chart.music.id}-${chart.info.grade}`)
                );
            }
        } else {
            filteredCharts = [];
        }

        // 先给所有符合难度条件的曲目添加原始排序索引
        const chartsWithOriginalIndex = filteredCharts.map((chart, index) => {
            if (!chart.score) {
                chart.score = {
                    rankRate: "" as any,
                    achievements: 0,
                    comboStatus: "" as any,
                    syncStatus: "" as any,
                    deluxeScore: 0,
                    deluxeRating: 0,
                    index: {
                        all: {
                            index: filteredCharts.length - index,
                            total: filteredCharts.length,
                        },
                        difficult: {
                            index: filteredCharts.length - index,
                            total: filteredCharts.length,
                        },
                    },
                };
            } else {
                chart.score.index = {
                    all: {
                        index: filteredCharts.length - index,
                        total: filteredCharts.length,
                    },
                    difficult: {
                        index: filteredCharts.length - index,
                        total: filteredCharts.length,
                    },
                };
            }
            return chart;
        });

        let finalFilteredCharts = chartsWithOriginalIndex;

        if (query.value) {
            finalFilteredCharts = chartsWithOriginalIndex.filter((chart: any) => {
                const chartData = chart.score;
                return (
                    // 曲名 曲师 谱师 别名
                    chart.music.info.title.toLowerCase().includes(query.value.toLowerCase()) ||
                    chart.music.info.artist.toLowerCase().includes(query.value.toLowerCase()) ||
                    chart.info.charter.toLowerCase().includes(query.value.toLowerCase()) ||
                    (chart.music.info.aliases &&
                        chart.music.info.aliases
                            .join()
                            .toLowerCase()
                            .includes(query.value.toLowerCase())) ||
                    chart.music.info.id.toString() === query.value ||
                    (chartData &&
                        // 达成率 fc sync
                        (chartData.achievements?.toString().includes(query.value) ||
                            chartData.comboStatus?.toString().includes(query.value) ||
                            chartData.syncStatus?.toString().includes(query.value)))
                );
            });
        }

        // 使用原始排序索引而不是重新计算
        const chartsWithIndex = finalFilteredCharts.map((chart, index) => {
            chart.score!.index!.queried = {
                index: filteredCharts.length - index,
                total: filteredCharts.length,
            };
            return chart;
        });

        return { [selectedDifficulty.value]: chartsWithIndex };
    });

    const loadPlayerData = async () => {
        if (shared.users[0]) loadChartsWithCache(shared.users[0]);
        else loadChartsWithCache();
    };

    function openChartInfoDialog(chart: any) {
        chartInfoDialog.value.chart = chart;
        chartInfoDialog.value.open = !chartInfoDialog.value.open;
    }

    const itemsToRender = computed(() => {
        if (!chartListFiltered.value) return [];
        return chartListFiltered.value[selectedDifficulty.value] || [];
    });

    // 虚拟滚动状态管理
    const visibleItemsCount = ref(0);

    // 根据屏幕宽度计算每次加载的项目数
    const getLoadSize = () => {
        const width = window.innerWidth;

        // 根据屏幕宽度确定列数
        let columns = 1;
        if (width >= 1254) columns = 5;
        else if (width >= 1000) columns = 4;
        else if (width >= 768) columns = 3;
        else if (width >= 500) columns = 2;
        else if (width >= 350) columns = 2;

        // 计算行数和总加载数量
        const rowsPerPage = Math.max(Math.floor(window.innerHeight / 200), 2);
        return columns * rowsPerPage * 3; // 一次加载3页的量
    };

    const maxVisibleItems = computed(() =>
        Math.min(visibleItemsCount.value, itemsToRender.value.length)
    );

    // 加载更多项目
    const loadMore = () => {
        const remainingItems = itemsToRender.value.length - visibleItemsCount.value;
        if (remainingItems > 0) {
            const loadSize = Math.min(getLoadSize(), remainingItems);
            visibleItemsCount.value += loadSize;
        }
    };

    // 滚动事件处理
    const handleScroll = (event: Event) => {
        const target = event.target as HTMLElement;
        // 检查是否接近底部（距离底部200px时触发）
        if (target.scrollTop + target.clientHeight >= target.scrollHeight - 200) {
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
    });

    watch(category, newCategory => {
        // 切换分类时，重置到该分类的默认选项
        if (newCategory === Category.InGame) {
            selectedTab.value[Category.InGame] = "ALL";
        } else if (newCategory === Category.Favorite) {
            selectedTab.value[Category.Favorite] = shared.favorites[0]?.name || "";
        }
        visibleItemsCount.value = getLoadSize();
    });

    onMounted(async () => {
        await loadPlayerData();
        visibleItemsCount.value = getLoadSize();
        window.addEventListener("resize", handleResize);
    });

    onUnmounted(() => {
        window.removeEventListener("resize", handleResize);
    });

    // 新增收藏夹
    function newFavList() {
        prompt({
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
        });
    }
    function importFavList() {
        prompt({
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
                        prompt({
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
                        });
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
        });
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
        prompt({
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
        });
    }
    function deleteFavList() {
        if (shared.favorites.length === 0) return;
        const currentFavorite = shared.favorites.find(
            f => f.name === selectedTab.value[Category.Favorite]
        );
        if (!currentFavorite) return;
        confirm({
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
        });
    }
</script>

<template>
    <!-- [游戏排序]难度选单 -->
    <div class="category-bar">
        <mdui-dropdown>
            <mdui-chip slot="trigger" end-icon="keyboard_arrow_down">{{ category }}</mdui-chip>
            <mdui-menu>
                <mdui-menu-item
                    @click="category = item"
                    v-for="(item, index) in Object.values(Category)"
                    :key="index"
                    :style="{
                        backgroundColor:
                            category == item ? 'rgba(var(--mdui-color-primary),12%)' : '',
                    }"
                    :icon="category == item ? 'check' : ''"
                >
                    {{ item }}
                </mdui-menu-item>
            </mdui-menu>
        </mdui-dropdown>
        <mdui-tabs :value="selectedDifficulty">
            <mdui-tab
                v-for="tab in tabs"
                :key="tab"
                :value="tab"
                @click="selectedTab[category] = tab"
            >
                {{ tab }}
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

    <mdui-text-field
        id="search-input"
        clearable
        icon="search"
        label="搜索"
        placeholder="曲名 别名 id 曲师 谱师"
        @input="query = $event.target.value"
    ></mdui-text-field>

    <div class="card-container" v-if="chartListFiltered" @scroll="handleScroll">
        <div class="score-grid-wrapper">
            <div class="score-grid">
                <ScoreCard
                    v-if="category !== Category.Favorite || shared.favorites.length > 0"
                    cover="/icons/random.png"
                    :data="randomChartDummy"
                    @click="openChartInfoDialog(getRandomChart())"
                />
                <div
                    v-for="(chart, index) in itemsToRender.slice(0, maxVisibleItems)"
                    :key="`score-cell-${index}`"
                    class="score-cell"
                >
                    <ScoreCard
                        :data="chart"
                        @click="openChartInfoDialog(chart)"
                        :rating="category == Category.Favorite ? index + 1 : `${itemsToRender.length - index}/${itemsToRender.length + 1}`"
                    />
                </div>

                <div v-if="maxVisibleItems < itemsToRender.length" class="loading-indicator">
                    <div class="loading-text">正在加载更多...</div>
                    <mdui-button variant="text" @click="loadMore">点击加载</mdui-button>
                </div>
            </div>
        </div>
    </div>

    <ChartInfoDialog :open="chartInfoDialog.open" :chart="chartInfoDialog.chart" />
</template>

<style scoped>
    .category-bar {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        padding: 0 10px;
        gap: 10px;
        overflow: hidden;
    }

    mdui-tabs {
        flex: 1;
        min-width: 0;
        overflow-x: auto;
        overflow-y: hidden;
    }

    #search-input {
        padding: 5px 20px;
    }

    .card-container {
        padding: 5px 20px;
        overflow-y: auto;
        height: calc(100vh - 76px - 11.75rem);

        @supports (-webkit-touch-callout: none) {
            @media all and (display-mode: standalone) {
                height: calc(100vh - 76px - 12.75rem);
            }
        }
        @media (min-aspect-ratio: 1.001/1) {
            height: calc(100vh - 76px - 6.75rem);
        }
    }

    .score-grid-wrapper {
        width: 100%;
        overflow: visible;
    }

    .score-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, 210px);
        gap: 15px;
        margin-top: 20px;
        width: 100%;
        justify-content: center;
        box-sizing: border-box;
    }

    .score-cell {
        display: flex;
        justify-content: center;
        width: 210px;
        box-sizing: border-box;
        padding: 0;
        height: auto;
    }

    @media (min-width: 1254px) {
        .score-grid {
            grid-template-columns: repeat(5, 210px);
            justify-content: center;
        }
    }

    @media (max-width: 1253px) and (min-width: 1000px) {
        .score-grid {
            grid-template-columns: repeat(4, 210px);
            justify-content: center;
        }
    }

    @media (max-width: 999px) and (min-width: 768px) {
        .score-grid {
            grid-template-columns: repeat(3, 210px);
            justify-content: center;
        }
    }

    @media (max-width: 767px) and (min-width: 500px) {
        .score-grid {
            grid-template-columns: repeat(2, 210px);
            justify-content: center;
        }
    }

    @media (max-width: 499px) {
        .score-grid-wrapper {
            display: flex;
            justify-content: center;
            align-items: flex-start;
            height: auto;
            overflow: visible;
        }
        .score-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            transform: none;
            width: 100%;
            margin: 0;
            justify-content: center;
        }
        .score-cell {
            width: 100%;
            min-width: 0;
            box-sizing: border-box;
            padding: 0;
        }
    }

    @media (max-width: 349px) {
        .score-grid {
            grid-template-columns: 210px;
            justify-content: center;
        }
        .score-cell {
            width: 210px;
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
</style>
