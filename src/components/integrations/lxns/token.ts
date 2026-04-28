import type { User } from "@/components/data/user";
import { jwtDecode } from "jwt-decode";
import type { LXNSAuth, LXNSResponse } from "./type";

interface LXNSTokenData {
    access_token: string;
    token_type: string;
    refresh_token: string;
}

export function applyLXNSAuth(user: User, auth: LXNSAuth): LXNSAuth {
    if (!auth.accessToken) throw new Error("No access token available");

    const { name, id, exp } = jwtDecode<{ name: string; id: number; exp: number }>(
        auth.accessToken
    );

    const nextAuth: LXNSAuth = {
        ...auth,
        expiresAt: exp * 1000,
    };

    user.lxns = {
        auth: nextAuth,
        name,
        id,
    };

    return nextAuth;
}

export async function refreshLXNSOAuthToken(user: User): Promise<LXNSAuth> {
    if (!user.lxns?.auth?.refreshToken) throw new Error("No refresh token available");

    const resp = await fetch("https://maimai.lxns.net/api/v0/oauth/token", {
        method: "POST",
        body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: user.lxns.auth.refreshToken,
            client_id: import.meta.env.VITE_LXNS_OAUTH_CLIENT_ID,
        }),
    });
    const data = (await resp.json()) as LXNSResponse<LXNSTokenData>;

    return applyLXNSAuth(user, {
        accessToken: data.data.access_token,
        refreshToken: data.data.refresh_token,
        tokenType: data.data.token_type,
    });
}
