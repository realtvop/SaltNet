import type { User } from "@core/user/type";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLXNSApi } from "./fetch";

function makeUser(overrides: Partial<User> = {}): User {
    return {
        uid: "user-test",
        divingFish: { name: null },
        inGame: { id: null },
        settings: { manuallyUpdate: false },
        data: { updateTime: null, name: null, rating: null },
        lxns: {
            id: 100,
            name: "test-user",
            auth: {
                accessToken: "made-access-token",
                refreshToken: "made-refresh-token",
                tokenType: "Bearer",
                expiresAt: Date.now() + 3600_000,
            },
        },
        ...overrides,
    };
}

function stubFetch(responseBody: unknown, status = 200) {
    const calls: [string, RequestInit | undefined][] = [];
    const fetchStub = vi
        .fn()
        .mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
            calls.push([String(url), init]);
            return new Response(JSON.stringify(responseBody), {
                status,
                headers: { "Content-Type": "application/json" },
            });
        });
    vi.stubGlobal("fetch", fetchStub);
    return { calls, fetchStub };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("fetchLXNSApi", () => {
    it("sends request to default player endpoint with no endpoint and no init", async () => {
        const user = makeUser();
        const { calls, fetchStub } = stubFetch({ success: true, data: {} });

        await fetchLXNSApi(user);

        expect(fetchStub).toHaveBeenCalledTimes(1);
        expect(calls).toHaveLength(1);
        const [url, init] = calls[0];
        expect(url).toBe("https://maimai.lxns.net/api/v0/user/maimai/player");
        expect(init?.method).toBeUndefined();
        expect(init?.body).toBeUndefined();
        expect(init?.headers).toEqual({
            Authorization: `${user.lxns!.auth!.tokenType} ${user.lxns!.auth!.accessToken}`,
        });
    });

    it("sends request with endpoint and init preserving header ordering", async () => {
        const user = makeUser();
        const bodyString = JSON.stringify({ scores: [] });
        const { calls, fetchStub } = stubFetch({ success: true, data: [] });

        await fetchLXNSApi(user, "scores", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: bodyString,
        });

        expect(fetchStub).toHaveBeenCalledTimes(1);
        expect(calls).toHaveLength(1);
        const [url, init] = calls[0];
        expect(url.endsWith("/player/scores")).toBe(true);
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(bodyString);
        expect(Object.entries(init?.headers ?? {})).toEqual([
            ["Content-Type", "application/json"],
            ["Authorization", `${user.lxns!.auth!.tokenType} ${user.lxns!.auth!.accessToken}`],
        ]);
    });

    it("resolves to response data on success", async () => {
        const user = makeUser();
        const { fetchStub } = stubFetch({ success: true, data: { made: 1 } });

        const result = await fetchLXNSApi<{ made: number }>(user);

        expect(fetchStub).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ made: 1 });
    });

    it("rejects with plain Error on HTTP 500 with success: false without leaking token", async () => {
        const user = makeUser();
        const { fetchStub } = stubFetch({ success: false }, 500);

        const error = await fetchLXNSApi(user).catch((err: unknown) => err);

        expect(fetchStub).toHaveBeenCalledTimes(1);
        expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
        expect(String(error)).toBe("Error: LXNS API request failed (HTTP 500)");
        expect((error as Error).message).not.toContain(user.lxns!.auth!.accessToken);
        expect(String(error)).not.toContain(user.lxns!.auth!.accessToken);
    });

    it("rejects with plain Error on HTTP 200 with success: false without leaking token", async () => {
        const user = makeUser();
        const { fetchStub } = stubFetch({ success: false }, 200);

        const error = await fetchLXNSApi(user).catch((err: unknown) => err);

        expect(fetchStub).toHaveBeenCalledTimes(1);
        expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
        expect(String(error)).toBe("Error: LXNS API request failed (HTTP 200)");
        expect((error as Error).message).not.toContain(user.lxns!.auth!.accessToken);
        expect(String(error)).not.toContain(user.lxns!.auth!.accessToken);
    });
});
