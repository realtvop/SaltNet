// 曲目信息列表更新 用于 Actions 执行
const fs = require("fs");

const DFMusicDataAPIURL = "https://www.diving-fish.com/api/maimaidxprober/music_data";
const DFChartStatsAPIURL = "https://www.diving-fish.com/api/maimaidxprober/chart_stats";
const LXListAPIURL = dataType => `https://maimai.lxns.net/api/v0/maimai/${dataType}/list`;
const LXSongListAPIURL = "https://maimai.lxns.net/api/v0/maimai/song/list";
const YzcAliasDataAPIURL = "https://www.yuzuchan.moe/api/maimaidx/maimaidxalias";

const fetchLXListData = dataType => fetch(LXListAPIURL(dataType)).then(r => r.json());

const buildVersionTable = lxSongList => {
    const versionTable = [];
    for (const version of lxSongList.versions || []) {
        if (typeof version.version !== "number" || typeof version.title !== "string") continue;
        versionTable.push(version);
    }
    versionTable.sort((a, b) => a.version - b.version);
    return versionTable;
};

const buildLxSongMap = lxSongList => {
    const lxSongMap = new Map();
    for (const song of lxSongList.songs || []) {
        const id = Number(song.id);
        if (!Number.isFinite(id)) continue;
        lxSongMap.set(id, song);
    }
    return lxSongMap;
};

const getSongMatchId = song => {
    const id = Number(song.id);
    if (!Number.isFinite(id)) return null;
    return id < 100000 ? id % 10000 : id;
};

const resolveVersionTitle = (versionValue, versionTable) => {
    if (typeof versionValue !== "number" || versionTable.length === 0) return null;

    for (let i = 0; i < versionTable.length; i++) {
        const current = versionTable[i];
        const next = versionTable[i + 1];

        if (!next) return versionValue >= current.version ? current.title : null;
        if (versionValue >= current.version && versionValue < next.version) return current.title;
    }

    return null;
};

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
    const versionTable = buildVersionTable(lxSongList);
    const lxSongMap = buildLxSongMap(lxSongList);

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
        const matchId = getSongMatchId(song);
        const lxSong = lxSongMap.get(matchId);
        if (lxSong) {
            let difficulties;
            if (id >= 100000) difficulties = lxSong.difficulties.utage || lxSong.difficulties.dx;
            else difficulties = lxSong.difficulties[song.type === "DX" ? "dx" : "standard"];

            if (difficulties && difficulties.length > 0) {
                const versionValues = difficulties
                    .map(difficulty => difficulty.version)
                    .filter(version => typeof version === "number");
                if (versionValues.length > 0) {
                    const versionTitle = resolveVersionTitle(Math.min(...versionValues), versionTable);
                    if (versionTitle) {
                        song.basic_info.from = versionTitle;
                        if (
                            !song.basic_info.from.startsWith("舞萌") &&
                            !song.basic_info.from.startsWith("maimai")
                        )
                            song.basic_info.from = `maimai ${song.basic_info.from}`;
                    }
                }
            }
        }

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
