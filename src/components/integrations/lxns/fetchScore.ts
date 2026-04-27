import { convertDetailed, type User } from "@/components/data/user/type";
import type { DivingFishFullRecord } from "../diving-fish/type";
import type { LXNSScore, LXNSUser } from "./type";
import { calculateB50FromRecords } from "../diving-fish";
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

export async function fetchLXNSScore(user: User) {
    const userData = await fetchLXNSApi<LXNSUser>(user);
    const lxScores = await fetchLXNSApi<LXNSScore[]>(user, "scores");

    const scores = lxScores.map(LXNS2DF);
    const b50 = await calculateB50FromRecords(scores);

    return {
        name: toHalfWidth(userData.name),
        rating: userData.rating,
        scores: convertDetailed(scores),
        b50,
        updateTime: Date.now(),
    };
}
