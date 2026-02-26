// 曲目信息列表更新 用于 Actions 执行
const fs = require("fs");

const DFMusicDataAPIURL = "https://www.diving-fish.com/api/maimaidxprober/music_data";
const DFChartStatsAPIURL = "https://www.diving-fish.com/api/maimaidxprober/chart_stats";
const LXListAPIURL = dataType => `https://maimai.lxns.net/api/v0/maimai/${dataType}/list`;
const YzcAliasDataAPIURL = "https://www.yuzuchan.moe/api/maimaidx/maimaidxalias";
const CKMusicListURL =
    "https://raw.githubusercontent.com/CrazyKidCN/maimaiDX-CN-songs-database/refs/heads/main/maidata.json";

const fetchLXListData = dataType => fetch(LXListAPIURL(dataType)).then(r => r.json());

const versionRank = [
    "maimai",
    "maimai PLUS",
    "maimai GreeN",
    "maimai GreeN PLUS",
    "maimai ORANGE",
    "maimai ORANGE PLUS",
    "maimai PiNK",
    "maimai PiNK PLUS",
    "maimai MURASAKi",
    "maimai MURASAKi PLUS",
    "maimai MiLK",
    "MiLK PLUS",
    "maimai MiLK PLUS",
    "maimai FiNALE",
    "maimai でらっくす",
    "maimai でらっくす PLUS",
    "maimai でらっくす Splash",
    "maimai でらっくす Splash PLUS",
    "maimai でらっくす UNiVERSE",
    "maimai でらっくす UNiVERSE PLUS",
    "maimai でらっくす FESTiVAL",
    "maimai でらっくす FESTiVAL PLUS",
    "maimai でらっくす BUDDiES",
    "maimai でらっくす BUDDiES PLUS",
    "maimai でらっくす PRiSM",
];

function getVersionRank(v) {
    if (!v) return -1;
    const index = versionRank.indexOf(v);
    if (index !== -1) return index;
    return -1;
}

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
    const ckMusicData = await fetch(CKMusicListURL).then(r => r.json());
    const chartStats = await fetch(DFChartStatsAPIURL).then(r => r.json());
    const aliases = await fetchLXListData("alias").then(res => res.aliases);
    const yzcAliases = await fetch(YzcAliasDataAPIURL).then(r => r.json());

    // Create a map to easily look up peer charts (DX vs SD) for the same song title
    const songsByTitle = {};
    for (const song of musicData) {
        if (!songsByTitle[song.title]) songsByTitle[song.title] = {};
        if (song.type === "SD") songsByTitle[song.title].SD = song;
        else if (song.type === "DX") songsByTitle[song.title].DX = song;
    }

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

        const ckMatch = ckMusicData.find(c => {
            if (c.title != song.title) return false;
            if (!c.version.startsWith("舞萌")) return false;
            if (song.type == "SD" && c.lev_bas) return true;
            if (song.type == "DX" && c.dx_lev_bas) return true;
            return false;
        });

        if (ckMatch) {
            // Check if it's a merged entry (contains both SD and DX levels)
            const isMerged = ckMatch.lev_bas && ckMatch.dx_lev_bas;

            if (isMerged && song.type === "SD") {
                // Determine if we should swap the version label with the DX chart's version
                // This handles cases where the SD version in the source data is incorrectly labeled as newer than the DX version
                let usePeerVersion = false;
                const peer = songsByTitle[song.title]?.DX;

                if (peer) {
                    const rankSD = getVersionRank(song.basic_info.from);
                    const rankDX = getVersionRank(peer.basic_info.from);

                    // If SD version is newer than DX version, assume swapped/incorrect labeling and use DX version for SD
                    if (rankSD !== -1 && rankDX !== -1 && rankSD > rankDX) {
                        usePeerVersion = true;
                    }
                }

                if (usePeerVersion && peer) {
                    song.basic_info.from = peer.basic_info.from;
                } else {
                    // Keep original SD version (do not overwrite with merged CK version)
                }
            } else {
                // For DX charts, or unmerged SD charts, update from CK data
                song.basic_info.from = ckMatch.version;
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
