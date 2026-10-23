import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    captureLXNSOAuthCallback,
    clearCapturedLXNSOAuthCallback,
    getLXNSOAuthTransaction,
    getPendingLXNSOAuthCallback,
    getInitialLXNSOAuthCallback,
    LXNS_OAUTH_LIFETIME,
    parseLXNSOAuthCallback,
    storeLXNSOAuthTransaction,
    type LXNSOAuthTransaction,
} from "./oauthSession";

function createStorage(): Storage {
    const data = new Map<string, string>();
    return {
        get length() {
            return data.size;
        },
        key: index => [...data.keys()][index] ?? null,
        getItem: key => data.get(key) ?? null,
        setItem: (key, value) => {
            data.set(key, value);
        },
        removeItem: key => {
            data.delete(key);
        },
        clear: () => data.clear(),
    };
}

const state = "a".repeat(86);
const otherState = "b".repeat(86);
function transaction(): LXNSOAuthTransaction {
    return {
        userUid: "user-a",
        codeVerifier: "v".repeat(86),
        clientId: "test-client",
        redirectUri: "https://salt.test/?lxns_auth_complete",
        expiresAt: Date.now() + LXNS_OAUTH_LIFETIME,
    };
}

beforeEach(() => {
    vi.stubGlobal("window", { localStorage: createStorage(), sessionStorage: createStorage() });
});
afterEach(() => vi.unstubAllGlobals());

describe("OAuth transaction storage", () => {
    it("survives replacement of the tab's session storage", () => {
        storeLXNSOAuthTransaction(state, transaction());
        Object.assign(window, { sessionStorage: createStorage() });
        expect(getLXNSOAuthTransaction(state)?.userUid).toBe("user-a");
    });

    it("does not remove a newer request for an unknown state", () => {
        storeLXNSOAuthTransaction(state, transaction());
        expect(getLXNSOAuthTransaction(otherState)).toBeNull();
        expect(getLXNSOAuthTransaction(state)).not.toBeNull();
    });

    it("expires one transaction without removing another", () => {
        storeLXNSOAuthTransaction(state, { ...transaction(), expiresAt: Date.now() - 1 });
        storeLXNSOAuthTransaction(otherState, transaction());
        expect(getLXNSOAuthTransaction(state)).toBeNull();
        expect(getLXNSOAuthTransaction(otherState)).not.toBeNull();
        expect(window.localStorage.length).toBe(1);
    });

    it("discards corrupt storage and finds a callback retained after a failed request", () => {
        window.localStorage.setItem(`saltnet:lxns:oauth:${otherState}`, "not json");
        const callback = parseLXNSOAuthCallback(
            `https://salt.test/?lxns_auth_complete&state=${state}&code=test-code`
        );
        storeLXNSOAuthTransaction(state, { ...transaction(), callback });
        expect(getPendingLXNSOAuthCallback()).toEqual(callback);
        expect(window.localStorage.length).toBe(1);
    });
});

describe("callback URL capture before router initialization", () => {
    it.each(["", "#/users?keep=hash", "#/"])(
        "removes OAuth search parameters and retains unrelated query and hash (%s)",
        hash => {
            const historyState = { current: "/users", position: 3 };
            const replaceState = vi.fn();
            Object.assign(window, {
                location: {
                    href: `https://salt.test/?keep=search&lxns_auth_complete&code=test-code&state=${state}${hash}`,
                },
                history: { state: historyState, replaceState },
            });
            captureLXNSOAuthCallback();
            expect(getInitialLXNSOAuthCallback()?.code).toBe("test-code");
            expect(replaceState).toHaveBeenCalledWith(
                historyState,
                "",
                `https://salt.test/?keep=search${hash}`
            );
        }
    );

    it("leaves regular links and their query parameters unchanged", () => {
        const replaceState = vi.fn();
        Object.assign(window, {
            location: { href: "https://salt.test/?code=unrelated#/songs" },
            history: { replaceState },
        });
        captureLXNSOAuthCallback();
        expect(replaceState).not.toHaveBeenCalled();
    });

    it("retains an isolated-browser callback through reload until it is completed or dismissed", () => {
        Object.assign(window, {
            location: {
                href: `https://salt.test/?lxns_auth_complete&code=test-code&state=${state}#/users`,
            },
            history: { state: null, replaceState: vi.fn() },
        });
        captureLXNSOAuthCallback();
        window.location.href = "https://salt.test/#/users";
        captureLXNSOAuthCallback();
        expect(getInitialLXNSOAuthCallback()?.state).toBe(state);
        clearCapturedLXNSOAuthCallback(otherState);
        expect(getInitialLXNSOAuthCallback()?.state).toBe(state);
        clearCapturedLXNSOAuthCallback(state);
        captureLXNSOAuthCallback();
        expect(getInitialLXNSOAuthCallback()).toBeNull();
    });

    it("rejects unrelated and non-web recovery links", () => {
        expect(() => parseLXNSOAuthCallback("https://salt.test/?code=unrelated")).toThrow();
        expect(() => parseLXNSOAuthCallback("javascript:alert(1)?lxns_auth_complete")).toThrow();
    });
});
