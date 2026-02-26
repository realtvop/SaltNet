// 曲目信息列表更新 用于 Actions 执行
const fs = require("fs");
const { execSync } = require("child_process");

const fetchWithCurl = url => {
    try {
        const command = `curl -s -L "${url}"`;
        const output = execSync(command, { maxBuffer: 10 * 1024 * 1024 });
        return Promise.resolve({
            json: () => Promise.resolve(JSON.parse(output.toString()))
        });
    } catch (error) {
        return Promise.reject(error);
    }
};

const DFMusicDataAPIURL = "https://www.diving-fish.com/api/maimaidxprober/music_data";
const DFChartStatsAPIURL = "https://www.diving-fish.com/api/maimaidxprober/chart_stats";
const LXListAPIURL = dataType => `https://maimai.lxns.net/api/v0/maimai/${dataType}/list`;
const YzcAliasDataAPIURL = "https://www.yuzuchan.moe/api/maimaidx/maimaidxalias";
const LXSongListAPIURL = "https://maimai.lxns.net/api/v0/maimai/song/list";

const fetchLXListData = dataType => fetchWithCurl(LXListAPIURL(dataType)).then(r => r.json());

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
    const musicData = await fetchWithCurl(DFMusicDataAPIURL).then(r => r.json());
    const lxSongData = await fetchWithCurl(LXSongListAPIURL).then(r => r.json());
    const chartStats = await fetchWithCurl(DFChartStatsAPIURL).then(r => r.json());
    const aliases = await fetchLXListData("alias").then(res => res.aliases);
    const yzcAliases = await fetchWithCurl(YzcAliasDataAPIURL).then(r => r.json());

    const lxSongs = lxSongData.songs;
    const lxVersions = lxSongData.versions;

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

        const normalizedId = id > 10000 && id < 100000 ? id % 10000 : id;
        const lxSong = lxSongs.find(s => s.id === normalizedId) || lxSongs.find(s => s.title === song.title);

        if (lxSong) {
            let versionId;
            if (song.type === "SD" && lxSong.difficulties.standard && lxSong.difficulties.standard.length > 0) {
                versionId = lxSong.difficulties.standard[0].version;
            } else if (song.type === "DX" && lxSong.difficulties.dx && lxSong.difficulties.dx.length > 0) {
                versionId = lxSong.difficulties.dx[0].version;
            }

            if (versionId !== undefined) {
                const version = lxVersions.find(v => v.version === versionId);
                if (version) {
                    song.basic_info.from = version.title;
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
