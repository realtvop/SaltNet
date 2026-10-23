import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/components/data/user/type";
import { refreshLXNSOAuthToken, requestLXNSToken } from "./token";

function token(id = 123): string {
    return `e30.${btoa(JSON.stringify({ id, name: "test", exp: 2000000000 }))}.test`;
}
function user(): User {
    return {
        uid: "user-a",
        divingFish: { name: null },
        inGame: { id: null },
        settings: { manuallyUpdate: false },
        data: { updateTime: null, name: null, rating: null },
        lxns: {
            id: 123,
            name: "test",
            auth: { accessToken: token(), refreshToken: "old", tokenType: "Bearer" },
        },
    };
}
const response = () => ({
    access_token: token(),
    refresh_token: "rotated",
    token_type: "Bearer",
    expires_in: 900,
});
function mockResponse(body: unknown, status = 200) {
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
    );
}
afterEach(() => vi.unstubAllGlobals());

describe("LXNS token endpoint", () => {
    it.each(["flat", "legacy"])("accepts %s token responses", async format => {
        const data = response();
        mockResponse(format === "flat" ? data : { success: true, code: 200, data });
        await expect(requestLXNSToken(new URLSearchParams())).resolves.toEqual(data);
    });

    it("reports OAuth errors without treating them as successful API envelopes", async () => {
        mockResponse(
            { error: "invalid_grant", error_description: "authorization code expired" },
            400
        );
        await expect(requestLXNSToken(new URLSearchParams())).rejects.toMatchObject({
            oauthError: "invalid_grant",
            message: "落雪授权失败：authorization code expired",
        });
    });

    it("saves rotated refresh tokens and expires_in from flat responses", async () => {
        mockResponse(response());
        const target = user();
        const now = Date.now();
        await refreshLXNSOAuthToken(target);
        expect(target.lxns?.auth?.refreshToken).toBe("rotated");
        expect(target.lxns?.auth?.expiresAt).toBeGreaterThanOrEqual(now + 900000);
    });

    it.each([
        [503, { error: "server_error" }],
        [400, { error: "invalid_client" }],
        [200, { access_token: "incomplete" }],
    ])("preserves the binding for a non-session error (%s)", async (status, body) => {
        mockResponse(body, status);
        const target = user();
        await expect(refreshLXNSOAuthToken(target)).rejects.toThrow();
        expect(target.lxns?.auth?.refreshToken).toBe("old");
    });

    it("clears a binding only when the refresh grant is invalid", async () => {
        mockResponse({ error: "invalid_grant" }, 400);
        const target = user();
        await expect(refreshLXNSOAuthToken(target)).rejects.toThrow();
        expect(target.lxns?.auth).toBeNull();
    });
});
