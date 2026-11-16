import { convertDetailed, type User } from "@core/user/type";
import type { LXNSScore, LXNSUser } from "@core/integrations/lxns/type";
import { convertLXNSScore } from "@core/integrations/lxns/client";
import { calculateB50FromRecords } from "../diving-fish/player";
import { fetchLXNSApi } from "./fetch";
import { toHalfWidth } from "@/utils/toHalfWidth";

export async function fetchLXNSScore(user: User) {
    const userData = await fetchLXNSApi<LXNSUser>(user);
    const lxScores = await fetchLXNSApi<LXNSScore[]>(user, "scores");

    const scores = lxScores.map(convertLXNSScore);
    const b50 = await calculateB50FromRecords(scores);

    return {
        name: toHalfWidth(userData.name),
        rating: userData.rating,
        scores: convertDetailed(scores),
        b50,
        updateTime: Date.now(),
    };
}
