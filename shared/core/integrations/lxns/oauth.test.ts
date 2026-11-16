import type { FetchLike } from "../../http";
import type { LXNSOAuthCallback, LXNSOAuthTransaction } from "./oauth";
import { describe, expect, it, vi } from "vitest";
import {
    assertLXNSOAuthCallbackAddress,
    assertLXNSOAuthCallbackParameters,
    assertLXNSOAuthCallbackSucceeded,
    assertLXNSOAuthTokenUsable,
    base64UrlEncode,
    createLXNSOAuthAuthorizeUrl,
    exchangeLXNSOAuthCode,
    generateCodeChallenge,
    generateCodeVerifier,
    LXNS_OAUTH_LIFETIME,
    LXNS_PKCE_VALUE,
    parseLXNSOAuthCallback,
    validateLXNSOAuthTransaction,
} from "./oauth";
import { LXNSTokenError } from "./token";

const rfc7636Octets = Uint8Array.from([
    116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77,
    105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121,
]);
const rfc7636Verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const rfc7636Challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

function transaction(overrides: Partial<LXNSOAuthTransaction> = {}): LXNSOAuthTransaction {
    return {
        userUid: "made-user",
        codeVerifier: "v".repeat(86),
        clientId: "made-client",
        redirectUri: "https://saltnet.example/callback?lxns_auth_complete",
        expiresAt: 1_900_000,
        ...overrides,
    };
}

function callback(overrides: Partial<LXNSOAuthCallback> = {}): LXNSOAuthCallback {
    return {
        url: "https://saltnet.example/callback?lxns_auth_complete&state=made-state&code=made-code",
        state: "made-state",
        code: "made-code",
        error: "",
        errorDescription: "",
        ...overrides,
    };
}

function madeJwt(exp: number): string {
    return `e30.${base64UrlEncode(new TextEncoder().encode(JSON.stringify({ exp })))}.test`;
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
}

describe("lxns OAuth PKCE", () => {
    it("matches RFC 7636 appendix B with the default SHA-256 digest", async () => {
        expect(base64UrlEncode(rfc7636Octets)).toBe(rfc7636Verifier);
        await expect(generateCodeChallenge(rfc7636Verifier)).resolves.toBe(rfc7636Challenge);
    });

    it("passes the verifier UTF-8 bytes to an injected digest", async () => {
        const digest = vi.fn(async (bytes: Uint8Array) => crypto.subtle.digest("SHA-256", bytes));

        await expect(generateCodeChallenge(rfc7636Verifier, digest)).resolves.toBe(
            rfc7636Challenge
        );
        expect(digest).toHaveBeenCalledOnce();
        expect([...digest.mock.calls[0][0]]).toEqual([
            ...new TextEncoder().encode(rfc7636Verifier),
        ]);
    });

    it("asks an injected source for 64 bytes and encodes its exact bytes", () => {
        const random = vi.fn((bytes: Uint8Array) => {
            expect(bytes).toHaveLength(64);
            bytes.set(Array.from({ length: 64 }, (_, index) => index));
        });

        const verifier = generateCodeVerifier(random);
        expect(random).toHaveBeenCalledOnce();
        expect(verifier).toBe(
            "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0-Pw"
        );
        expect(verifier).toHaveLength(86);
        expect(verifier).not.toContain("=");
        expect(LXNS_PKCE_VALUE.test(verifier)).toBe(true);
    });

    it("uses URL-safe '-' and '_' characters without padding", () => {
        expect(base64UrlEncode(Uint8Array.from([251, 255, 0]))).toBe("-_8A");
    });

    it("uses the default cryptographic random source", () => {
        const first = generateCodeVerifier();
        const second = generateCodeVerifier();
        expect(first).not.toBe(second);
        expect(LXNS_PKCE_VALUE.test(first)).toBe(true);
        expect(LXNS_PKCE_VALUE.test(second)).toBe(true);
    });
});

describe("lxns OAuth authorize URL", () => {
    const expectedQuery =
        "response_type=code&client_id=made-client&redirect_uri=https%3A%2F%2Fsaltnet.example%2Fcallback%3Fx%3D1%26label%3Da+b&code_challenge=challenge-_&state=state-_&code_challenge_method=S256&scope=read_user_profile+read_player+write_player";

    it("uses the default LXNS origin and exact parameter order and encoding", () => {
        expect(
            createLXNSOAuthAuthorizeUrl(
                "made-client",
                "https://saltnet.example/callback?x=1&label=a b",
                "challenge-_",
                "state-_"
            )
        ).toBe(`https://maimai.lxns.net/oauth/authorize?${expectedQuery}`);
    });

    it.each(["https://lxns.example", "https://lxns.example/"])(
        "uses a configured LXNS origin (%s)",
        lxnsBaseUrl => {
            expect(
                createLXNSOAuthAuthorizeUrl(
                    "made-client",
                    "https://saltnet.example/callback?x=1&label=a b",
                    "challenge-_",
                    "state-_",
                    { config: { lxnsBaseUrl } }
                )
            ).toBe(`https://lxns.example/oauth/authorize?${expectedQuery}`);
        }
    );
});

describe("lxns OAuth callback parsing", () => {
    it.each(["http", "https"])("accepts %s callback links", protocol => {
        expect(
            parseLXNSOAuthCallback(
                `${protocol}://saltnet.example/callback?lxns_auth_complete&state=made-state&code=made-code`
            )
        ).toMatchObject({ state: "made-state", code: "made-code" });
    });

    it("accepts an empty completion marker and returns missing values as empty strings", () => {
        expect(
            parseLXNSOAuthCallback("https://saltnet.example/callback?lxns_auth_complete=")
        ).toEqual({
            url: "https://saltnet.example/callback?lxns_auth_complete=",
            state: "",
            code: "",
            error: "",
            errorDescription: "",
        });
    });

    it("returns the normalized link and reads error_description", () => {
        expect(
            parseLXNSOAuthCallback(
                "HTTPS://SALTNET.example/callback?lxns_auth_complete&state=made-state&error=access_denied&error_description=made+description"
            )
        ).toEqual({
            url: "https://saltnet.example/callback?lxns_auth_complete&state=made-state&error=access_denied&error_description=made+description",
            state: "made-state",
            code: "",
            error: "access_denied",
            errorDescription: "made description",
        });
    });

    it.each(["javascript:", "file:", "saltnet:"])("rejects %s links", scheme => {
        expect(() => parseLXNSOAuthCallback(`${scheme}callback?lxns_auth_complete`)).toThrow(
            "请粘贴落雪授权完成后显示的完整回调链接"
        );
    });

    it("keeps URL parsing errors unchanged", () => {
        expect(() => parseLXNSOAuthCallback("not a URL")).toThrow(TypeError);
    });

    it("requires a state and either a code or an error", () => {
        expect(() => assertLXNSOAuthCallbackParameters(callback({ state: "" }))).toThrow(
            "落雪授权回调参数缺失，请重新授权"
        );
        expect(() => assertLXNSOAuthCallbackParameters(callback({ code: "", error: "" }))).toThrow(
            "落雪授权回调参数缺失，请重新授权"
        );
        expect(() =>
            assertLXNSOAuthCallbackParameters(callback({ code: "", error: "access_denied" }))
        ).not.toThrow();
    });
});

describe("lxns OAuth transaction validation", () => {
    const now = 1_000_000;

    it.each(["userUid", "clientId", "redirectUri"] as const)("rejects an empty %s", field => {
        expect(validateLXNSOAuthTransaction(transaction({ [field]: "" }), now)).toBeNull();
    });

    it.each([
        [42, false],
        [43, true],
        [128, true],
        [129, false],
    ])("checks verifier length %i", (length, accepted) => {
        const value = transaction({ codeVerifier: "v".repeat(length) });
        expect(validateLXNSOAuthTransaction(value, now) === value).toBe(accepted);
    });

    it("rejects a verifier containing '+'", () => {
        expect(
            validateLXNSOAuthTransaction(transaction({ codeVerifier: `${"v".repeat(42)}+` }), now)
        ).toBeNull();
    });

    it.each([
        [now, false],
        [now + 1, true],
        [now + LXNS_OAUTH_LIFETIME, true],
        [now + LXNS_OAUTH_LIFETIME + 1, false],
        [Number.NaN, false],
        [Number.POSITIVE_INFINITY, false],
    ])("checks expiresAt %s", (expiresAt, accepted) => {
        const value = transaction({ expiresAt });
        expect(validateLXNSOAuthTransaction(value, now) === value).toBe(accepted);
    });

    it("rejects a string expiresAt, null and arrays", () => {
        expect(
            validateLXNSOAuthTransaction({ ...transaction(), expiresAt: "1000001" }, now)
        ).toBeNull();
        expect(validateLXNSOAuthTransaction(null, now)).toBeNull();
        expect(validateLXNSOAuthTransaction([], now)).toBeNull();
    });

    it("keeps the original object and extra keys", () => {
        const value = { ...transaction(), extra: { kept: true } };
        const validated = validateLXNSOAuthTransaction(value, now);
        expect(validated).toBe(value);
        expect(validated).toHaveProperty("extra", { kept: true });
    });

    it("keeps the web app's 15-minute lifetime", () => {
        expect(LXNS_OAUTH_LIFETIME).toBe(15 * 60 * 1000);
        expect(
            validateLXNSOAuthTransaction(transaction({ expiresAt: now + 900_000 }), now)
        ).not.toBeNull();
        expect(
            validateLXNSOAuthTransaction(transaction({ expiresAt: now + 900_001 }), now)
        ).toBeNull();
    });

    it.each(["userUid", "clientId", "redirectUri"] as const)("rejects a non-string %s", field => {
        expect(validateLXNSOAuthTransaction({ ...transaction(), [field]: 5 }, now)).toBeNull();
    });
});

describe("lxns OAuth callback checks", () => {
    const target = transaction({
        redirectUri: "https://saltnet.example:8443/callback?original=1#original",
    });

    it.each([
        "http://saltnet.example:8443/callback?lxns_auth_complete",
        "https://other.example:8443/callback?lxns_auth_complete",
        "https://saltnet.example/callback?lxns_auth_complete",
        "https://saltnet.example:8443/other?lxns_auth_complete",
        "https://saltnet.example:8443/callback/?lxns_auth_complete",
    ])("rejects a callback at another address (%s)", url => {
        expect(() => assertLXNSOAuthCallbackAddress(callback({ url }), target)).toThrow(
            "授权回调地址不匹配，请使用落雪返回的完整链接"
        );
    });

    it("accepts a different query and fragment", () => {
        expect(() =>
            assertLXNSOAuthCallbackAddress(
                callback({
                    url: "https://saltnet.example:8443/callback?lxns_auth_complete&different=1#new",
                }),
                target
            )
        ).not.toThrow();
    });

    it("reports an OAuth error with and without its description", () => {
        expect(() =>
            assertLXNSOAuthCallbackSucceeded(
                callback({ error: "access_denied", errorDescription: "made denial" })
            )
        ).toThrow("落雪授权失败：made denial");
        expect(() =>
            assertLXNSOAuthCallbackSucceeded(
                callback({ error: "access_denied", errorDescription: "" })
            )
        ).toThrow("落雪授权失败：access_denied");
    });
});

describe("lxns OAuth code exchange", () => {
    it("sends the exact URL and authorization-code body", async () => {
        const fetch = vi.fn<FetchLike>(async () =>
            jsonResponse({
                access_token: madeJwt(2_000),
                refresh_token: "made-refresh",
                token_type: "Bearer",
                expires_in: 900,
            })
        );
        const value = transaction({
            clientId: "made client",
            redirectUri: "https://saltnet.example/callback?x=1&y=2",
            codeVerifier: "v".repeat(43),
        });

        await expect(
            exchangeLXNSOAuthCode("made code", value, { fetch, now: 1_000_000 })
        ).resolves.toEqual({
            auth: {
                accessToken: madeJwt(2_000),
                refreshToken: "made-refresh",
                tokenType: "Bearer",
            },
            expiresAt: 1_900_000,
        });
        expect(fetch).toHaveBeenCalledOnce();
        expect(fetch.mock.calls[0][0]).toBe("https://maimai.lxns.net/api/v0/oauth/token");
        expect(fetch.mock.calls[0][1]?.body).toBe(
            `grant_type=authorization_code&code=made+code&client_id=made+client&redirect_uri=https%3A%2F%2Fsaltnet.example%2Fcallback%3Fx%3D1%26y%3D2&code_verifier=${"v".repeat(43)}`
        );
    });

    it("keeps the token type the server returns", async () => {
        const fetch = vi.fn<FetchLike>(async () =>
            jsonResponse({
                access_token: madeJwt(2_000),
                refresh_token: "made-refresh",
                token_type: "made-type",
                expires_in: 900,
            })
        );
        const token = await exchangeLXNSOAuthCode("made-code", transaction(), {
            fetch,
            now: 1_000_000,
        });
        expect(token.auth.tokenType).toBe("made-type");
    });

    it("uses a configured LXNS origin and strips trailing slashes", async () => {
        const fetch = vi.fn<FetchLike>(async () =>
            jsonResponse({
                access_token: madeJwt(2_000),
                refresh_token: "made-refresh",
                token_type: "Bearer",
                expires_in: 1,
            })
        );
        await exchangeLXNSOAuthCode("made-code", transaction(), {
            config: { lxnsBaseUrl: "https://lxns.example///" },
            fetch,
            now: 1_000,
        });
        expect(fetch.mock.calls[0][0]).toBe("https://lxns.example/api/v0/oauth/token");
    });

    it("uses the JWT exp when expires_in is absent", async () => {
        const fetch: FetchLike = async () =>
            jsonResponse({
                access_token: madeJwt(2_000),
                refresh_token: "made-refresh",
                token_type: "Bearer",
            });
        await expect(
            exchangeLXNSOAuthCode("made-code", transaction(), { fetch, now: 123 })
        ).resolves.toMatchObject({ expiresAt: 2_000_000 });
    });

    it("passes invalid_grant through as an LXNSTokenError", async () => {
        const fetch: FetchLike = async () =>
            jsonResponse({ error: "invalid_grant", error_description: "made code expired" }, 400);
        const error = await exchangeLXNSOAuthCode("made-code", transaction(), { fetch }).catch(
            value => value
        );
        expect(error).toBeInstanceOf(LXNSTokenError);
        expect(error).toMatchObject({ oauthError: "invalid_grant" });
    });

    it("requires a transaction before it can send a code", async () => {
        const fetch = vi.fn<FetchLike>();
        await expect(
            // @ts-expect-error The transaction is intentionally omitted to prove the API requires it.
            exchangeLXNSOAuthCode("made-code", undefined, { fetch })
        ).rejects.toBeInstanceOf(TypeError);
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe("lxns exchanged token validation", () => {
    const now = 1_000;

    it.each([
        [now - 1, false],
        [now, false],
        [now + 1, true],
        [Number.NaN, false],
        [Number.POSITIVE_INFINITY, false],
    ])("checks expiresAt %s", (expiresAt, accepted) => {
        const token = {
            auth: {
                accessToken: "made-access",
                refreshToken: "made-refresh",
                tokenType: "Bearer",
            },
            expiresAt,
        };
        if (accepted) {
            expect(() => assertLXNSOAuthTokenUsable(token, now)).not.toThrow();
            return;
        }
        try {
            assertLXNSOAuthTokenUsable(token, now);
            throw new Error("expected validation to throw");
        } catch (error) {
            expect(error).toBeInstanceOf(LXNSTokenError);
            expect(error).toMatchObject({
                message: "落雪授权已过期，请重新授权",
                oauthError: "invalid_grant",
            });
        }
    });
});
