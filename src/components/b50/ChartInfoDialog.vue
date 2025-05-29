<template>
    <mdui-dialog ref="dialogRef" close-on-esc close-on-overlay-click :open="open" v-if="chart">
        <mdui-top-app-bar slot="header">
            <mdui-button-icon icon="close" @click="dialogRef.open = false"></mdui-button-icon>
            <mdui-top-app-bar-title @click="copyToClipboard(chart?.music?.title || '')" style="cursor:pointer">{{ chart?.music?.title || '' }}</mdui-top-app-bar-title>
        </mdui-top-app-bar>

        <img class="song-cover" :src="chart?.music ? `https://www.diving-fish.com/covers/${'0'.repeat(5 - chart.music.id.toString().length)}${chart.music.id}.png` : ''" />

        <div class="chip-container" v-if="chart?.music" center>
            <mdui-chip icon="music_note" @click="copyToClipboard(chart.music.artist || '未知')" style="cursor:pointer">{{ chart.music.artist || '未知' }}</mdui-chip>
            <mdui-chip icon="access_time_filled" style="cursor:pointer">{{ chart.music.genre || '未知' }}</mdui-chip>
            <mdui-chip icon="star" style="cursor:pointer">{{ chart.music.type || '未知' }}</mdui-chip>
            <mdui-chip icon="edit" @click="copyToClipboard(chart.charter || '未知')" style="cursor:pointer">{{ chart.charter || '未知' }}</mdui-chip>
        </div>

        <h3>Rating 阶段</h3>
        <mdui-list>
            <mdui-list-item v-for="i of raTable" :key="i.rank" nonclickable>
                <div class="list-container">
                    <div class="list-title">
                        {{ i.rank }}
                        <span class="description">{{ i.rate.toFixed(4) }}%</span>
                    </div>
                    <span v-if="typeof chart.ra === 'number' && i.ra > chart.ra">
                        +{{ typeof chart.ra === 'number' ? i.ra - chart.ra : i.ra }}
                    </span>
                    {{ i.ra }}
                </div>
            </mdui-list-item>
        </mdui-list>

        <div v-if="friendsScores.length > 1" class="friends-section">
            <h3>好友排名</h3>
            <mdui-list>
                <mdui-list-item v-for="(f, idx) in friendsScores" :key="f.name" nonclickable :active="f.name === selfName" rounded>
                    <div class="friend-score-row">
                        <span class="friend-rank">{{ getRanks(friendsScores)[idx] }}</span>
                        <span class="friend-name">{{ f.name }}</span>
                        <span class="friend-achievement">{{ typeof f.achievements === 'number' ? `${f.achievements.toFixed(4)}%` : '' }}</span>
                        <span class="friend-fc" v-if="f.fc"><img :src="`/icons/music_icon_${f.fc}.png`" class="icon" /></span>
                    </div>
                </mdui-list-item>
            </mdui-list>
        </div>
        
        <h3 v-if="chart?.music && chart?.music.aliases && chart.music.aliases.length">别名</h3>
        <div class="chip-container" v-if="chart?.music && chart?.music.aliases && chart.music.aliases.length">
            <mdui-chip v-for="alias in chart.music.aliases" :key="alias" @click="copyToClipboard(alias)" style="cursor:pointer">{{ alias }}</mdui-chip>
        </div>
    </mdui-dialog>
</template>

<script setup lang="ts">
import type { ChartCardData } from '@/types/music';
import { defineProps, watch, nextTick, ref, computed } from "vue";
import localForage from "localforage";
import type { User } from '../../types/user';
import { snackbar } from "mdui";

function consolelog(data: any) {
    console.log(data);
}

const props = defineProps<{
    open: boolean;
    chart: ChartCardData | null;
}>();
const dialogRef = ref<any>(null);
const friendsScores = ref<{ name: string, achievements?: number, ra?: number, rate?: string, fc?: string, fs?: string, played: boolean }[]>([]);
const selfName = ref('');

// 获取当前谱面key
function getChartKey(chart: ChartCardData) {
    return `${chart.song_id}-${typeof chart.level_index === 'number' ? chart.level_index : (chart.grade ?? 0)}`;
}

watch(() => props.open, async () => {
    await nextTick();
    if (dialogRef.value) {
        dialogRef.value.open = true;
    }
    friendsScores.value = [];
    selfName.value = '';
    if (!props.chart) return;
    const key = getChartKey(props.chart);
    const users: User[] = (await localForage.getItem("users")) || [];
    // selfName为用户列表第一个用户
    if (users.length > 0) {
        selfName.value = String(users[0].divingFish?.name || users[0].inGame?.name || users[0].inGame?.id || '');
    }
    users.forEach(user => {
        const uname = String(user.divingFish?.name || user.inGame?.name || user.inGame?.id || '');
        if (!uname) return;
        const detail = user.data?.detailed?.[key];
        if (detail) {
            friendsScores.value.push({
                name: uname,
                achievements: detail.achievements,
                ra: detail.ra,
                rate: detail.rate,
                fc: detail.fc,
                fs: detail.fs,
                played: true
            });
        } else {
            friendsScores.value.push({
                name: uname,
                achievements: undefined,
                ra: undefined,
                rate: undefined,
                fc: undefined,
                fs: undefined,
                played: false
            });
        }
    });
    // 排名：已游玩按成绩降序，未游玩排最后
    friendsScores.value = friendsScores.value
        .sort((a, b) => {
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
});

// 计算排名，处理并列
function getRanks(scores: {achievements?: number, played: boolean}[]) {
    let lastScore: number | undefined = undefined;
    let lastRank = 1;
    let playedCount = 0;
    return scores.map((s) => {
        if (!s.played) return '-';
        if (typeof s.achievements !== 'number') return '-';
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

const SCORE_COEFFICIENT_TABLE: [number, number, string][] = [
    [100.5, 22.4, 'SSS+'],
    [100.4999, 22.2, 'SSS'],
    [100, 21.6, 'SSS'],
    [99.9999, 21.4, 'SS+'],
    [99.5, 21.1, 'SS+'],
    [99, 20.8, 'SS'],
    [98.9999, 20.6, 'S+'],
    [98, 20.3, 'S+'],
    [97, 20.0, 'S'],
    [96.9999, 17.6, 'AAA'],
    [94, 16.8, 'AAA'],
    [90, 15.2, 'AA'],
    [80, 13.6, 'A'],
    [79.9999, 12.8, 'BBB'],
    [75, 12.0, 'BBB'],
    [70, 11.2, 'BB'],
    [60, 9.6, 'B'],
    [50, 8.0, 'C'],
    [40, 6.4, 'D'],
    [30, 4.8, 'D'],
    [20, 3.2, 'D'],
    [10, 1.6, 'D'],
    [0, 0, 'D'],
]
const raTable = computed(() => {
    if (!props.chart) return [];
    const achievements = typeof props.chart.achievements === 'number' ? props.chart.achievements : 0;
    const ds = props.chart.ds;
    const result = [];
    for (const i of SCORE_COEFFICIENT_TABLE) {
        result.push({
            rate: i[0],
            rank: i[2],
            ra: Math.floor(i[1] * ds * Math.min(100.5, achievements) / 100),
        });
        if (i[0] <= achievements) break;
    }
    return result;
})
</script>

<style scoped>
.song-cover {
    width: 100%;
    height: auto;
    aspect-ratio: 1 / 1;
    margin: 0 auto;
    display: block;

    background: image('https://www.diving-fish.com/covers/00000.png');
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
</style>