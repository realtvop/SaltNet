import type { User } from "@/components/data/user/type";
import type { DivingFishFullRecord } from "@/components/integrations/diving-fish/type";
import type { LXNSUploadScore, LXNSUploadScoreRequest } from "./type";
import { fetchLXNSApi } from "./fetch";

function DF2LXNS(score: DivingFishFullRecord): LXNSUploadScore {
    const isDX = score.type === "DX";
    const rawId = isDX ? score.song_id - 10000 : score.song_id;

    return {
        id: rawId,
        type: isDX ? "dx" : "standard",
        level_index: score.level_index,
        achievements: score.achievements,
        fc: score.fc || null,
        fs: score.fs || null,
        dx_score: score.dxScore,
    };
}

export async function uploadScoresToLXNS(
    user: User,
    scores: DivingFishFullRecord[]
): Promise<void> {
    if (!user.lxns?.auth?.accessToken) {
        throw new Error("User is not authenticated with LXNS");
    }

    const uploadScores = scores.map(DF2LXNS);

    await fetchLXNSApi<unknown>(
        user,
        "scores",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scores: uploadScores } as LXNSUploadScoreRequest),
        }
    );
}
