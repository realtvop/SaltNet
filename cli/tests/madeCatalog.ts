import type { Music } from "@core/music/type";
import type { SongCatalog } from "../src/catalog/songs";
import { ChartType } from "@core/mai/types";
import { indexMusicSearchData } from "@core/music/search";
import { buildSongCatalog } from "../src/catalog/songs";

/**
 * A catalog of made-up songs, for the cases the fixed fixture has no example of. A song with a
 * `charter` has one chart by that charter; without one it has no chart.
 */
export function catalogOf(
    entries: {
        id: number;
        title: string;
        aliases?: string[];
        artist?: string;
        charter?: string;
        charters?: (string | undefined)[];
    }[],
    options: { indexed?: boolean } = {}
): SongCatalog {
    const musicList: Record<number, Music> = {};
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
    }
    const data = { musicList, chartList: {} };
    return buildSongCatalog(options.indexed === false ? data : indexMusicSearchData(data));
}
