import type { User } from "@/components/data/user";
import type { LXNSAuth, LXNSResponse } from "./type";
import { refreshLXNSOAuthToken } from "./token";

const EXPIRY_BUFFER_MS = 60_000;
let refreshPromise: Promise<LXNSAuth> | null = null;

async function getValidAuth(user: User): Promise<{ accessToken: string; tokenType: string }> {
    if (!user.lxns?.auth?.accessToken) throw new Error("User is not authenticated with LXNS");

    if (Date.now() >= (user.lxns.auth.expiresAt || 0) - EXPIRY_BUFFER_MS) {
        if (!refreshPromise) {
            refreshPromise = refreshLXNSOAuthToken(user).finally(() => {
                refreshPromise = null;
            });
        }
        const auth = await refreshPromise;
        return { accessToken: auth.accessToken!, tokenType: auth.tokenType! };
    }

    return { accessToken: user.lxns.auth.accessToken, tokenType: user.lxns.auth.tokenType! };
}

export async function fetchLXNSApi<APIRespType>(
    user: User,
    endpoint?: string,
    init?: RequestInit
): Promise<APIRespType> {
    const { accessToken, tokenType } = await getValidAuth(user);
    return (
        await fetch(
            `https://maimai.lxns.net/api/v0/user/maimai/player${endpoint ? "/" : ""}${endpoint ?? ""}`,
            {
                ...init,
                headers: {
                    ...init?.headers,
                    Authorization: `${tokenType} ${accessToken}`,
                },
            }
        ).then(resp => resp.json() as unknown as LXNSResponse<APIRespType>)
    ).data as APIRespType;
}
