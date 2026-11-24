import type { CoreConfig } from "../../config";
import type { LXNSTokenRequestOptions } from "./token";
import type { LXNSAuth } from "./type";
import { jwtDecode } from "jwt-decode";
import { resolveCoreConfig } from "../../config";
import { LXNSTokenError, requestLXNSToken } from "./token";

export interface LXNSOAuthCallback {
    url: string;
    state: string;
    code: string;
    error: string;
    errorDescription: string;
}

export interface LXNSOAuthToken {
    auth: LXNSAuth;
    expiresAt: number;
}

export interface LXNSOAuthTransaction {
    userUid: string;
    codeVerifier: string;
    clientId: string;
    redirectUri: string;
    expiresAt: number;
    callback?: LXNSOAuthCallback;
    token?: LXNSOAuthToken;
}

export const LXNS_OAUTH_LIFETIME = 15 * 60 * 1000;
export const LXNS_OAUTH_SCOPE = "read_user_profile read_player write_player";
// eslint-disable-next-line regexp/prefer-w, regexp/use-ignore-case -- Keep the documented PKCE rule verbatim.
export const LXNS_PKCE_VALUE = /^[A-Za-z0-9_-]{43,128}$/;

export type LXNSRandomBytes = (bytes: Uint8Array) => void;
export type LXNSSha256Digest = (bytes: Uint8Array) => Promise<ArrayBuffer>;

function defaultRandomBytes(bytes: Uint8Array): void {
    globalThis.crypto.getRandomValues(bytes);
}

async function defaultSha256Digest(bytes: Uint8Array): Promise<ArrayBuffer> {
    return globalThis.crypto.subtle.digest("SHA-256", bytes);
}

export function base64UrlEncode(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateCodeVerifier(randomBytes: LXNSRandomBytes = defaultRandomBytes): string {
    const bytes = new Uint8Array(64);
    randomBytes(bytes);
    return base64UrlEncode(bytes);
}

export async function generateCodeChallenge(
    verifier: string,
    digest: LXNSSha256Digest = defaultSha256Digest
): Promise<string> {
    const hash = await digest(new TextEncoder().encode(verifier));
    return base64UrlEncode(new Uint8Array(hash));
}

export interface LXNSOAuthAuthorizeUrlOptions {
    config?: Pick<Partial<CoreConfig>, "lxnsBaseUrl">;
}

export function createLXNSOAuthAuthorizeUrl(
    clientId: string,
    redirectUri: string,
    codeChallenge: string,
    state: string,
    options: LXNSOAuthAuthorizeUrlOptions = {}
): string {
    const { lxnsBaseUrl } = resolveCoreConfig(options.config);
    const base = lxnsBaseUrl.replace(/\/+$/, "");
    const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        state,
        code_challenge_method: "S256",
        scope: LXNS_OAUTH_SCOPE,
    });
    return `${base}/oauth/authorize?${params}`;
}

export function parseLXNSOAuthCallback(value: string): LXNSOAuthCallback {
    const url = new URL(value);
    if (
        !["http:", "https:"].includes(url.protocol) ||
        !url.searchParams.has("lxns_auth_complete")
    ) {
        throw new Error("请粘贴落雪授权完成后显示的完整回调链接");
    }
    return {
        url: url.href,
        state: url.searchParams.get("state") || "",
        code: url.searchParams.get("code") || "",
        error: url.searchParams.get("error") || "",
        errorDescription: url.searchParams.get("error_description") || "",
    };
}

export function assertLXNSOAuthCallbackParameters(callback: LXNSOAuthCallback): void {
    if (!callback.state || (!callback.code && !callback.error)) {
        throw new Error("落雪授权回调参数缺失，请重新授权");
    }
}

export function validateLXNSOAuthTransaction(
    value: unknown,
    now: number
): LXNSOAuthTransaction | null {
    if (
        value &&
        typeof value === "object" &&
        typeof (value as LXNSOAuthTransaction).userUid === "string" &&
        (value as LXNSOAuthTransaction).userUid &&
        typeof (value as LXNSOAuthTransaction).codeVerifier === "string" &&
        LXNS_PKCE_VALUE.test((value as LXNSOAuthTransaction).codeVerifier) &&
        typeof (value as LXNSOAuthTransaction).clientId === "string" &&
        (value as LXNSOAuthTransaction).clientId &&
        typeof (value as LXNSOAuthTransaction).redirectUri === "string" &&
        (value as LXNSOAuthTransaction).redirectUri &&
        Number.isFinite((value as LXNSOAuthTransaction).expiresAt) &&
        (value as LXNSOAuthTransaction).expiresAt > now &&
        (value as LXNSOAuthTransaction).expiresAt <= now + LXNS_OAUTH_LIFETIME
    ) {
        return value as LXNSOAuthTransaction;
    }
    return null;
}

export function assertLXNSOAuthCallbackAddress(
    callback: LXNSOAuthCallback,
    transaction: LXNSOAuthTransaction
): void {
    const returnedUrl = new URL(callback.url);
    const redirectUrl = new URL(transaction.redirectUri);
    if (
        returnedUrl.origin !== redirectUrl.origin ||
        returnedUrl.pathname !== redirectUrl.pathname
    ) {
        throw new Error("授权回调地址不匹配，请使用落雪返回的完整链接");
    }
}

export function assertLXNSOAuthCallbackSucceeded(callback: LXNSOAuthCallback): void {
    if (callback.error) {
        throw new Error(`落雪授权失败：${callback.errorDescription || callback.error}`);
    }
}

export interface LXNSOAuthExchangeOptions extends LXNSTokenRequestOptions {
    now?: number;
}

export async function exchangeLXNSOAuthCode(
    code: string,
    transaction: LXNSOAuthTransaction,
    options: LXNSOAuthExchangeOptions = {}
): Promise<LXNSOAuthToken> {
    const { now, ...requestOptions } = options;
    const data = await requestLXNSToken(
        {
            grant_type: "authorization_code",
            code,
            client_id: transaction.clientId,
            redirect_uri: transaction.redirectUri,
            code_verifier: transaction.codeVerifier,
        },
        requestOptions
    );
    const expiresFrom = now ?? Date.now();
    return {
        auth: {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            tokenType: data.token_type,
        },
        expiresAt: data.expires_in
            ? expiresFrom + data.expires_in * 1000
            : jwtDecode<{ exp: number }>(data.access_token).exp * 1000,
    };
}

export function assertLXNSOAuthTokenUsable(token: LXNSOAuthToken, now = Date.now()): void {
    if (!Number.isFinite(token.expiresAt) || token.expiresAt <= now) {
        throw new LXNSTokenError("落雪授权已过期，请重新授权", "invalid_grant");
    }
}
