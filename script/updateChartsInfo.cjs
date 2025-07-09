// 曲目信息列表更新 用于 Actions 执行
const fs = require("fs");

const DFMusicDataAPIURL = "https://www.diving-fish.com/api/maimaidxprober/music_data";
const DFChartStatsAPIURL = "https://www.diving-fish.com/api/maimaidxprober/chart_stats";
const LXMusicAliasAPIURL = "https://maimai.lxns.net/api/v0/maimai/alias/list";

async function updateData() {
    const musicData = await fetch(DFMusicDataAPIURL).then(r => r.json());
    const chartStats = await fetch(DFChartStatsAPIURL).then(r => r.json());
    const aliases = await fetch(LXMusicAliasAPIURL)
        .then(r => r.json())
        .then(res => res.aliases);

    for (const song of musicData) {
        const id = Number(song.id);
        const ids = 10000 < id < 100000 ? [id, id - 10000] : [id];
        const aliasList = aliases.find(a => ids.includes(a.song_id));
        if (aliasList) song.aliases = aliasList.aliases;

        const stats = chartStats.charts[song.id];
        if (!stats) continue;
        for (const chart of song.charts) chart.stats = stats[song.charts.indexOf(chart)] || {};
    }

    const chartCount = {
        all: 0,
        songs: 0,
        byDifficulty: [0, 0, 0, 0, 0], // easy, normal, expert, master, remaster
        byLevel: {},
    };
    for (const song of musicData) {
        chartCount.songs++;
        for (const level of song.level) {
            let realLevel = level;
            chartCount.all++;
            if (song.basic_info.genre != "宴会場") chartCount.byDifficulty[song.level.indexOf(level)]++;
            else if (!level.includes("?")) realLevel = (song.level[song.level.indexOf(level)] += "?");
            chartCount.byLevel[realLevel] = (chartCount.byLevel[realLevel] || 0) + 1;
        }
    }

    fs.writeFileSync("src/assets/music/charts.json", JSON.stringify({
        data: musicData,
        chartCount,
    }), "utf8");
}

updateData();
