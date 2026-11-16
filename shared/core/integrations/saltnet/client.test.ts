import type { FetchInit, FetchLike, FetchResponse } from "../../http";
import { describe, expect, it, vi } from "vitest";
import {
    postSaltNetAPI,
    postSaltNetAPIJSON,
    SaltAPIEndpoints,
    SALTNET_GAME_API_ERROR_MESSAGE,
    SaltNetError,
} from "./client";

function makeFetch(
    responder: (url: string, init?: FetchInit) => Promise<FetchResponse> | FetchResponse
) {
    return vi.fn<FetchLike>(async (url, init) => responder(url, init));
}

function jsonResponse(body: unknown, status = 200, ok = true): FetchResponse {
    return {
        ok,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
    };
}

function unreadableJsonResponse(status = 200, ok = true): FetchResponse {
    return {
        ok,
        status,
        json: async () => {
            throw new SyntaxError("Unexpected token in JSON");
        },
        text: async () => "invalid json",
    };
}

describe("saltNetError", () => {
    it("preserves message, kind, status, without setting name", () => {
        const error = new SaltNetError("something went wrong", "network");
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(SaltNetError);
        expect(error.name).toBe("Error");
        expect(String(error)).toBe("Error: something went wrong");
        expect(String(error).startsWith("Error: ")).toBe(true);
        expect(error.message).toBe("something went wrong");
        expect(error.kind).toBe("network");
        expect(error.status).toBeUndefined();

        const upstreamError = new SaltNetError("upstream failed", "upstream", 502);
        expect(upstreamError.name).toBe("Error");
        expect(String(upstreamError)).toBe("Error: upstream failed");
        expect(upstreamError.kind).toBe("upstream");
        expect(upstreamError.status).toBe(502);
    });
});

describe("postSaltNetAPI", () => {
    const config = {
        saltnetApiUrl: "https://primary.example",
        saltnetApiFallbackUrl: "https://fallback.example",
    };

    it("makes the exact request on primary success with one call", async () => {
        const calls: { url: string; init?: FetchInit }[] = [];
        const doFetch = makeFetch((url, init) => {
            calls.push({ url, init });
            return jsonResponse({ ok: true });
        });
        const onRequestFailed = vi.fn();

        const body = { test: 123, foo: "bar" };
        const response = await postSaltNetAPI(SaltAPIEndpoints.GetQRInfo, body, {
            config,
            fetch: doFetch,
            onRequestFailed,
        });

        expect(doFetch).toHaveBeenCalledTimes(1);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe("https://primary.example/getQRInfo");
        expect(calls[0].init?.method).toBe("POST");
        expect(calls[0].init?.headers).toEqual({
            "Content-Type": "application/json",
        });
        expect(calls[0].init?.body).toBe(JSON.stringify(body));
        expect(response.ok).toBe(true);
        expect(onRequestFailed).not.toHaveBeenCalled();
    });

    it("tries the fallback on primary network failure (two calls in order)", async () => {
        const calls: { url: string; init?: FetchInit }[] = [];
        const networkError = new TypeError("Failed to connect");
        const onRequestFailed = vi.fn();

        const doFetch = makeFetch((url, init) => {
            calls.push({ url, init });
            if (url.startsWith("https://primary.example")) {
                throw networkError;
            }
            return jsonResponse({ fallback: true });
        });

        const body = { code: "abc" };
        const response = await postSaltNetAPI(SaltAPIEndpoints.CheckLogin, body, {
            config,
            fetch: doFetch,
            onRequestFailed,
        });

        expect(doFetch).toHaveBeenCalledTimes(2);
        expect(calls).toHaveLength(2);
        expect(calls[0].url).toBe("https://primary.example/checkLogin");
        expect(calls[1].url).toBe("https://fallback.example/checkLogin");
        expect(response.ok).toBe(true);
        expect(onRequestFailed).toHaveBeenCalledTimes(1);
        expect(onRequestFailed).toHaveBeenCalledWith(SaltAPIEndpoints.CheckLogin, networkError);
    });

    it("tries the fallback when primary response is not OK (two calls in order)", async () => {
        const calls: { url: string; init?: FetchInit }[] = [];
        const onRequestFailed = vi.fn();

        const doFetch = makeFetch((url, init) => {
            calls.push({ url, init });
            if (url.startsWith("https://primary.example")) {
                return jsonResponse({ error: "primary error" }, 500, false);
            }
            return jsonResponse({ fallback: true });
        });

        const response = await postSaltNetAPI(
            SaltAPIEndpoints.UpdateUser,
            { id: 1 },
            {
                config,
                fetch: doFetch,
                onRequestFailed,
            }
        );

        expect(doFetch).toHaveBeenCalledTimes(2);
        expect(calls[0].url).toBe("https://primary.example/updateUser");
        expect(calls[1].url).toBe("https://fallback.example/updateUser");
        expect(response.ok).toBe(true);
        expect(onRequestFailed).not.toHaveBeenCalled();
    });

    it("gives the fallback error (message, kind, status) when both fail with network errors", async () => {
        const calls: { url: string; init?: FetchInit }[] = [];
        const primaryError = new TypeError("primary network down");
        const fallbackError = new TypeError("fallback network down");
        const onRequestFailed = vi.fn();

        const doFetch = makeFetch((url, init) => {
            calls.push({ url, init });
            if (url.startsWith("https://primary.example")) {
                throw primaryError;
            }
            throw fallbackError;
        });

        const error = (await postSaltNetAPI(
            SaltAPIEndpoints.GetStockedTickets,
            {},
            {
                config,
                fetch: doFetch,
                onRequestFailed,
            }
        ).catch(err => err)) as SaltNetError;

        expect(doFetch).toHaveBeenCalledTimes(2);
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(SaltNetError);
        expect(error.name).toBe("Error");
        expect(String(error).startsWith("Error: ")).toBe(true);
        expect(error.message).toBe(SALTNET_GAME_API_ERROR_MESSAGE);
        expect(error.kind).toBe("network");
        expect(error.status).toBeUndefined();
        expect(onRequestFailed).toHaveBeenCalledTimes(2);
        expect(onRequestFailed).toHaveBeenNthCalledWith(
            1,
            SaltAPIEndpoints.GetStockedTickets,
            primaryError
        );
        expect(onRequestFailed).toHaveBeenNthCalledWith(
            2,
            SaltAPIEndpoints.GetStockedTickets,
            fallbackError
        );
    });

    it("gives the fallback error when primary fails with network and fallback fails with non-OK", async () => {
        const doFetch = makeFetch(url => {
            if (url.startsWith("https://primary.example")) {
                throw new TypeError("primary down");
            }
            return jsonResponse({ error: "fallback unavailable" }, 503, false);
        });

        const error = (await postSaltNetAPI(
            SaltAPIEndpoints.ClearIllegalTickets,
            {},
            {
                config,
                fetch: doFetch,
            }
        ).catch(err => err)) as SaltNetError;

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(SaltNetError);
        expect(String(error)).toBe("Error: fallback unavailable");
        expect(error.message).toBe("fallback unavailable");
        expect(error.kind).toBe("upstream");
        expect(error.status).toBe(503);
    });

    it("handles non-OK body with a string error", async () => {
        const doFetch = makeFetch(() =>
            jsonResponse({ error: "custom backend error" }, 400, false)
        );

        const error = (await postSaltNetAPI(
            "customEndpoint",
            {},
            {
                config: { saltnetApiUrl: "https://primary.example" },
                fetch: doFetch,
            }
        ).catch(err => err)) as SaltNetError;

        expect(error).toBeInstanceOf(SaltNetError);
        expect(error.message).toBe("custom backend error");
        expect(error.kind).toBe("upstream");
        expect(error.status).toBe(400);
        expect(String(error)).toBe("Error: custom backend error");
    });

    it("handles non-OK body with a non-string error", async () => {
        const doFetch = makeFetch(() => jsonResponse({ error: 12345 }, 400, false));

        const error = (await postSaltNetAPI(
            "customEndpoint",
            {},
            {
                config: { saltnetApiUrl: "https://primary.example" },
                fetch: doFetch,
            }
        ).catch(err => err)) as SaltNetError;

        expect(error).toBeInstanceOf(SaltNetError);
        expect(error.message).toBe(SALTNET_GAME_API_ERROR_MESSAGE);
        expect(error.kind).toBe("upstream");
        expect(error.status).toBe(400);
    });

    it("handles non-OK body with no error field", async () => {
        const doFetch = makeFetch(() => jsonResponse({ other: "data" }, 500, false));

        const error = (await postSaltNetAPI(
            "customEndpoint",
            {},
            {
                config: { saltnetApiUrl: "https://primary.example" },
                fetch: doFetch,
            }
        ).catch(err => err)) as SaltNetError;

        expect(error).toBeInstanceOf(SaltNetError);
        expect(error.message).toBe(SALTNET_GAME_API_ERROR_MESSAGE);
        expect(error.kind).toBe("upstream");
        expect(error.status).toBe(500);
    });

    it("handles non-OK body with unreadable body", async () => {
        const doFetch = makeFetch(() => unreadableJsonResponse(502, false));

        const error = (await postSaltNetAPI(
            "customEndpoint",
            {},
            {
                config: { saltnetApiUrl: "https://primary.example" },
                fetch: doFetch,
            }
        ).catch(err => err)) as SaltNetError;

        expect(error).toBeInstanceOf(SaltNetError);
        expect(error.message).toBe(SALTNET_GAME_API_ERROR_MESSAGE);
        expect(error.kind).toBe("upstream");
        expect(error.status).toBe(502);
    });
});

describe("postSaltNetAPIJSON", () => {
    const config = {
        saltnetApiUrl: "https://primary.example",
    };

    it("returns an object data", async () => {
        const payload = { result: "ok", count: 42 };
        const doFetch = makeFetch(() => jsonResponse(payload));

        const data = await postSaltNetAPIJSON(
            SaltAPIEndpoints.GetQRInfo,
            {},
            {
                config,
                fetch: doFetch,
            }
        );

        expect(data).toEqual(payload);
    });

    it("returns an array data", async () => {
        const payload = [
            { chargeId: 1, stock: 5 },
            { chargeId: 2, stock: 10 },
        ];
        const doFetch = makeFetch(() => jsonResponse(payload));

        const data = await postSaltNetAPIJSON(
            SaltAPIEndpoints.GetStockedTickets,
            {},
            {
                config,
                fetch: doFetch,
            }
        );

        expect(data).toEqual(payload);
    });

    it("returns an object whose error member is an empty string", async () => {
        const payload = { error: "", validData: true };
        const doFetch = makeFetch(() => jsonResponse(payload));

        const data = await postSaltNetAPIJSON(
            SaltAPIEndpoints.UpdateUser,
            {},
            {
                config,
                fetch: doFetch,
            }
        );

        expect(data).toEqual(payload);
    });

    it("rejects with generic message and invalid-response for unreadable JSON", async () => {
        const doFetch = makeFetch(() => unreadableJsonResponse(200, true));
        const onInvalidJSON = vi.fn();
        const onRequestFailed = vi.fn();

        const error = (await postSaltNetAPIJSON(
            SaltAPIEndpoints.UpdateUser,
            {},
            {
                config,
                fetch: doFetch,
                onInvalidJSON,
                onRequestFailed,
            }
        ).catch(err => err)) as SaltNetError;

        expect(error).toBeInstanceOf(SaltNetError);
        expect(error.message).toBe(SALTNET_GAME_API_ERROR_MESSAGE);
        expect(error.kind).toBe("invalid-response");
        expect(error.status).toBeUndefined();
        expect(String(error).startsWith("Error: ")).toBe(true);
        expect(onInvalidJSON).toHaveBeenCalledTimes(1);
        expect(onInvalidJSON).toHaveBeenCalledWith(
            SaltAPIEndpoints.UpdateUser,
            expect.any(SyntaxError)
        );
        expect(onRequestFailed).not.toHaveBeenCalled();
    });

    it("rejects with generic message and invalid-response for null body", async () => {
        const doFetch = makeFetch(() => jsonResponse(null));
        const onInvalidJSON = vi.fn();

        const error = (await postSaltNetAPIJSON(
            SaltAPIEndpoints.UpdateUser,
            {},
            {
                config,
                fetch: doFetch,
                onInvalidJSON,
            }
        ).catch(err => err)) as SaltNetError;

        expect(error).toBeInstanceOf(SaltNetError);
        expect(error.message).toBe(SALTNET_GAME_API_ERROR_MESSAGE);
        expect(error.kind).toBe("invalid-response");
        expect(error.status).toBeUndefined();
        expect(onInvalidJSON).not.toHaveBeenCalled();
    });

    it("rejects with generic message and invalid-response for a number body", async () => {
        const doFetch = makeFetch(() => jsonResponse(42));
        const onInvalidJSON = vi.fn();

        const error = (await postSaltNetAPIJSON(
            SaltAPIEndpoints.UpdateUser,
            {},
            {
                config,
                fetch: doFetch,
                onInvalidJSON,
            }
        ).catch(err => err)) as SaltNetError;

        expect(error).toBeInstanceOf(SaltNetError);
        expect(error.message).toBe(SALTNET_GAME_API_ERROR_MESSAGE);
        expect(error.kind).toBe("invalid-response");
        expect(error.status).toBeUndefined();
        expect(onInvalidJSON).not.toHaveBeenCalled();
    });

    it("rejects with generic message and invalid-response for a string body", async () => {
        const doFetch = makeFetch(() => jsonResponse("plain string"));
        const onInvalidJSON = vi.fn();

        const error = (await postSaltNetAPIJSON(
            SaltAPIEndpoints.UpdateUser,
            {},
            {
                config,
                fetch: doFetch,
                onInvalidJSON,
            }
        ).catch(err => err)) as SaltNetError;

        expect(error).toBeInstanceOf(SaltNetError);
        expect(error.message).toBe(SALTNET_GAME_API_ERROR_MESSAGE);
        expect(error.kind).toBe("invalid-response");
        expect(error.status).toBeUndefined();
        expect(onInvalidJSON).not.toHaveBeenCalled();
    });

    it("rejects with generic message and upstream for a truthy non-string error member", async () => {
        const doFetch = makeFetch(() => jsonResponse({ error: true, code: 500 }));
        const onInvalidJSON = vi.fn();

        const error = (await postSaltNetAPIJSON(
            SaltAPIEndpoints.UpdateUser,
            {},
            {
                config,
                fetch: doFetch,
                onInvalidJSON,
            }
        ).catch(err => err)) as SaltNetError;

        expect(error).toBeInstanceOf(SaltNetError);
        expect(error.message).toBe(SALTNET_GAME_API_ERROR_MESSAGE);
        expect(error.kind).toBe("upstream");
        expect(error.status).toBeUndefined();
        expect(onInvalidJSON).not.toHaveBeenCalled();
    });

    it("rejects with specific message and upstream for a string error member", async () => {
        const doFetch = makeFetch(() => jsonResponse({ error: "二维码已过期" }));
        const onInvalidJSON = vi.fn();

        const error = (await postSaltNetAPIJSON(
            SaltAPIEndpoints.UpdateUser,
            {},
            {
                config,
                fetch: doFetch,
                onInvalidJSON,
            }
        ).catch(err => err)) as SaltNetError;

        expect(error).toBeInstanceOf(SaltNetError);
        expect(error.message).toBe("二维码已过期");
        expect(error.kind).toBe("upstream");
        expect(error.status).toBeUndefined();
        expect(String(error)).toBe("Error: 二维码已过期");
        expect(onInvalidJSON).not.toHaveBeenCalled();
    });

    it("does not call callbacks when response succeeds normally", async () => {
        const doFetch = makeFetch(() => jsonResponse({ success: true }));
        const onRequestFailed = vi.fn();
        const onInvalidJSON = vi.fn();

        const data = await postSaltNetAPIJSON(
            SaltAPIEndpoints.CheckLogin,
            {},
            {
                config,
                fetch: doFetch,
                onRequestFailed,
                onInvalidJSON,
            }
        );

        expect(data).toEqual({ success: true });
        expect(onRequestFailed).not.toHaveBeenCalled();
        expect(onInvalidJSON).not.toHaveBeenCalled();
    });
});
