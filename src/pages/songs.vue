<script setup lang="ts">
    import { ref, onMounted, computed, watch, onUnmounted } from "vue";
    import { useRoute } from "vue-router";
    import type { User } from "@/components/data/user/type";
    import type { Chart, ChartScore } from "@/components/data/music/type";
    import { MusicSort } from "@/components/data/music";
    import ScoreCard from "@/components/data/chart/ScoreCard.vue";
    import ChartInfoDialog from "@/components/data/chart/ChartInfo.vue";
    import { getMusicInfoAsync, maimaiVersionsCN } from "@/components/data/music";
    import { useShared } from "@/components/app/shared";
    import { prompt, confirm, snackbar } from "mdui";
    import { markDialogOpen, markDialogClosed } from "@/components/app/router.vue";
    import { versionPlates } from "@/components/data/collection";
    import { checkChartFinish } from "@/components/data/collection/versionPlate";
    import type { VersionPlate } from "@/components/data/collection/type";
    import { ComboStatus, RankRate, SyncStatus } from "@/components/data/maiTypes";

    declare global {
        interface Window {
            spec: {
                currentVersionBuildTime: string;
            };
        }
    }

    enum Category {
        InGame = "难度",
        Version = "版本",
        Favorite = "收藏夹",
        Banquet = "宴会场",
    }

    type VersionPlateCategory = keyof typeof versionPlates;

    const route = useRoute();
    const shared = useShared();
    const userId = ref(route.params.id as string);
    // prettier-ignore
    const difficulties = [ "ALL","1","2","3","4","5","6","7","7+","8","8+","9","9+","10","10+","11","11+","12","12+","13","13+","14","14+","15", ];
    const banquetDifficulties = ["11?", "12?", "12+?", "13?", "13+?", "14?", "14+?"];
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

    const category = ref<Category | VersionPlateCategory>(Category.InGame);
    const tabs = computed(() => {
        if (category.value === Category.InGame) return difficulties;
        if (category.value === Category.Banquet) return banquetDifficulties;
        if (category.value === Category.Favorite) return shared.favorites.map(f => f.name);
        if (category.value === Category.Version) return maimaiVersionsCN;
        if (category.value in versionPlates) {
            const plateType = category.value as VersionPlateCategory;
            return versionPlates[plateType]?.map(plate => plate.name) || [];
        }
        return [];
    });
    const selectedTab = ref({
        [Category.InGame]: "ALL",
        [Category.Banquet]: banquetDifficulties[0],
        [Category.Favorite]: shared.favorites[0]?.name || "",
        [Category.Version]: maimaiVersionsCN[0] || "",
        // 为每个牌子类型添加默认选择
        ...Object.keys(versionPlates).reduce(
            (acc, key) => {
                const plateKey = key as VersionPlateCategory;
                acc[plateKey] = versionPlates[plateKey]?.[0]?.name || "";
                return acc;
            },
            {} as Record<VersionPlateCategory, string>
        ),
    });

    const selectedDifficulty = computed(() => selectedTab.value[category.value]);

    const plateFinishStatus = computed(() => {
        const plate: VersionPlate = versionPlates[
            category.value as keyof typeof versionPlates
        ]?.find(plate => plate.name === selectedDifficulty.value) as VersionPlate;
        const finishedItems = itemsToRender.value.filter(chart =>
            checkChartFinish(plate, chart.score as ChartScore)
        );

        return {
            plate,
            finishedItems,
            conditionText: plate.description
                .replace("FULL COMBO", "FC")
                .replace("FULL SYNC DX", "FSDX")
                .replace("ALL PERFECT", "AP")
                .replace("BASIC", "BAS")
                .replace("Re:Master", "ReM")
                .replace("MASTER", "MAS"),
        };
    });
    const plateFinishSort = ref("condition");
    function handlePlateSortChange(event: Event) {
        const target = event.target as HTMLSelectElement;

        if (target.value) plateFinishSort.value = target.value;
        else {
            // 阻止点击已经选择的项目时清空项目
            const previousValue = plateFinishSort.value;
            plateFinishSort.value = target.value;
            plateFinishSort.value = previousValue;
            // wtf
        }
    }

    const difficultyFilter = ref(3);

    function handleDifficultyFilterChange(event: Event) {
        const target = event.target as HTMLSelectElement;

        if (target.value) difficultyFilter.value = Number(target.value) - 1;
        else {
            // 阻止点击已经选择的项目时清空项目
            const previousValue = difficultyFilter.value;
            difficultyFilter.value = Number(target.value) - 1;
            difficultyFilter.value = previousValue;
        }
    }

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
                const playedA = typeof chartDataA?.achievements === "number";
                const playedB = typeof chartDataB?.achievements === "number";
                if (playedA && playedB) return chartDataB.achievements - chartDataA.achievements;
                if (playedA) return -1;
                if (playedB) return 1;
                return 0;
            });
        }

        shared.chartsSort = {
            identifier: currentIdentifier,
            charts: charts,
        };
    }
    const chartListFiltered = computed(() => {
        if (!shared.chartsSort.charts || !shared.chartsSort.charts.length) return null;

        let filteredCharts: Chart[];
        const allCharts: Chart[] = shared.chartsSort.charts.filter(
            (chart: Chart) => chart.info.grade === 3
        );

        // 根据当前分类模式筛选曲目
        if (category.value === Category.InGame) {
            // 游戏内难度模式
            if (selectedDifficulty.value === "ALL") {
                filteredCharts = shared.chartsSort.charts.filter(
                    (chart: Chart) => chart.info.grade === difficultyFilter.value
                );
            } else {
                filteredCharts = shared.chartsSort.charts.filter(
                    (chart: Chart) => chart.info.level === selectedDifficulty.value
                );
            }
        } else if (category.value === Category.Banquet) {
            // 宴会场模式
            if (selectedDifficulty.value === "ALL") {
                filteredCharts = shared.chartsSort.charts.filter(
                    (chart: Chart) => chart.info.grade === 3 && chart.info.level.endsWith("?")
                );
            } else {
                filteredCharts = shared.chartsSort.charts.filter(
                    (chart: Chart) => chart.info.level === selectedDifficulty.value
                );
            }
        } else if (category.value === Category.Version) {
            // 版本模式
            // 创建版本名称映射
            const versionMapping: Record<string, string> = {
                Maimai: "maimai",
                "Maimai PLUS": "maimai PLUS",
                "Maimai GreeN": "maimai GreeN",
                "Maimai GreeN PLUS": "maimai GreeN PLUS",
                "Maimai ORANGE": "maimai ORANGE",
                "Maimai ORANGE PLUS": "maimai ORANGE PLUS",
                "Maimai PiNK": "maimai PiNK",
                "Maimai PiNK PLUS": "maimai PiNK PLUS",
                "Maimai MURASAKi": "maimai MURASAKi",
                "Maimai MURASAKi PLUS": "maimai MURASAKi PLUS",
                "Maimai MiLK": "maimai MiLK",
                "Maimai MiLK PLUS": "MiLK PLUS",
                "Maimai FiNALE": "maimai FiNALE",
                舞萌DX: "maimai でらっくす",
                "舞萌DX 2021": "舞萌DX 2021",
                "舞萌DX 2022": "舞萌DX 2022",
                "舞萌DX 2023": "舞萌DX 2023",
                "舞萌DX 2024": "舞萌DX 2024",
                "舞萌DX 2025": "舞萌DX 2025",
            };

            const targetVersion =
                versionMapping[selectedDifficulty.value] || selectedDifficulty.value;
            filteredCharts = shared.chartsSort.charts.filter(
                (chart: Chart) =>
                    (chart.music.info.from as unknown as string) === targetVersion &&
                    chart.info.grade === difficultyFilter.value
            );
        } else if (category.value === Category.Favorite) {
            // 收藏夹模式
            const currentFavorite = shared.favorites.find(f => f.name === selectedDifficulty.value);
            if (!currentFavorite) {
                filteredCharts = [];
            } else {
                // 根据收藏夹中的曲目ID和指定难度筛选
                const favoriteChartIds = new Set(
                    currentFavorite.charts.map(fc => `${fc.i}-${difficultyFilter.value}`)
                );
                filteredCharts = shared.chartsSort.charts.filter((chart: Chart) =>
                    favoriteChartIds.has(`${chart.music.id}-${chart.info.grade}`)
                );
            }
        } else if (category.value in versionPlates) {
            // 牌子模式
            const plateType = category.value as VersionPlateCategory;
            // 通过第一个字找到完整的牌子名称
            const selectedPlate = versionPlates[plateType]?.find(
                plate => plate.name === selectedDifficulty.value
            );

            if (!selectedPlate) {
                filteredCharts = [];
            } else {
                // 获取该牌子包含的所有曲目ID和需要的难度
                const plateSongIds = new Set(selectedPlate.songs);
                const requiredDifficulties = new Set(selectedPlate.difficulties);

                // 筛选出该牌子包含的曲目，且只包含指定难度的谱面
                filteredCharts = shared.chartsSort.charts.filter(
                    (chart: Chart) =>
                        plateSongIds.has(chart.music.id) &&
                        requiredDifficulties.has(chart.info.grade)
                );

                // 按照牌子的达成条件进行排序
                if (plateFinishSort.value === "constant-desc") {
                    // 按定数排序（从高到低）
                    filteredCharts.sort((a, b) => {
                        const constantA = a.info.constant || 0;
                        const constantB = b.info.constant || 0;
                        return constantB - constantA;
                    });
                } else if (plateFinishSort.value === "constant-asc") {
                    // 按定数排序（从低到高）
                    filteredCharts.sort((a, b) => {
                        const constantA = a.info.constant || 0;
                        const constantB = b.info.constant || 0;
                        return constantA - constantB;
                    });
                } else {
                    // 按条件排序（原有逻辑）
                    filteredCharts.sort((a, b) => {
                        const scoreA = a.score;
                        const scoreB = b.score;

                        if (!scoreA && !scoreB) return 0;
                        if (!scoreA) return 1;
                        if (!scoreB) return -1;

                        const completedA = checkChartFinish(selectedPlate, scoreA);
                        const completedB = checkChartFinish(selectedPlate, scoreB);

                        // 已完成的排在前面
                        if (completedA && !completedB) return -1;
                        if (!completedA && completedB) return 1;

                        // 同样完成状态下按达成率排序
                        if (
                            typeof scoreA.achievements === "number" &&
                            typeof scoreB.achievements === "number"
                        ) {
                            return scoreB.achievements - scoreA.achievements;
                        }

                        return 0;
                    });
                }
            }
        } else {
            filteredCharts = [];
        }

        // 先给所有符合难度条件的曲目添加原始排序索引
        const chartsWithOriginalIndex = filteredCharts.map((chart, index) => {
            if (!chart.score) {
                chart.score = {
                    rankRate: "" as any,
                    achievements: null,
                    comboStatus: "" as any,
                    syncStatus: "" as any,
                    deluxeScore: 0,
                    deluxeRating: 0,
                    index: {
                        all: {
                            index: allCharts.length - allCharts.indexOf(chart),
                            total: allCharts.length,
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
                        index: allCharts.length - allCharts.indexOf(chart),
                        total: allCharts.length,
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

    const compactMode = computed<"rankRate" | "comboStatus" | "syncStatus" | undefined>(() => {
        if (category.value === "極" || category.value === "神") return "comboStatus";
        if (category.value === "将") return "rankRate";
        if (category.value === "舞舞") return "syncStatus";
        return undefined;
    });
    const compactFilter = computed<ComboStatus | RankRate | SyncStatus | undefined>(() => {
        if (category.value === "極") return ComboStatus.FullCombo;
        if (category.value === "将") return RankRate.sss;
        if (category.value === "神") return ComboStatus.AllPerfect;
        if (category.value === "舞舞") return SyncStatus.FullSyncDX;
        return undefined;
    });

    const loadPlayerData = async () => {
        const targetUserId = userId.value ? Number(userId.value) : 0;
        if (shared.users[targetUserId]) loadChartsWithCache(shared.users[targetUserId]);
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
        // 滚动到顶部
        const container = document.querySelector(".card-container");
        if (container) {
            container.scrollTop = 0;
        }
    });

    watch(category, newCategory => {
        // 切换分类时，重置到该分类的默认选项
        if (newCategory === Category.InGame) {
            selectedTab.value[Category.InGame] = "ALL";
        } else if (newCategory === Category.Banquet) {
            selectedTab.value[Category.Banquet] = banquetDifficulties[0];
        } else if (newCategory === Category.Favorite) {
            selectedTab.value[Category.Favorite] = shared.favorites[0]?.name || "";
        } else if (newCategory === Category.Version) {
            selectedTab.value[Category.Version] = maimaiVersionsCN[0] || "";
        } else if (newCategory in versionPlates) {
            // 牌子分类
            const plateType = newCategory as VersionPlateCategory;
            selectedTab.value[plateType] = versionPlates[plateType]?.[0]?.name || "";
        }
        visibleItemsCount.value = getLoadSize();
    });

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
        const container = document.querySelector(".card-container");
        if (container) {
            container.scrollTop = 0;
        }
    });

    // 监听难度筛选变化，重新计算可视项目数
    watch(difficultyFilter, () => {
        visibleItemsCount.value = getLoadSize();
        // 滚动到顶部
        const container = document.querySelector(".card-container");
        if (container) {
            container.scrollTop = 0;
        }
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
    <div class="songs-page" :class="{ 'songs-page-fixed': userId }">
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

        <div v-if="category in versionPlates" class="search-input">
            <mdui-select
                style="width: 5rem"
                label="排序"
                :value="plateFinishSort"
                @change="handlePlateSortChange"
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
        <div
            v-else-if="
                (category === Category.InGame && selectedDifficulty === 'ALL') ||
                category === Category.Version ||
                category === Category.Favorite
            "
            class="search-input"
        >
            <mdui-select
                style="width: 4.1rem"
                label="难度"
                :value="difficultyFilter + 1"
                @change="handleDifficultyFilterChange"
            >
                <mdui-menu-item v-for="index in 5" :key="index" :value="index">
                    {{ ["BASIC", "ADVANCED", "EXPERT", "MASTER", "Re:MASTER"][index - 1] }}
                </mdui-menu-item>
            </mdui-select>
            <mdui-text-field
                clearable
                icon="search"
                label="搜索"
                placeholder="曲名 别名 id 曲师 谱师"
                @input="query = $event.target.value"
                style="flex: 1"
            ></mdui-text-field>
        </div>
        <mdui-text-field
            class="search-input"
            clearable
            icon="search"
            label="搜索"
            placeholder="曲名 别名 id 曲师 谱师"
            @input="query = $event.target.value"
            v-else
        ></mdui-text-field>

        <div
            class="card-container"
            :class="{ 'card-container-fixed': userId }"
            v-if="chartListFiltered"
            @scroll="handleScroll"
        >
            <div class="score-grid-wrapper">
                <div class="score-grid">
                    <ScoreCard
                        v-if="
                            !(category in versionPlates) &&
                            (category !== Category.Favorite || shared.favorites.length > 0)
                        "
                        cover="/icons/random.png"
                        :data="randomChartDummy"
                        @click="openChartInfoDialog(getRandomChart())"
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
                        />
                    </div>

                    <div v-if="maxVisibleItems < itemsToRender.length" class="loading-indicator">
                        <div class="loading-text">正在加载更多...</div>
                        <mdui-button variant="text" @click="loadMore">点击加载</mdui-button>
                    </div>
                </div>
            </div>
        </div>

        <ChartInfoDialog
            :open="chartInfoDialog.open"
            :chart="chartInfoDialog.chart"
            :targetUserId="userId"
        />
    </div>
</template>

<style scoped>
    /* 固定页面模式下的全局样式重写 */
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

    .search-input {
        padding: 5px 20px;
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

    /* 当页面为固定页面模式时（有用户ID参数） */
    .card-container-fixed {
        height: calc(100vh - 11.75rem) !important;

        @supports (-webkit-touch-callout: none) {
            @media all and (display-mode: standalone) {
                height: calc(100vh - 12.75rem) !important;
            }
        }
        @media (min-aspect-ratio: 1.001/1) {
            height: calc(100vh - 6.75rem) !important;
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
</style>
