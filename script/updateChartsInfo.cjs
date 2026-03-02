// 曲目信息列表更新 用于 Actions 执行
const fs = require("fs");

const DFMusicDataAPIURL = "https://www.diving-fish.com/api/maimaidxprober/music_data";
const DFChartStatsAPIURL = "https://www.diving-fish.com/api/maimaidxprober/chart_stats";
const LXListAPIURL = dataType => `https://maimai.lxns.net/api/v0/maimai/${dataType}/list`;
const LXSongListAPIURL = "https://maimai.lxns.net/api/v0/maimai/song/list";
const YzcAliasDataAPIURL = "https://www.yuzuchan.moe/api/maimaidx/maimaidxalias";

const fetchLXListData = dataType => fetch(LXListAPIURL(dataType)).then(r => r.json());

async function updateCollectionData() {
    const icons = await fetchLXListData("icon").then(res => res.icons);
    const plates = await fetchLXListData("plate").then(res => res.plates);
    const frames = await fetchLXListData("frame").then(res => res.frames);
    const titles = await fetchLXListData("trophy").then(res => res.trophies);

    const genres = {
        icons: [],
        plates: [],
        frames: [],
        titles: [],
    };
    for (const icon of icons)
        if (icon.genre && !genres.icons.includes(icon.genre)) genres.icons.push(icon.genre);
    for (const plate of plates)
        if (plate.genre && !genres.plates.includes(plate.genre)) genres.plates.push(plate.genre);
    for (const frame of frames)
        if (frame.genre && !genres.frames.includes(frame.genre)) genres.frames.push(frame.genre);
    for (const title of titles)
        if (title.genre && !genres.titles.includes(title.genre)) genres.titles.push(title.genre);

    fs.writeFileSync(
        "src/components/data/collection/collections.json",
        JSON.stringify({
            icons,
            plates,
            frames,
            titles,
            genres,
        }),
        "utf8"
    );
}

async function updateMusicData() {
    const musicData = await fetch(DFMusicDataAPIURL).then(r => r.json());
    const lxSongList = await fetch(LXSongListAPIURL).then(r => r.json());
    const chartStats = await fetch(DFChartStatsAPIURL).then(r => r.json());
    const aliases = await fetchLXListData("alias").then(res => res.aliases);
    const yzcAliases = await fetch(YzcAliasDataAPIURL).then(r => r.json());

    // Create version mapping for LXNS version IDs
    const lxVersions = [
        { version: 10000, name: "maimai" },
        { version: 11000, name: "maimai PLUS" },
        { version: 12000, name: "GreeN" },
        { version: 12500, name: "GreeN PLUS" },
        { version: 13000, name: "ORANGE" },
        { version: 14000, name: "ORANGE PLUS" },
        { version: 15000, name: "PiNK" },
        { version: 16000, name: "PiNK PLUS" },
        { version: 17000, name: "MURASAKi" },
        { version: 18000, name: "MURASAKi PLUS" },
        { version: 18500, name: "MiLK" },
        { version: 19000, name: "MiLK PLUS" },
        { version: 19500, name: "FiNALE" },
        { version: 20000, name: "舞萌DX" },
        { version: 21000, name: "舞萌DX 2021" },
        { version: 22000, name: "舞萌DX 2022" },
        { version: 23000, name: "舞萌DX 2023" },
        { version: 24000, name: "舞萌DX 2024" },
        { version: 25000, name: "舞萌DX 2025" },
    ];

    for (const song of musicData) {
        const id = Number(song.id);
        const ids = 10000 < id < 100000 ? [id, id - 10000] : [id];
        const aliasList = aliases.find(a => ids.includes(a.song_id));
        const yzcAliasList = yzcAliases.content.find(a => ids.includes(a.SongID));
        const finalAliasList = [];
        if (yzcAliasList && yzcAliasList.Alias)
            for (const alias of yzcAliasList.Alias)
                if (!finalAliasList.includes(alias)) finalAliasList.push(alias);
        if (aliasList)
            for (const alias of aliasList.aliases)
                if (!finalAliasList.includes(alias)) finalAliasList.push(alias);

        if (aliasList) song.aliases = finalAliasList;

        // Use LXNS version information
        const lxSong = lxSongList.songs.find(s => s.title === song.title);
        if (lxSong) {
            const chartType = song.type === "DX" ? "dx" : "standard";
            const difficulties = lxSong.difficulties[chartType];
            if (difficulties && difficulties.length > 0) {
                const versionId = difficulties[0].version;
                const baseVersion = versionId - (versionId % 100);
                const versionInfo = lxVersions.find(v => v.version === baseVersion);
                if (versionInfo) {
                    song.basic_info.from = versionInfo.name;
                }
            }
        }
        if (!song.basic_info.from.startsWith("舞萌") && !song.basic_info.from.startsWith("maimai"))
            song.basic_info.from = `maimai ${song.basic_info.from}`;

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
            if (song.basic_info.genre != "宴会場")
                chartCount.byDifficulty[song.level.indexOf(level)]++;
            else if (!level.includes("?")) realLevel = song.level[song.level.indexOf(level)] += "?";
            chartCount.byLevel[realLevel] = (chartCount.byLevel[realLevel] || 0) + 1;
        }
    }

    fs.writeFileSync(
        "public/charts.json",
        JSON.stringify({
            data: musicData,
            chartCount,
        }),
        "utf8"
    );
}

updateMusicData();
updateCollectionData();
