import { convertDetailed, type User } from "@/components/data/user";
import type { DivingFishB50, DivingFishFullRecord } from "../diving-fish/type";
import type { LXNSScore, LXNSUser } from "./type";
import { getMusicInfoAsync } from "@/components/data/music";
import { fetchLXNSApi } from "./fetch";
import { toHalfWidth } from "@/utils";

function LXNS2DF(score: LXNSScore): DivingFishFullRecord {
    return {
        song_id: score.id + (score.type === "dx" ? 1_0000 : 0),
        level_index: score.level_index,
        level: score.level,
        level_label: `${score.level}${score.level_index}`,
        type: {
            standard: "SD",
            dx: "DX",
        }[score.type] as "SD" | "DX",
        dxScore: score.dx_score,
        ds: 0, // LXNS does not provide ds
        fc: score.fc,
        fs: score.fs,
        achievements: score.achievements,
        ra: Math.floor(score.dx_rating),
        rate: score.rate,
        title: score.song_name,
    };
}

async function getB50(scores: DivingFishFullRecord[]): Promise<DivingFishB50> {
    const musicInfo = await getMusicInfoAsync();
    const newScores: DivingFishFullRecord[] = [];
    const oldScores: DivingFishFullRecord[] = [];

    for (const score of scores) {
        // Look up music info to determine if the song is new
        const music = musicInfo?.musicList[score.song_id];
        if (music?.info?.isNew) {
            newScores.push(score);
        } else {
            oldScores.push(score);
        }
    }

    // Sort by rating (ra) in descending order
    newScores.sort((a, b) => b.ra - a.ra);
    oldScores.sort((a, b) => b.ra - a.ra);

    return {
        dx: newScores.slice(0, 15), // Best 15 new version songs
        sd: oldScores.slice(0, 35), // Best 35 old version songs
    };
}

export async function fetchLXNSScore(user: User) {
    const userData = await fetchLXNSApi<LXNSUser>(user);
    const lxScores = await fetchLXNSApi<LXNSScore[]>(user, "scores");

    const scores = lxScores.map(LXNS2DF);
    const b50 = await getB50(scores);

    return {
        name: toHalfWidth(userData.name),
        rating: userData.rating,
        scores: convertDetailed(scores),
        b50,
        updateTime: Date.now(),
    };
}
