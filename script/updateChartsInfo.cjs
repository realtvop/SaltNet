// 曲目信息列表更新 用于 Actions 执行
const fs = require("fs");

const DFMusicDataAPIURL = "https://www.diving-fish.com/api/maimaidxprober/music_data";
const DFChartStatsAPIURL = "https://www.diving-fish.com/api/maimaidxprober/chart_stats";
const LXMusicAliasAPIURL = "https://maimai.lxns.net/api/v0/maimai/alias/list";

async function updateData() {
    const musicData = await fetch(DFMusicDataAPIURL).then(r => r.json());
    const chartStats = await fetch(DFChartStatsAPIURL).then(r => r.json());
    const aliases = await fetch(LXMusicAliasAPIURL).then(r => r.json()).then(res => res.aliases);

    for (const song of musicData) {
        const id = Number(song.id);
        const ids = 10000 < id < 100000 ? [id, id - 10000] : [id];
        const aliasList = aliases.find(a => ids.includes(a.song_id));
        if (aliasList) song.aliases = aliasList.aliases;
        
        const stats = chartStats.charts[song.id];
        if (!stats) continue;
        for (const chart of song.charts) 
            chart.stats = stats[song.charts.indexOf(chart)] || {};
    }

    fs.writeFileSync("src/assets/music/charts.json", JSON.stringify(musicData), "utf8");
}

updateData()