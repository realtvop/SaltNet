import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/components/data/user/type";

const mocks = vi.hoisted(() => ({
    shared: { users: [] as User[], usersLoaded: Promise.resolve(), persistUsers: vi.fn() },
    confirm: vi.fn(),
    snackbar: vi.fn(),
    reset: vi.fn(),
}));
vi.mock("@/components/app/shared", () => ({ useShared: () => mocks.shared }));
vi.mock("@/components/app/router", () => ({ markDialogOpen: vi.fn(), markDialogClosed: vi.fn() }));
vi.mock("mdui", () => ({ confirm: mocks.confirm, snackbar: mocks.snackbar }));
vi.mock("@/components/data/user/scoreHistory", () => ({
    createUserUid: () => "created-user",
    deleteScoreHistoryForUser: vi.fn(),
    drainAndDiscardScoreHistoryForUser: vi.fn(),
    resetUserForNewIdentity: mocks.reset,
}));
vi.mock("@/components/data/user/update/updateUser", () => ({ cancelPendingUserUpdates: vi.fn() }));

import { handleLXNSOAuthCallback, initLXNSOAuth, LXNSOAuthRecoveryError } from "./oauth";
import {
    getLXNSOAuthTransaction,
    getPendingLXNSOAuthCallback,
    parseLXNSOAuthCallback,
} from "./oauthSession";

function storage(): Storage {
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
function user(uid: string): User {
    return {
        uid,
        divingFish: { name: null },
        inGame: { id: null },
        settings: { manuallyUpdate: false },
        data: { updateTime: null, name: null, rating: null },
        lxns: { id: null, name: null, auth: null },
    };
}
function tokenResponse(): Response {
    return new Response(
        JSON.stringify({
            access_token: `e30.${btoa(JSON.stringify({ id: 123, name: "test", exp: 2000000000 }))}.test`,
            refresh_token: "test-refresh",
            token_type: "Bearer",
            expires_in: 900,
        })
    );
}
async function start(index = 0) {
    const authorizationUrl = new URL(await initLXNSOAuth(index));
    const state = authorizationUrl.searchParams.get("state")!;
    return parseLXNSOAuthCallback(
        `https://salt.test/?lxns_auth_complete&state=${state}&code=test-code`
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_LXNS_OAUTH_CLIENT_ID", "test-client");
    vi.stubEnv("VITE_LXNS_OAUTH_REDIRECT_URI", "https://salt.test/?lxns_auth_complete");
    vi.stubGlobal("window", { localStorage: storage(), sessionStorage: storage(), crypto, btoa });
    vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async () => tokenResponse())
    );
    mocks.shared.users = [user("user-a"), user("user-b")];
    mocks.shared.persistUsers.mockResolvedValue(undefined);
    mocks.confirm.mockResolvedValue(undefined);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("LXNS OAuth round trip", () => {
    it("waits for the new user to be persisted before returning the authorization URL", async () => {
        let release!: () => void;
        mocks.shared.persistUsers.mockReturnValueOnce(
            new Promise<void>(resolve => {
                release = resolve;
            })
        );
        let completed = false;
        const starting = initLXNSOAuth(0).then(url => {
            completed = true;
            return url;
        });
        await vi.waitFor(() => expect(mocks.shared.persistUsers).toHaveBeenCalled());
        expect(completed).toBe(false);
        expect(window.localStorage.length).toBe(0);
        release();
        expect(new URL(await starting).searchParams.get("code_challenge_method")).toBe("S256");
    });

    it("binds the original uid after user reordering and sessionStorage replacement", async () => {
        const callback = await start();
        window.sessionStorage.clear();
        mocks.shared.users.reverse();
        await handleLXNSOAuthCallback(callback);
        expect(mocks.shared.users.find(user => user.uid === "user-a")?.lxns?.id).toBe(123);
        expect(mocks.shared.users.find(user => user.uid === "user-b")?.lxns?.id).toBeNull();
        expect(getLXNSOAuthTransaction(callback.state)).toBeNull();
        expect(mocks.shared.persistUsers).toHaveBeenCalledTimes(2);
    });

    it("uses the original client and redirect URI even if configuration changes", async () => {
        const callback = await start();
        vi.stubEnv("VITE_LXNS_OAUTH_CLIENT_ID", "other-client");
        vi.stubEnv("VITE_LXNS_OAUTH_REDIRECT_URI", "https://other.test/");
        await handleLXNSOAuthCallback(callback);
        const body = vi.mocked(fetch).mock.calls[0][1]!.body as URLSearchParams;
        expect(body.get("client_id")).toBe("test-client");
        expect(body.get("redirect_uri")).toBe("https://salt.test/?lxns_auth_complete");
    });

    it("keeps newer authorizations when an unrelated callback arrives", async () => {
        const first = await start();
        const second = await start(1);
        await expect(
            handleLXNSOAuthCallback({ ...first, state: "x".repeat(86) })
        ).rejects.toBeInstanceOf(LXNSOAuthRecoveryError);
        expect(getLXNSOAuthTransaction(first.state)).not.toBeNull();
        expect(getLXNSOAuthTransaction(second.state)).not.toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });

    it("keeps a failed callback across reloads for retry", async () => {
        const callback = await start();
        vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
        await expect(handleLXNSOAuthCallback(callback)).rejects.toThrow("Failed to fetch");
        expect(getPendingLXNSOAuthCallback()).toEqual(callback);
        await handleLXNSOAuthCallback(getPendingLXNSOAuthCallback()!);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(getLXNSOAuthTransaction(callback.state)).toBeNull();
    });

    it("deduplicates simultaneous handling of the same callback", async () => {
        const callback = await start();
        const first = handleLXNSOAuthCallback(callback);
        const second = handleLXNSOAuthCallback(callback);
        expect(first).toBe(second);
        await Promise.all([first, second]);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("reuses an exchanged token when saving the user fails, without redeeming the code again", async () => {
        const callback = await start();
        mocks.shared.persistUsers.mockRejectedValueOnce(
            new Error("storage temporarily unavailable")
        );
        await expect(handleLXNSOAuthCallback(callback)).rejects.toThrow(
            "storage temporarily unavailable"
        );
        expect(getLXNSOAuthTransaction(callback.state)?.token?.auth.refreshToken).toBe(
            "test-refresh"
        );
        await handleLXNSOAuthCallback(getPendingLXNSOAuthCallback()!);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(getLXNSOAuthTransaction(callback.state)).toBeNull();
    });

    it("leaves isolated-browser callbacks available for manual return without exchanging codes", async () => {
        const callback = await start();
        const originalStorage = window.localStorage;
        Object.assign(window, { localStorage: storage() });
        await expect(handleLXNSOAuthCallback(callback)).rejects.toBeInstanceOf(
            LXNSOAuthRecoveryError
        );
        expect(fetch).not.toHaveBeenCalled();
        Object.assign(window, { localStorage: originalStorage });
        await handleLXNSOAuthCallback(parseLXNSOAuthCallback(callback.url));
        expect(mocks.shared.users[0].lxns?.id).toBe(123);
    });

    it("rejects a removed user instead of binding another user at the old index", async () => {
        const callback = await start();
        mocks.shared.users.shift();
        await expect(handleLXNSOAuthCallback(callback)).rejects.toThrow("已被删除");
        expect(fetch).not.toHaveBeenCalled();
        expect(mocks.shared.users[0].lxns?.id).toBeNull();
    });

    it("rejects a callback from an unexpected origin without discarding the request", async () => {
        const callback = await start();
        await expect(
            handleLXNSOAuthCallback({
                ...callback,
                url: callback.url.replace("salt.test", "other.test"),
            })
        ).rejects.toThrow("回调地址不匹配");
        expect(fetch).not.toHaveBeenCalled();
        expect(getLXNSOAuthTransaction(callback.state)).not.toBeNull();
    });

    it("handles access denial for only the matching transaction", async () => {
        const callback = await start();
        const other = await start(1);
        await expect(
            handleLXNSOAuthCallback({ ...callback, code: "", error: "access_denied" })
        ).rejects.toThrow("access_denied");
        expect(getLXNSOAuthTransaction(callback.state)).toBeNull();
        expect(getLXNSOAuthTransaction(other.state)).not.toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });

    it("removes an invalid grant but retains other pending authorizations", async () => {
        const callback = await start();
        const other = await start(1);
        vi.mocked(fetch).mockResolvedValueOnce(
            new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })
        );
        await expect(handleLXNSOAuthCallback(callback)).rejects.toThrow("invalid_grant");
        expect(getLXNSOAuthTransaction(callback.state)).toBeNull();
        expect(getLXNSOAuthTransaction(other.state)).not.toBeNull();
    });

    it("does not change identity if the user cancels the confirmation", async () => {
        mocks.shared.users[0].lxns!.id = 456;
        const callback = await start();
        mocks.confirm.mockRejectedValueOnce(new Error("cancel"));
        await expect(handleLXNSOAuthCallback(callback)).rejects.toThrow("已取消");
        expect(mocks.shared.users[0].lxns?.id).toBe(456);
        expect(mocks.reset).not.toHaveBeenCalled();
        expect(getLXNSOAuthTransaction(callback.state)).toBeNull();
    });

    it("completes an in-progress authorization from the previous sessionStorage format", async () => {
        const state = "s".repeat(86);
        window.sessionStorage.setItem("lxns_oauth_state", state);
        window.sessionStorage.setItem("lxns_oauth_code_verifier", "v".repeat(86));
        window.sessionStorage.setItem("lxns_oauth_user_index", "0");
        const callback = parseLXNSOAuthCallback(
            `https://salt.test/?lxns_auth_complete&state=${state}&code=legacy-code`
        );
        await handleLXNSOAuthCallback(callback);
        expect(mocks.shared.users[0].lxns?.id).toBe(123);
        expect(window.sessionStorage.length).toBe(0);
    });
});
