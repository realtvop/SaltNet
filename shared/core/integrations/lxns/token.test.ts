import type { FetchLike } from "../../http";
import type { User } from "../../user/type";
import { describe, expect, it } from "vitest";
import {
    applyLXNSAuth,
    LXNSTokenError,
    refreshLXNSOAuthToken,
    requestLXNSToken,
    serializeFormBody,
} from "./token";

function base64UrlEncode(str: string): string {
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeFakeJwt(payload: { id: number; name: string; exp: number }): string {
    const header = base64UrlEncode(JSON.stringify({ alg: "none", typ: "JWT" }));
    const body = base64UrlEncode(JSON.stringify(payload));
    return `${header}.${body}.signature`;
}

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
                accessToken: makeFakeJwt({ id: 100, name: "test-user", exp: 2000000000 }),
                refreshToken: "refresh-old-token",
                tokenType: "Bearer",
            },
        },
        ...overrides,
    };
}

describe("serializeFormBody", () => {
    it("matches URLSearchParams.toString() for empty values and empty objects", () => {
        expect(serializeFormBody({})).toBe(new URLSearchParams({}).toString());
        expect(serializeFormBody({ empty: "" })).toBe(
            new URLSearchParams({ empty: "" }).toString()
        );
    });

    it("matches URLSearchParams.toString() on awkward and special characters", () => {
        const testCases: Record<string, string>[] = [
            { spaces: "hello world  spaced" },
            { plus: "1+1=2+3" },
            { ampersand: "a&b=c&d=e" },
            { equal: "key=val=more" },
            { percent: "100% pure %20" },
            { quotesAndParens: "!hello'(world)~" },
            { uriChars: "https://example.com/api/v0?foo=bar#section" },
            { chinese: "落雪咖啡屋 舞萌DX" },
            {
                allCombined: "  hello+world&foo=bar%20!'(~) 舞萌:/?#",
            },
        ];

        for (const params of testCases) {
            const expected = new URLSearchParams(params).toString();
            expect(serializeFormBody(params)).toBe(expected);
        }
    });

    it("writes unpaired surrogates as URLSearchParams does instead of throwing", () => {
        const params = {
            high: "a\uD800b",
            low: "a\uDC00b",
            reversed: "\uDC00\uD800",
            paired: "\uD83D\uDE00",
            trailing: "x\uD83D",
            "\uDFFF": "key",
        };

        expect(serializeFormBody(params)).toBe(new URLSearchParams(params).toString());
        expect(serializeFormBody({ high: "\uD800" })).toBe("high=%EF%BF%BD");
    });

    it("matches URLSearchParams.toString() on every ASCII character", () => {
        const ascii = Array.from({ length: 128 }, (_, code) => String.fromCharCode(code)).join("");
        const params = { [ascii]: ascii };

        expect(serializeFormBody(params)).toBe(new URLSearchParams(params).toString());
    });

    it("preserves insertion order of parameters", () => {
        const params = {
            grant_type: "refresh_token",
            refresh_token: "tok_123",
            client_id: "cid_456",
        };
        expect(serializeFormBody(params)).toBe(new URLSearchParams(params).toString());
        expect(serializeFormBody(params)).toBe(
            "grant_type=refresh_token&refresh_token=tok_123&client_id=cid_456"
        );
    });
});

describe("requestLXNSToken", () => {
    function jsonResponse(body: unknown, status = 200) {
        return {
            ok: status >= 200 && status < 300,
            status,
            json: async () => body,
            text: async () => JSON.stringify(body),
        };
    }

    it("requests token at default lxnsBaseUrl with application/x-www-form-urlencoded header", async () => {
        const calls: { url: string; init?: Parameters<FetchLike>[1] }[] = [];
        const mockFetch: FetchLike = async (url, init) => {
            calls.push({ url, init });
            return jsonResponse({
                access_token: "new-access",
                refresh_token: "new-refresh",
                token_type: "Bearer",
                expires_in: 3600,
            });
        };

        const result = await requestLXNSToken(
            { grant_type: "client_credentials", scope: "read" },
            { fetch: mockFetch }
        );

        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe("https://maimai.lxns.net/api/v0/oauth/token");
        expect(calls[0].init?.method).toBe("POST");
        expect(calls[0].init?.headers).toEqual({
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        });
        expect(calls[0].init?.body).toBe("grant_type=client_credentials&scope=read");
        expect(result).toEqual({
            access_token: "new-access",
            refresh_token: "new-refresh",
            token_type: "Bearer",
            expires_in: 3600,
        });
    });

    it("uses custom lxnsBaseUrl and strips trailing slashes", async () => {
        const calls: { url: string }[] = [];
        const mockFetch: FetchLike = async url => {
            calls.push({ url });
            return jsonResponse({
                access_token: "acc",
                refresh_token: "ref",
                token_type: "Bearer",
            });
        };

        await requestLXNSToken(
            { code: "123" },
            { config: { lxnsBaseUrl: "https://custom.lxns.org///" }, fetch: mockFetch }
        );

        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe("https://custom.lxns.org/api/v0/oauth/token");
    });

    it("accepts legacy enveloped responses", async () => {
        const mockFetch: FetchLike = async () =>
            jsonResponse({
                success: true,
                code: 200,
                data: {
                    access_token: "env-access",
                    refresh_token: "env-refresh",
                    token_type: "Bearer",
                    expires_in: 1800,
                },
            });

        const result = await requestLXNSToken(
            { grant_type: "authorization_code" },
            { fetch: mockFetch }
        );
        expect(result).toEqual({
            access_token: "env-access",
            refresh_token: "env-refresh",
            token_type: "Bearer",
            expires_in: 1800,
        });
    });

    it("reports OAuth error with description", async () => {
        const mockFetch: FetchLike = async () =>
            jsonResponse(
                { error: "invalid_grant", error_description: "authorization code has expired" },
                400
            );

        const error = await requestLXNSToken({}, { fetch: mockFetch }).catch(err => err);
        expect(error).toBeInstanceOf(LXNSTokenError);
        expect((error as LXNSTokenError).oauthError).toBe("invalid_grant");
        expect((error as LXNSTokenError).message).toBe(
            "落雪授权失败：authorization code has expired"
        );
    });

    it("throws an error whose text reads like a plain Error, as the web app shows it", async () => {
        const mockFetch: FetchLike = async () => jsonResponse({ error: "invalid_client" }, 401);

        const error = await requestLXNSToken({}, { fetch: mockFetch }).catch(err => err);
        expect(error).toBeInstanceOf(LXNSTokenError);
        expect((error as LXNSTokenError).name).toBe("Error");
        expect(String(error)).toBe("Error: 落雪授权失败：invalid_client");
    });

    it("reports OAuth error without description", async () => {
        const mockFetch: FetchLike = async () => jsonResponse({ error: "invalid_client" }, 401);

        const error = await requestLXNSToken({}, { fetch: mockFetch }).catch(err => err);
        expect(error).toBeInstanceOf(LXNSTokenError);
        expect((error as LXNSTokenError).oauthError).toBe("invalid_client");
        expect((error as LXNSTokenError).message).toBe("落雪授权失败：invalid_client");
    });

    it("handles non-JSON error response with HTTP status code", async () => {
        const mockFetch: FetchLike = async () => ({
            ok: false,
            status: 502,
            json: async () => {
                throw new Error("Invalid JSON");
            },
            text: async () => "Bad Gateway",
        });

        const error = await requestLXNSToken({}, { fetch: mockFetch }).catch(err => err);
        expect(error).toBeInstanceOf(LXNSTokenError);
        expect((error as LXNSTokenError).oauthError).toBe("");
        expect((error as LXNSTokenError).message).toBe("落雪授权失败：HTTP 502");
    });

    it("reports legacy envelope with success: false", async () => {
        const mockFetch: FetchLike = async () => jsonResponse({ success: false, code: 400 }, 400);

        const error = await requestLXNSToken({}, { fetch: mockFetch }).catch(err => err);
        expect(error).toBeInstanceOf(LXNSTokenError);
        expect((error as LXNSTokenError).message).toBe("落雪授权失败：HTTP 400");
    });

    it("rejects with HTTP status on HTTP 200 response with success: false", async () => {
        const mockFetch: FetchLike = async () => jsonResponse({ success: false }, 200);

        const error = await requestLXNSToken({}, { fetch: mockFetch }).catch(err => err);
        expect(error).toBeInstanceOf(LXNSTokenError);
        expect((error as LXNSTokenError).message).toBe("落雪授权失败：HTTP 200");
        expect((error as LXNSTokenError).oauthError).toBe("");
    });

    it.each([
        ["missing access_token", { refresh_token: "ref", token_type: "Bearer" }],
        ["empty access_token", { access_token: "", refresh_token: "ref", token_type: "Bearer" }],
        ["missing refresh_token", { access_token: "acc", token_type: "Bearer" }],
        ["empty refresh_token", { access_token: "acc", refresh_token: "", token_type: "Bearer" }],
        ["missing token_type", { access_token: "acc", refresh_token: "ref" }],
        ["empty token_type", { access_token: "acc", refresh_token: "ref", token_type: "" }],
    ])("rejects when payload has %s", async (_, body) => {
        const mockFetch: FetchLike = async () => jsonResponse(body);

        await expect(requestLXNSToken({}, { fetch: mockFetch })).rejects.toThrow(
            "落雪授权响应缺少有效的令牌，请重新授权"
        );
    });

    it.each([
        ["zero", 0, undefined],
        ["negative", -60, undefined],
        ["non-number string", "3600", undefined],
        ["Infinity", Number.POSITIVE_INFINITY, undefined],
        ["NaN", Number.NaN, undefined],
        ["positive integer", 7200, 7200],
    ])("normalizes expires_in (%s)", async (_, inputExpiresIn, expected) => {
        const mockFetch: FetchLike = async () =>
            jsonResponse({
                access_token: "acc",
                refresh_token: "ref",
                token_type: "Bearer",
                expires_in: inputExpiresIn,
            });

        const result = await requestLXNSToken({}, { fetch: mockFetch });
        expect(result.expires_in).toBe(expected);
    });

    it("ensures no token is leaked in error messages", async () => {
        const sensitiveToken = "secret-token-xyz-123456789";
        const mockFetch: FetchLike = async () => jsonResponse({ error: "server_error" }, 500);

        const error = await requestLXNSToken(
            { refresh_token: sensitiveToken },
            { fetch: mockFetch }
        ).catch(err => err);

        expect(String(error)).not.toContain(sensitiveToken);
    });

    it("passes through network rejection", async () => {
        const networkError = new TypeError("Failed to fetch");
        const mockFetch: FetchLike = async () => {
            throw networkError;
        };

        await expect(requestLXNSToken({}, { fetch: mockFetch })).rejects.toBe(networkError);
    });
});

describe("applyLXNSAuth", () => {
    it("throws when accessToken is missing", () => {
        const user = makeUser();
        expect(() =>
            applyLXNSAuth(user, { accessToken: "", refreshToken: "r", tokenType: "Bearer" })
        ).toThrow("No access token available");
    });

    it("derives expiresAt from expiresIn parameter", () => {
        const user = makeUser();
        const jwt = makeFakeJwt({ id: 100, name: "user", exp: 1000 });
        const now = Date.now();

        const auth = applyLXNSAuth(
            user,
            { accessToken: jwt, refreshToken: "ref", tokenType: "Bearer" },
            300
        );

        expect(auth.expiresAt).toBeGreaterThanOrEqual(now + 300000);
        expect(user.lxns?.auth?.expiresAt).toBe(auth.expiresAt);
        expect(user.lxns?.name).toBe("user");
        expect(user.lxns?.id).toBe(100);
    });

    it("derives expiresAt from JWT exp when expiresIn is omitted", () => {
        const user = makeUser();
        const expSeconds = 1750000000;
        const jwt = makeFakeJwt({ id: 100, name: "user", exp: expSeconds });

        const auth = applyLXNSAuth(user, {
            accessToken: jwt,
            refreshToken: "ref",
            tokenType: "Bearer",
        });

        expect(auth.expiresAt).toBe(expSeconds * 1000);
        expect(user.lxns?.auth?.expiresAt).toBe(expSeconds * 1000);
    });

    it("throws when identity changes unexpectedly", () => {
        const user = makeUser();
        const jwtDifferentId = makeFakeJwt({ id: 999, name: "other-user", exp: 2000000000 });

        expect(() =>
            applyLXNSAuth(user, {
                accessToken: jwtDifferentId,
                refreshToken: "ref",
                tokenType: "Bearer",
            })
        ).toThrow("LXNS token identity changed unexpectedly");
    });
});

describe("refreshLXNSOAuthToken", () => {
    it("throws when user has no refresh token", async () => {
        const user = makeUser({ lxns: undefined });
        await expect(refreshLXNSOAuthToken(user)).rejects.toThrow("No refresh token available");
    });

    it("refreshes token with custom client id and baseUrl", async () => {
        const calls: { url: string; body?: string }[] = [];
        const nextJwt = makeFakeJwt({ id: 100, name: "test-user", exp: 2000000000 });
        const mockFetch: FetchLike = async (url, init) => {
            calls.push({ url, body: init?.body });
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    access_token: nextJwt,
                    refresh_token: "refreshed-token",
                    token_type: "Bearer",
                    expires_in: 900,
                }),
                text: async () => "",
            };
        };

        const user = makeUser();
        const auth = await refreshLXNSOAuthToken(user, {
            config: { lxnsClientId: "my-custom-client", lxnsBaseUrl: "https://lxns.my-test.net" },
            fetch: mockFetch,
        });

        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe("https://lxns.my-test.net/api/v0/oauth/token");
        expect(calls[0].body).toBe(
            "grant_type=refresh_token&refresh_token=refresh-old-token&client_id=my-custom-client"
        );
        expect(auth.refreshToken).toBe("refreshed-token");
        expect(user.lxns?.auth?.refreshToken).toBe("refreshed-token");
    });

    it("clears user binding on invalid_grant error", async () => {
        const calls: string[] = [];
        const mockFetch: FetchLike = async url => {
            calls.push(url);
            return {
                ok: false,
                status: 400,
                json: async () => ({ error: "invalid_grant", error_description: "token expired" }),
                text: async () => "",
            };
        };

        const user = makeUser();
        await expect(refreshLXNSOAuthToken(user, { fetch: mockFetch })).rejects.toThrow(
            "落雪授权失败：token expired"
        );

        expect(calls).toHaveLength(1);
        expect(user.lxns).toEqual({ auth: null, name: null, id: null });
    });

    it("preserves user binding on server or non-grant error", async () => {
        const calls: string[] = [];
        const mockFetch: FetchLike = async url => {
            calls.push(url);
            return {
                ok: false,
                status: 503,
                json: async () => ({ error: "server_error" }),
                text: async () => "",
            };
        };

        const user = makeUser();
        await expect(refreshLXNSOAuthToken(user, { fetch: mockFetch })).rejects.toThrow();

        expect(calls).toHaveLength(1);
        expect(user.lxns?.auth?.refreshToken).toBe("refresh-old-token");
    });
});
