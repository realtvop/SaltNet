import type { LXNSAuth } from "@core/integrations/lxns/type";

export interface LXNSOAuthCallback {
    url: string;
    state: string;
    code: string;
    error: string;
    errorDescription: string;
}

export interface LXNSOAuthTransaction {
    userUid: string;
    codeVerifier: string;
    clientId: string;
    redirectUri: string;
    expiresAt: number;
    callback?: LXNSOAuthCallback;
    token?: { auth: LXNSAuth; expiresAt: number };
}

const STORAGE_PREFIX = "saltnet:lxns:oauth:";
const CALLBACK_STORAGE_KEY = "saltnet:lxns:callback";
export const LXNS_OAUTH_LIFETIME = 15 * 60 * 1000;
const CALLBACK_PARAMS = ["lxns_auth_complete", "code", "state", "error", "error_description"];
const PKCE_VALUE = /^[A-Za-z0-9_-]{43,128}$/;

let initialLXNSOAuthCallback: LXNSOAuthCallback | null = null;

export function getInitialLXNSOAuthCallback(): LXNSOAuthCallback | null {
    return initialLXNSOAuthCallback;
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

// Run before creating hash history, whose base otherwise retains the callback query.
export function captureLXNSOAuthCallback(): void {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("lxns_auth_complete")) {
        initialLXNSOAuthCallback = null;
        try {
            const stored = JSON.parse(
                window.sessionStorage.getItem(CALLBACK_STORAGE_KEY) || "null"
            );
            if (
                stored?.expiresAt > Date.now() &&
                stored.expiresAt <= Date.now() + LXNS_OAUTH_LIFETIME
            ) {
                initialLXNSOAuthCallback = parseLXNSOAuthCallback(stored.url);
            } else {
                window.sessionStorage.removeItem(CALLBACK_STORAGE_KEY);
            }
        } catch {
            // Callback handling still works when the browser blocks session storage.
        }
        return;
    }
    initialLXNSOAuthCallback = parseLXNSOAuthCallback(url.href);
    try {
        window.sessionStorage.setItem(
            CALLBACK_STORAGE_KEY,
            JSON.stringify({
                url: url.href,
                expiresAt: Date.now() + LXNS_OAUTH_LIFETIME,
            })
        );
    } catch {
        // Keep the in-memory callback available even if storage is unavailable.
    }
    for (const key of CALLBACK_PARAMS) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url.href);
}

export function clearCapturedLXNSOAuthCallback(state: string): void {
    if (initialLXNSOAuthCallback?.state !== state) return;
    initialLXNSOAuthCallback = null;
    try {
        window.sessionStorage.removeItem(CALLBACK_STORAGE_KEY);
    } catch {
        // Optional recovery storage must not turn a completed binding into a failure.
    }
}

export function storeLXNSOAuthTransaction(state: string, transaction: LXNSOAuthTransaction): void {
    window.localStorage.setItem(STORAGE_PREFIX + state, JSON.stringify(transaction));
}

export function removeLXNSOAuthTransaction(state: string): void {
    window.localStorage.removeItem(STORAGE_PREFIX + state);
}

export function getLXNSOAuthTransaction(state: string): LXNSOAuthTransaction | null {
    if (!PKCE_VALUE.test(state)) return null;
    const stored = window.localStorage.getItem(STORAGE_PREFIX + state);
    if (!stored) return null;
    try {
        const transaction = JSON.parse(stored) as LXNSOAuthTransaction;
        if (
            transaction &&
            typeof transaction.userUid === "string" &&
            transaction.userUid &&
            typeof transaction.codeVerifier === "string" &&
            PKCE_VALUE.test(transaction.codeVerifier) &&
            typeof transaction.clientId === "string" &&
            transaction.clientId &&
            typeof transaction.redirectUri === "string" &&
            transaction.redirectUri &&
            Number.isFinite(transaction.expiresAt) &&
            transaction.expiresAt > Date.now() &&
            transaction.expiresAt <= Date.now() + LXNS_OAUTH_LIFETIME
        ) {
            return transaction;
        }
    } catch {
        // Discard malformed or expired records without touching other requests.
    }
    removeLXNSOAuthTransaction(state);
    return null;
}

export function getPendingLXNSOAuthCallback(): LXNSOAuthCallback | null {
    let callback: LXNSOAuthCallback | null = null;
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const key = window.localStorage.key(i);
        if (!key?.startsWith(STORAGE_PREFIX)) continue;
        const state = key.slice(STORAGE_PREFIX.length);
        const transaction = getLXNSOAuthTransaction(state);
        if (transaction?.callback?.state === state) callback = transaction.callback;
    }
    return callback;
}
