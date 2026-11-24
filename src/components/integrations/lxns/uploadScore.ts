import type { User } from "@core/user/type";
import type { DivingFishFullRecord } from "@core/integrations/diving-fish/type";
import type { LXNSUploadScoreRequest } from "@core/integrations/lxns/type";
import { convertToLXNSUploadScore } from "@core/integrations/lxns/client";
import { fetchLXNSApi } from "./fetch";

export async function uploadScoresToLXNS(
    user: User,
    scores: DivingFishFullRecord[]
): Promise<void> {
    if (!user.lxns?.auth?.accessToken) {
        throw new Error("User is not authenticated with LXNS");
    }

    const uploadScores = scores.map(convertToLXNSUploadScore);

    await fetchLXNSApi<unknown>(user, "scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores: uploadScores } as LXNSUploadScoreRequest),
    });
}
