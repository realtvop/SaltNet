import type { User } from "@/components/data/user";
import type { LXNSAuth, LXNSResponse } from "./type";
import { refreshLXNSOAuthToken } from "./token";

const EXPIRY_BUFFER_MS = 60_000;
const refreshPromises = new WeakMap<User, Promise<LXNSAuth>>();

async function getValidAuth(user: User): Promise<{ accessToken: string; tokenType: string }> {
    if (!user.lxns?.auth?.accessToken) throw new Error("User is not authenticated with LXNS");

    if (Date.now() >= (user.lxns.auth.expiresAt || 0) - EXPIRY_BUFFER_MS) {
        let refreshPromise = refreshPromises.get(user);
        if (!refreshPromise) {
            refreshPromise = refreshLXNSOAuthToken(user).finally(() => {
                refreshPromises.delete(user);
            });
            refreshPromises.set(user, refreshPromise);
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
    const resp = await fetch(
        `https://maimai.lxns.net/api/v0/user/maimai/player${endpoint ? "/" : ""}${endpoint ?? ""}`,
        {
            ...init,
            headers: {
                ...init?.headers,
                Authorization: `${tokenType} ${accessToken}`,
            },
        }
    );
    const body = (await resp.json()) as LXNSResponse<APIRespType>;
    if (!resp.ok || !body.success) {
        throw new Error(`LXNS API request failed (HTTP ${resp.status})`);
    }
    return body.data as APIRespType;
}
