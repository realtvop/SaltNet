// 曲目信息列表更新 用于 Actions 执行
const fs = require("fs");

const DFMusicDataAPIURL = "https://www.diving-fish.com/api/maimaidxprober/music_data";
const LXMusicAliasAPIURL = "https://maimai.lxns.net/api/v0/maimai/alias/list";

fetch(DFMusicDataAPIURL)
    .then(r => r.json())
    .then(data => {
        fetch(LXMusicAliasAPIURL)
            .then(r => r.json())
            .then(res => {
                const aliases = res.aliases;
                
                for (const chart of data) {
                    const id = Number(chart.id);
                    const ids = 10000 < id < 100000 ? [id, id - 10000] : [id];
                    const aliasList = aliases.find(a => ids.includes(a.song_id));
                    if (aliasList) chart.aliases = aliasList.aliases;
                }

                fs.writeFileSync("public/data/charts.json", JSON.stringify(data), 'utf8');
            });
    });