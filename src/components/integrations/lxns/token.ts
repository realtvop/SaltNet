import type { User } from "@/components/data/user";
import { jwtDecode } from "jwt-decode";
import type { LXNSAuth } from "@core/integrations/lxns/type";

export interface LXNSTokenData {
    access_token: string;
    token_type: string;
    refresh_token: string;
    expires_in?: number;
}

export class LXNSTokenError extends Error {
    constructor(
        message: string,
        readonly oauthError: string = ""
    ) {
        super(message);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export async function requestLXNSToken(body: URLSearchParams): Promise<LXNSTokenData> {
    const response = await fetch("https://maimai.lxns.net/api/v0/oauth/token", {
        method: "POST",
        body,
    });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok || !isRecord(result) || result.error || result.success === false) {
        const error = isRecord(result) && typeof result.error === "string" ? result.error : "";
        const description =
            isRecord(result) && typeof result.error_description === "string"
                ? result.error_description
                : error || `HTTP ${response.status}`;
        throw new LXNSTokenError(`落雪授权失败：${description}`, error);
    }

    // Token endpoints use a flat response; accept the earlier API envelope as well.
    const data = result.success === true && isRecord(result.data) ? result.data : result;
    if (
        typeof data.access_token !== "string" ||
        !data.access_token ||
        typeof data.refresh_token !== "string" ||
        !data.refresh_token ||
        typeof data.token_type !== "string" ||
        !data.token_type
    ) {
        throw new LXNSTokenError("落雪授权响应缺少有效的令牌，请重新授权");
    }
    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_type: data.token_type,
        expires_in:
            typeof data.expires_in === "number" &&
            Number.isFinite(data.expires_in) &&
            data.expires_in > 0
                ? data.expires_in
                : undefined,
    };
}

export function applyLXNSAuth(user: User, auth: LXNSAuth, expiresIn?: number): LXNSAuth {
    if (!auth.accessToken) throw new Error("No access token available");

    const { name, id } = jwtDecode<{ name: string; id: number }>(auth.accessToken);
    if (user.lxns?.id && user.lxns.id !== id) {
        throw new Error("LXNS token identity changed unexpectedly");
    }

    const nextAuth: LXNSAuth = {
        ...auth,
        expiresAt: expiresIn
            ? Date.now() + expiresIn * 1000
            : jwtDecode<{ exp: number }>(auth.accessToken).exp * 1000,
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

    let data: LXNSTokenData;
    try {
        data = await requestLXNSToken(
            new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: user.lxns.auth.refreshToken,
                client_id: import.meta.env.VITE_LXNS_OAUTH_CLIENT_ID,
            })
        );
    } catch (error) {
        if (error instanceof LXNSTokenError && error.oauthError === "invalid_grant") {
            user.lxns = { auth: null, name: null, id: null };
        }
        throw error;
    }

    return applyLXNSAuth(
        user,
        {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            tokenType: data.token_type,
        },
        data.expires_in
    );
}
