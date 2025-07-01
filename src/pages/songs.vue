<script setup lang="ts">
    import { ref, onMounted, computed, watch, onUnmounted } from "vue";
    import type { User } from "@/types/user";
    import type { Chart } from "@/types/music";
    import { MusicSort } from "@/assets/music";
    import ScoreCard from "@/components/chart/ScoreCard.vue";
    import ChartInfoDialog from "@/components/chart/ChartInfo.vue";
    import { getMusicInfoAsync } from "@/assets/music";
    import { useShared } from "@/utils/shared";

    declare global {
        interface Window {
            spec: {
                currentVersionBuildTime: string;
            };
        }
    }

    const shared = useShared();
    const selectedDifficulty = ref<string>("ALL");
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

            shared.chartsSort.charts = shared.chartsSort.charts;
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
                        // TODO
                        deluxeScore: 0,
                        deluxeRating: 0,
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

        if (selectedDifficulty.value === "ALL") {
            filteredCharts = shared.chartsSort.charts.filter(
                (chart: Chart) => chart.info.grade === 3
            );
        } else {
            filteredCharts = shared.chartsSort.charts.filter(
                (chart: Chart) => chart.info.level === selectedDifficulty.value
            );
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

    onMounted(async () => {
        await loadPlayerData();
        visibleItemsCount.value = getLoadSize();
        window.addEventListener('resize', handleResize);
    });

    onUnmounted(() => {
        window.removeEventListener('resize', handleResize);
    });
</script>

<template>
    <!-- [游戏排序]难度选单 -->
    <mdui-tabs :value="selectedDifficulty">
        <mdui-tab
            v-for="difficulty in difficulties"
            :key="difficulty"
            :value="difficulty"
            @click="selectedDifficulty = difficulty"
        >
            {{ difficulty }}
        </mdui-tab>
    </mdui-tabs>

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
                <div
                    v-for="(chart, index) in itemsToRender.slice(0, maxVisibleItems)"
                    :key="`score-cell-${index}`"
                    class="score-cell"
                >
                    <ScoreCard :data="chart" @click="openChartInfoDialog(chart)" />
                </div>

                <div v-if="maxVisibleItems < itemsToRender.length" class="loading-indicator">
                    <div class="loading-text">正在加载更多...</div>
                    <mdui-button variant="text" @click="loadMore">
                        点击加载
                    </mdui-button>
                </div>
            </div>
        </div>
    </div>

    <ChartInfoDialog
        :open="chartInfoDialog.open"
        :chart="chartInfoDialog.chart"
    />
</template>

<style scoped>
    mdui-tabs {
        width: 100%;
    }

    #search-input {
        padding: 5px 20px;
    }

    .card-container {
        padding: 5px 20px;
        min-height: 600px;
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
