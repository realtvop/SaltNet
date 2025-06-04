<script setup lang="ts">
    import { ref, computed, onMounted } from "vue";
    import { useRoute } from "vue-router";
    import ScoreSection from "@/components/ScoreSection.vue";
    import RatingPlate from "@/components/RatingPlate.vue";
    import ChartInfoDialog from "@/components/b50/ChartInfoDialog.vue";
    import type { User } from "@/types/user";
    import localForage from "localforage";
    import type { ChartExtended } from "@/types/music";
    import { musicInfo } from "@/assets/music";

    const route = useRoute();
    const userId = ref(route.params.id as string);
    const error = ref<string | null>(null);
    const pending = ref(false);
    const playerData = ref<User | null>(null);
    const musicChartMap = ref<Map<string, ChartExtended>>(new Map());

    // 构建高效查找表
    function buildMusicChartMap() {
        if (!musicInfo) return;
        const map = new Map();
        for (const chart of Object.values(musicInfo.chartList) as ChartExtended[]) {
            // key: `${song_id}-${level_index}`
            map.set(`${chart.music.id}-${chart.info.grade}`, chart);
        }
        musicChartMap.value = map;
    }
    buildMusicChartMap();

    const loadPlayerData = async (id: number) => {
        pending.value = true;
        error.value = null;
        playerData.value = null;

        localForage.getItem<User[]>("users").then(v => {
            if (v) playerData.value = v[id];
            pending.value = false;
        });
    };

    onMounted(() => {
        loadPlayerData(Number(userId.value ?? "0"));
    });

    const player = computed(() => {
        return playerData.value ?? null;
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
            .map((record: any) => musicChartMap.value.get(`${record.song_id}-${record.level_index}`))
            .filter((x): x is ChartExtended => !!x);
    });
    const b50DxCharts = computed(() => {
        if (!player.value?.data?.b50?.dx) return [];
        return player.value.data.b50.dx
            .map((record: any) => musicChartMap.value.get(`${record.song_id}-${record.level_index}`))
            .filter((x): x is ChartExtended => !!x);
    });

    const chartInfoDialog = ref({
        open: false,
        chart: null,
    });
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
                <span class="player-name">
                    {{ player.inGame?.name ?? player.divingFish?.name ?? "wmc" }}
                </span>
                <RatingPlate v-if="player.data.rating != null" :ra="player.data.rating" />
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

        <div v-else class="error-message">
            <h2>无法加载玩家数据</h2>
            <p>未能获取到有效的玩家信息，是不是还没有添加用户？</p>
        </div>
    </div>

    <ChartInfoDialog :open="chartInfoDialog.open" :chart="chartInfoDialog.chart"></ChartInfoDialog>
</template>

<style scoped>
    .player-profile {
        width: 100%;
        /* padding-top: 80px; */ /* 移除此行，由 App.vue 的 content-padding 处理 */
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
        align-items: flex-start;
        flex-direction: column;
        margin-bottom: 24px;
        gap: 16px;
        width: 100%;
        padding: 0 20px;
    }

    .player-name {
        font-size: 2em;
        font-weight: bold;
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
