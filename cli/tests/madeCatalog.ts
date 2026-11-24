import type { SaltMetaBuildResult } from "@core/music/fetch";
import type { Music, SavedMusicList } from "@core/music/type";
import type { SongCatalog } from "../src/catalog/songs";
import { ChartType } from "@core/mai/types";
import { indexMusicSearchData } from "@core/music/search";
import { buildSongCatalog } from "../src/catalog/songs";

/**
 * A catalog of made-up songs, for the cases the fixed fixture has no example of. A song with a
 * `charter` has one chart by that charter; without one it has no chart.
 */
export interface MadeCatalogEntry {
    id: number;
    title: string;
    aliases?: string[];
    artist?: string;
    charter?: string;
    charters?: (string | undefined)[];
}

function madeMusic(
    entries: MadeCatalogEntry[],
    options: { indexed?: boolean } = {}
): SavedMusicList {
    const musicList: Record<number, Music> = {};
    const chartList: SavedMusicList["chartList"] = {};
    for (const entry of entries) {
        const music: Music = {
            id: entry.id,
            info: {
                id: entry.id,
                title: entry.title,
                aliases: entry.aliases,
                artist: entry.artist ?? "someone",
                genre: "舞萌" as never,
                bpm: 120,
                from: "舞萌DX" as never,
                isNew: false,
                type: ChartType.Standard,
            },
            charts: [],
        };
        if (entry.charters !== undefined) {
            for (let grade = 0; grade < entry.charters.length; grade++) {
                const charter = entry.charters[grade];
                music.charts.push({
                    id: entry.id * 10 + grade,
                    info: {
                        notes: [0, 0, 0, 0],
                        charter: charter as string,
                        level: "1",
                        grade,
                        constant: 1,
                        deluxeScoreMax: 0,
                    },
                    music,
                });
            }
        } else if (entry.charter !== undefined) {
            music.charts.push({
                id: entry.id * 10,
                info: {
                    notes: [0, 0, 0, 0],
                    charter: entry.charter,
                    level: "1",
                    grade: 0,
                    constant: 1,
                    deluxeScoreMax: 0,
                },
                music,
            });
        }
        musicList[entry.id] = music;
        for (const chart of music.charts) chartList[chart.id] = chart;
    }
    const data = { musicList, chartList };
    return options.indexed === false ? data : indexMusicSearchData(data);
}

export function catalogOf(
    entries: MadeCatalogEntry[],
    options: { indexed?: boolean } = {}
): SongCatalog {
    return buildSongCatalog(madeMusic(entries, options));
}

/** A complete store input for command tests that need a made-up on-disk catalog. */
export function madeMusicBuild(
    entries: MadeCatalogEntry[],
    options: { indexed?: boolean } = {}
): SaltMetaBuildResult {
    return {
        music: madeMusic(entries, options),
        metadata: { cnVersions: [] },
        merged: [],
    };
}
