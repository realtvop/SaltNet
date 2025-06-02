<script setup lang="ts">
    import { ref, onMounted, computed } from "vue";
    import type { User, ChartsSortCached } from "@/types/user";
    import localForage from "localforage";
    import type { Chart, ChartExtended } from "@/types/music";
    import MusicSort from "@/assets/MusicSort";
    import ScoreCard from "@/components/ScoreCard.vue";
    import ChartInfoDialog from "@/components/b50/ChartInfoDialog.vue";
    import { getMusicInfoAsync } from "@/assets/music";

    declare global {
        interface Window {
            spec: {
                currentVersionBuildTime: string;
            };
        }
    }

    const users = ref<User[]>([]);
    const allCharts = ref<ChartExtended[]>([]);
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
    const playerData = ref<User | null>(null);
    const query = ref<string>("");
    const chartInfoDialog = ref({
        open: false,
        chart: null,
    });

    localForage.getItem<User[]>("users").then(v => {
        if (Array.isArray(v)) users.value = v;
    });

    async function loadChartsWithCache(userData?: User | null) {
        const currentUser = userData || playerData.value;

        const currentIdentifier = {
            name: currentUser?.divingFish?.name || currentUser?.inGame?.name || "unknown",
            updateTime: currentUser?.data?.updateTime || 0,
            verBuildTime: parseInt(window.spec?.currentVersionBuildTime || "0"),
        };

        const cachedData = await localForage.getItem<ChartsSortCached>("chartsSortCached");
        if (
            cachedData &&
            cachedData.identifier.name === currentIdentifier.name &&
            cachedData.identifier.updateTime === currentIdentifier.updateTime &&
            cachedData.identifier.verBuildTime === currentIdentifier.verBuildTime
        ) {
            allCharts.value = cachedData.charts;
            return;
        }

        const musicInfo = await getMusicInfoAsync();
        if (!musicInfo) return;

        const charts: ChartExtended[] = [];
        for (const i in musicInfo.chartList) {
            const chart = musicInfo.chartList[i] as Chart;
            charts.push(chart);
        }

        charts.sort(
            (a, b) =>
                MusicSort.indexOf(b.music.id) +
                b.grade * 100000 -
                MusicSort.indexOf(a.music.id) -
                a.grade * 100000
        );

        if (currentUser?.data?.detailed) {
            charts.sort((a, b) => {
                const chartDataA = currentUser?.data?.detailed?.[`${a.music.id}-${a.grade}`];
                const chartDataB = currentUser?.data?.detailed?.[`${b.music.id}-${b.grade}`];
                if (chartDataA?.achievements && chartDataB?.achievements)
                    return chartDataB.achievements - chartDataA.achievements;
                if (chartDataA?.achievements) return -1;
                if (chartDataB?.achievements) return 1;
                return 0;
            });
        }

        allCharts.value = charts;

        const cacheData: ChartsSortCached = {
            identifier: currentIdentifier,
            charts: charts,
        };
        await localForage.setItem("chartsSortCached", cacheData);
    }
    const chartListFiltered = computed(() => {
        if (!allCharts.value.length) return null;

        let filteredCharts: ChartExtended[];

        if (selectedDifficulty.value === "ALL") {
            filteredCharts = allCharts.value.filter(chart => chart.grade === 3);
        } else {
            filteredCharts = allCharts.value.filter(
                chart => chart.level === selectedDifficulty.value
            );
        }

        // 先给所有符合难度条件的曲目添加原始排序索引
        const chartsWithOriginalIndex = filteredCharts.map((chart, index) => ({
            ...chart,
            originalIndex: filteredCharts.length - index,
            totalInDifficulty: filteredCharts.length,
        }));

        let finalFilteredCharts = chartsWithOriginalIndex;

        if (query.value) {
            finalFilteredCharts = chartsWithOriginalIndex.filter((chart: any) => {
                const chartData = playerData.value?.data.detailed
                    ? playerData.value?.data.detailed[`${chart.music.id}-${chart.grade}`]
                    : null;
                return (
                    // 曲名 曲师 谱师 别名
                    chart.music.title.toLowerCase().includes(query.value.toLowerCase()) ||
                    chart.music.artist.toLowerCase().includes(query.value.toLowerCase()) ||
                    chart.charter.toLowerCase().includes(query.value.toLowerCase()) ||
                    (chart.music.aliases &&
                        chart.music.aliases
                            .join()
                            .toLowerCase()
                            .includes(query.value.toLowerCase())) ||
                    (chartData &&
                        // 达成率 fc sync
                        (chartData.achievements.toString().includes(query.value) ||
                            chartData.fc.toString().includes(query.value) ||
                            chartData.fs.toString().includes(query.value)))
                );
            });
        }

        // 使用原始排序索引而不是重新计算
        const chartsWithIndex = finalFilteredCharts.map(chart => ({
            ...chart,
            index: `${chart.originalIndex}/${chart.totalInDifficulty}`,
        }));

        return { [selectedDifficulty.value]: chartsWithIndex };
    });

    const loadPlayerData = async () => {
        playerData.value = null;

        localForage.getItem<User[]>("users").then(async v => {
            if (!v) return;
            playerData.value = v[0];
            await loadChartsWithCache(v[0]);
        });
    };
    onMounted(async () => {
        await loadChartsWithCache();
        await loadPlayerData();
    });

    function genScoreCardData(chart: ChartExtended): any {
        const chartData = playerData.value?.data.detailed
            ? playerData.value?.data.detailed[`${chart.music.id}-${chart.grade}`]
            : null;
        return {
            ...chart,
            song_id: chart.music.id,
            achievements:
                chartData && typeof chartData.achievements === "number"
                    ? chartData.achievements
                    : null,
            ra: chart.index ?? "",
            rate: chartData && chartData.rate ? chartData.rate : "",
            fc: chartData && chartData.fc ? chartData.fc : "",
            fs: chartData && chartData.fs ? chartData.fs : "",
            title: chart.music.title,
        };
    }

    function openChartInfoDialog(chart: any) {
        chartInfoDialog.value.chart = chart;
        chartInfoDialog.value.open = !chartInfoDialog.value.open;
    }
</script>

<template>
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
    <div class="card-container" v-if="chartListFiltered">
        <mdui-text-field
            clearable
            icon="search"
            label="搜索"
            placeholder="曲名 别名 曲师 谱师"
            @input="query = $event.target.value"
        ></mdui-text-field>
        <div class="score-grid-wrapper">
            <div class="score-grid">
                <div
                    v-for="(chart, index) in chartListFiltered[selectedDifficulty]"
                    :key="`score-cell-${index}`"
                    class="score-cell"
                >
                    <ScoreCard
                        :data="genScoreCardData(chart)"
                        @click="openChartInfoDialog(genScoreCardData(chart))"
                    />
                </div>
            </div>
        </div>
    </div>
    <ChartInfoDialog :open="chartInfoDialog.open" :chart="chartInfoDialog.chart" />
</template>

<style scoped>
    mdui-tabs {
        width: 100%;
    }

    .card-container {
        padding: 5px 20px;
    }
    /* mdui-card {
    width: 100%;
    height: 100px;
} */

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
        .score-section {
            padding: 0 20px;
            overflow: visible;
        }
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
    }

    @media (max-width: 349px) {
        .score-grid {
            grid-template-columns: 210px;
            justify-content: center;
        }
        .score-cell {
            width: 210px;
        }
        .score-section {
            padding: 0 20px;
        }
    }
</style>
