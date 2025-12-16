import type { User } from "@/components/data/user";
import { refreshLXNSOAuthToken } from "./oauth";
import type { LXNSResponse } from "./type";

export async function fetchLXNSApi<APIRespType>(
    user: User,
    endpoint: string,
    init?: any
): Promise<APIRespType> {
    if (!user.lxns?.auth?.accessToken) throw new Error("User is not authenticated with LXNS");
    const { accessToken, tokenType } =
        Date.now() >= (user.lxns.auth.expiresAt || 0)
            ? await refreshLXNSOAuthToken(user)
            : user.lxns.auth;
    return (await fetch(`https://maimai.lxns.net/api/v0/maimai/player/${endpoint}`, {
        ...init,
        headers: {
            // ...init?.headers,
            Authorization: `${tokenType} ${accessToken}`,
        },
    }).then(resp => (resp.json() as unknown as LXNSResponse<APIRespType>).data)) as APIRespType;
}
