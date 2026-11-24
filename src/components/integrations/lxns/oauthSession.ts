import type { LXNSOAuthCallback, LXNSOAuthTransaction } from "@core/integrations/lxns/oauth";
import {
    LXNS_OAUTH_LIFETIME,
    LXNS_PKCE_VALUE,
    parseLXNSOAuthCallback,
    validateLXNSOAuthTransaction,
} from "@core/integrations/lxns/oauth";

export type { LXNSOAuthCallback, LXNSOAuthTransaction };
export { LXNS_OAUTH_LIFETIME, parseLXNSOAuthCallback };

const STORAGE_PREFIX = "saltnet:lxns:oauth:";
const CALLBACK_STORAGE_KEY = "saltnet:lxns:callback";
const CALLBACK_PARAMS = ["lxns_auth_complete", "code", "state", "error", "error_description"];

let initialLXNSOAuthCallback: LXNSOAuthCallback | null = null;

export function getInitialLXNSOAuthCallback(): LXNSOAuthCallback | null {
    return initialLXNSOAuthCallback;
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
    if (initialLXNSOAuthCallback?.state !== state) {
        return;
    }
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
    if (!LXNS_PKCE_VALUE.test(state)) {
        return null;
    }
    const stored = window.localStorage.getItem(STORAGE_PREFIX + state);
    if (!stored) {
        return null;
    }
    try {
        const transaction = validateLXNSOAuthTransaction(JSON.parse(stored), Date.now());
        if (transaction) {
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
        if (!key?.startsWith(STORAGE_PREFIX)) {
            continue;
        }
        const state = key.slice(STORAGE_PREFIX.length);
        const transaction = getLXNSOAuthTransaction(state);
        if (transaction?.callback?.state === state) {
            callback = transaction.callback;
        }
    }
    return callback;
}
