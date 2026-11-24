import type { CachedMusicData, SavedMusicList } from "./type";
import { indexMusicSearchData, MUSIC_SEARCH_INDEX_VERSION } from "./search";

/**
 * Restore chart-to-music references after loading cached data.
 */
export function restoreCachedMusicData(cached: CachedMusicData): SavedMusicList {
    const chartList: SavedMusicList["chartList"] = {};

    for (const musicId in cached.musicList) {
        const music = cached.musicList[musicId];
        for (const chart of music.charts) {
            chart.music = music;
            chartList[chart.id] = chart;
        }
    }

    const data = {
        musicList: cached.musicList,
        chartList,
    };

    if (cached.searchIndexVersion !== MUSIC_SEARCH_INDEX_VERSION) {
        indexMusicSearchData(data);
    }

    return data;
}
