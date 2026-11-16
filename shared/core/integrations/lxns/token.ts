import type { CoreConfig } from "../../config";
import type { FetchLike } from "../../http";
import type { User } from "../../user/type";
import type { LXNSAuth } from "./type";
import { jwtDecode } from "jwt-decode";
import { resolveCoreConfig } from "../../config";

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
        // No `name` of its own: the web app shows `String(error)`, which stays `Error: <message>`.
        super(message);
    }
}

export interface LXNSTokenRequestOptions {
    config?: Pick<Partial<CoreConfig>, "lxnsBaseUrl" | "lxnsClientId">;
    fetch?: FetchLike;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

// URLSearchParams writes an unpaired surrogate as U+FFFD; encodeURIComponent would throw on it.
const UNPAIRED_SURROGATE =
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function encodeFormComponent(value: string): string {
    return encodeURIComponent(value.replace(UNPAIRED_SURROGATE, "\uFFFD"))
        .split("%20")
        .join("+")
        .replace(/[!'()~]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Serializes form parameters to application/x-www-form-urlencoded matching URLSearchParams.toString().
 */
export function serializeFormBody(params: Record<string, string>): string {
    return Object.entries(params)
        .map(([key, value]) => `${encodeFormComponent(key)}=${encodeFormComponent(value)}`)
        .join("&");
}

/**
 * Requests an OAuth token from the LXNS token endpoint.
 */
export async function requestLXNSToken(
    params: Record<string, string>,
    options: LXNSTokenRequestOptions = {}
): Promise<LXNSTokenData> {
    const { lxnsBaseUrl } = resolveCoreConfig(options.config);
    const doFetch: FetchLike = options.fetch ?? fetch;
    const base = lxnsBaseUrl.replace(/\/+$/, "");
    const response = await doFetch(`${base}/api/v0/oauth/token`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: serializeFormBody(params),
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

/**
 * Validates the token payload, updates user with the new authorization, and sets expiry.
 */
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

/**
 * Refreshes the user's LXNS OAuth token, clearing authorization if the grant is invalid.
 */
export async function refreshLXNSOAuthToken(
    user: User,
    options: LXNSTokenRequestOptions = {}
): Promise<LXNSAuth> {
    if (!user.lxns?.auth?.refreshToken) throw new Error("No refresh token available");

    const { lxnsClientId } = resolveCoreConfig(options.config);
    let data: LXNSTokenData;
    try {
        data = await requestLXNSToken(
            {
                grant_type: "refresh_token",
                refresh_token: user.lxns.auth.refreshToken,
                client_id: lxnsClientId,
            },
            options
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
