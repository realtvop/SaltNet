import type { FetchResponse } from "@core/http";
import type { HttpFetch, HttpResponse } from "../../src/runtime/io";
import { describe, expect, it } from "vitest";
import { buildRegistry, defineCommand } from "../../src/commands/registry";
import { CliError } from "../../src/errors";
import { createHttp, hostOf, upstreamStatusError } from "../../src/runtime/http";
import { createHarness, run } from "../harness";
import { delayedRoute, jsonResponse, mockFetch, redirectResponse, textResponse } from "../mockHttp";

const URL_WITH_TOKEN = "https://meta.example.com/data/v1.json?token=secret";

function http(fetch: HttpFetch, timeoutMs = 5000) {
    return createHttp({
        fetch,
        userAgent: "saltnet-cli/1.2.3",
        timeoutMs,
        timeoutKey: "network.timeoutMs",
    });
}

/** An error the way Node's `fetch` reports a connection that failed. */
function fetchFailed(code: string): Error {
    return Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error(`connect ${code} 127.0.0.1:443`), { code }),
    });
}

/** Resolves with what `work` rejects with, so a test can inspect the error. */
async function failureOf(work: Promise<unknown>): Promise<CliError> {
    try {
        await work;
    } catch (error) {
        expect(error).toBeInstanceOf(CliError);
        return error as CliError;
    }
    throw new Error("expected the request to fail");
}

describe("the request", () => {
    it("follows a public GET redirect and rejects a credential-bearing GET redirect", async () => {
        const target = "https://redirect-target.test/catalog";
        const exchange = "https://oauth.example.test/token";
        const fetch = mockFetch({
            [URL_WITH_TOKEN]: redirectResponse(target, 302),
            [target]: textResponse("catalog"),
            [exchange]: textResponse("", 304),
        });
        const request = http(fetch);
        const publicResponse = await request(URL_WITH_TOKEN);
        expect(await publicResponse.text()).toBe("catalog");
        const explicitFollow = { method: "POST", redirect: "follow" as const };
        expect(await (await request(URL_WITH_TOKEN, explicitFollow)).text()).toBe("catalog");
        // OAuth needs to see unsuccessful responses with its explicit redirect policy.
        const rejectedExchange = await request(exchange, { method: "POST", redirect: "error" });
        expect(rejectedExchange.status).toBe(304);
        await expect(
            request(URL_WITH_TOKEN, { headers: { "iMpOrT-ToKeN": "FAKE-IMPORT" } })
        ).rejects.toMatchObject({
            code: "UPSTREAM_ERROR",
            extra: { status: 302 },
            retryable: false,
        });
        expect(fetch.requests.map(request => request.url)).toEqual([
            URL_WITH_TOKEN,
            target,
            URL_WITH_TOKEN,
            target,
            exchange,
            URL_WITH_TOKEN,
        ]);
    });

    it("sends the user agent and keeps the method, body and other headers", async () => {
        const fetch = mockFetch({ [URL_WITH_TOKEN]: jsonResponse({}) });
        await http(fetch)(URL_WITH_TOKEN, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });

        expect(fetch.requests).toHaveLength(1);
        expect(fetch.requests[0].url).toBe(URL_WITH_TOKEN);
        expect(fetch.requests[0].init).toMatchObject({
            method: "POST",
            body: "{}",
            headers: { "User-Agent": "saltnet-cli/1.2.3", "Content-Type": "application/json" },
        });
    });

    it("lets a header the caller sets win over the user agent", async () => {
        const fetch = mockFetch({ [URL_WITH_TOKEN]: jsonResponse({}) });
        await http(fetch)(URL_WITH_TOKEN, { headers: { "User-Agent": "other/1" } });
        expect(fetch.requests[0].init?.headers).toEqual({ "User-Agent": "other/1" });
    });

    it("gives each request a signal that has not fired yet", async () => {
        const fetch = mockFetch({ [URL_WITH_TOKEN]: jsonResponse({}) });
        await http(fetch)(URL_WITH_TOKEN);
        const { signal } = fetch.requests[0].init ?? {};
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(signal?.aborted).toBe(false);
    });
});

describe("the response", () => {
    it("reads the body as text or as json", async () => {
        const fetch = mockFetch({ [URL_WITH_TOKEN]: jsonResponse({ a: [1, 2] }) });
        const response = await http(fetch)(URL_WITH_TOKEN);
        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ a: [1, 2] });
        expect(await response.text()).toBe('{"a":[1,2]}');
    });

    it("passes a status that is not a success through for the caller to judge", async () => {
        const fetch = mockFetch({ [URL_WITH_TOKEN]: textResponse("busy", 503) });
        const response = await http(fetch)(URL_WITH_TOKEN);
        expect(response.ok).toBe(false);
        expect(response.status).toBe(503);
        expect(await response.text()).toBe("busy");
    });

    it("reports a body that is not json as an upstream error", async () => {
        const fetch = mockFetch({ [URL_WITH_TOKEN]: textResponse("<html>captive portal</html>") });
        const response = await http(fetch)(URL_WITH_TOKEN);
        const error = await failureOf(response.json());
        expect(error.code).toBe("UPSTREAM_ERROR");
        expect(error.message).toContain("meta.example.com");
        expect(error.message).not.toContain("captive portal");
    });
});

describe("binary bodies", () => {
    // Not UTF-8: the PNG signature (0x89 cannot start a character), a lone continuation byte and a
    // character cut short.
    const PICTURE = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x80, 0xc3,
    ]);
    // UTF-8 text after a byte order mark, which `Response.text()` drops.
    const BOM_TEXT = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('{"a":"é"}')]);
    const BOTH_PATHS = [
        ["without retry", false],
        ["with retry", true],
    ] as const;

    function httpWith(fetch: HttpFetch, retry: boolean) {
        return createHttp({
            fetch,
            userAgent: "saltnet-cli/1.2.3",
            timeoutMs: 5000,
            timeoutKey: "network.timeoutMs",
            retry,
            retryDelayMs: 0,
        });
    }

    /** What real `fetch` answers: a fresh `Response` each time, whose body can be read once. */
    function realFetch(bytes: Uint8Array): HttpFetch {
        return async () => new Response(bytes.slice(), { status: 200 });
    }

    it.each(BOTH_PATHS)("gives the bytes of a real response as they came, %s", async (_, retry) => {
        const response = await httpWith(realFetch(PICTURE), retry)(URL_WITH_TOKEN);
        expect([...(await response.bytes())]).toEqual([...PICTURE]);
    });

    it.each(BOTH_PATHS)("decodes text as Response.text() does, %s", async (_, retry) => {
        for (const bytes of [PICTURE, BOM_TEXT]) {
            const response = await httpWith(realFetch(bytes), retry)(URL_WITH_TOKEN);
            expect(await response.text()).toBe(await new Response(bytes.slice()).text());
        }
    });

    it("reads a retried body once, so text, json and bytes can all be asked for", async () => {
        const response = await httpWith(realFetch(BOM_TEXT), true)(URL_WITH_TOKEN);
        expect(await response.text()).toBe('{"a":"é"}');
        expect(await response.json()).toEqual({ a: "é" });
        expect([...(await response.bytes())]).toEqual([...BOM_TEXT]);
    });

    it.each(BOTH_PATHS)("gives the UTF-8 of a body that is only text, %s", async (_, retry) => {
        const fetch = mockFetch({ [URL_WITH_TOKEN]: textResponse("é☃") });
        const response = await httpWith(fetch, retry)(URL_WITH_TOKEN);
        expect([...(await response.bytes())]).toEqual([...new TextEncoder().encode("é☃")]);
    });

    it("reports bytes that break off while they are read", async () => {
        const response: HttpResponse = {
            ok: true,
            status: 200,
            text: async () => Promise.reject(new Error("unused")),
            json: async () => Promise.reject(new Error("unused")),
            arrayBuffer: async () => Promise.reject(fetchFailed("ECONNRESET")),
        };
        const error = await failureOf((await http(async () => response)(URL_WITH_TOKEN)).bytes());
        expect(error.code).toBe("NETWORK");
        expect(error.message).toBe("读取 meta.example.com 的响应时中断（ECONNRESET）");
    });

    it("asks again for bytes that broke off while they were read", async () => {
        let calls = 0;
        const fetch: HttpFetch = async () => {
            calls++;
            if (calls > 1) return new Response(PICTURE.slice(), { status: 200 });
            return {
                ok: true,
                status: 200,
                text: async () => Promise.reject(new Error("unused")),
                json: async () => Promise.reject(new Error("unused")),
                arrayBuffer: async () => Promise.reject(fetchFailed("ECONNRESET")),
            };
        };
        const response = await httpWith(fetch, true)(URL_WITH_TOKEN);
        expect(calls).toBe(2);
        expect([...(await response.bytes())]).toEqual([...PICTURE]);
    });
});

describe("network failures", () => {
    it("reports a refused connection as NETWORK, with the host and the cause", async () => {
        const error = await failureOf(
            http(async () => Promise.reject(fetchFailed("ECONNREFUSED")))(URL_WITH_TOKEN)
        );

        expect(error.code).toBe("NETWORK");
        expect(error.exitCode).toBe(5);
        expect(error.retryable).toBe(true);
        expect(error.fix).toBeUndefined();
        expect(error.message).toBe("无法连接到 meta.example.com（ECONNREFUSED）");
    });

    it("never puts the path or the query of the URL into a message", async () => {
        const error = await failureOf(
            http(async () => Promise.reject(fetchFailed("ENOTFOUND")))(URL_WITH_TOKEN)
        );
        expect(error.message).not.toContain("secret");
        expect(error.message).not.toContain("data/v1.json");
    });

    it("falls back to the message of an error that has no code", async () => {
        const error = await failureOf(
            http(async () => Promise.reject(new Error("socket hang up")))(URL_WITH_TOKEN)
        );
        expect(error.message).toBe("无法连接到 meta.example.com（socket hang up）");
    });

    it("reports the deadline passing before an answer arrives", async () => {
        const hung: HttpFetch = (_url, init) =>
            new Promise((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
            });

        const error = await failureOf(http(hung, 20)(URL_WITH_TOKEN));
        expect(error.code).toBe("NETWORK");
        expect(error.message).toBe("请求 meta.example.com 超时（超过 20 毫秒 没有完成）");
        expect(error.fix).toContain("network.timeoutMs");
    });

    it("counts the timeouts of undici as the deadline too", async () => {
        const error = await failureOf(
            http(
                async () => Promise.reject(fetchFailed("UND_ERR_CONNECT_TIMEOUT")),
                8000
            )(URL_WITH_TOKEN)
        );
        expect(error.message).toBe("请求 meta.example.com 超时（超过 8 秒 没有完成）");
    });

    it("reports the configured deadline when the body waits for the request signal", async () => {
        const fetch: HttpFetch = async (_url, init) => ({
            ok: true,
            status: 200,
            text: () =>
                new Promise((_resolve, reject) => {
                    const { signal } = init ?? {};
                    const onAbort = () => reject(signal?.reason);
                    if (signal?.aborted) onAbort();
                    else signal?.addEventListener("abort", onAbort, { once: true });
                }),
            json: async () => {
                throw new Error("unused");
            },
        });
        const request = createHttp({
            fetch,
            userAgent: "saltnet-cli/1.2.3",
            timeoutMs: 20,
            timeoutKey: "metadata.timeoutMs",
        });
        const read = (await request(URL_WITH_TOKEN)).json();

        const error = await failureOf(read);
        expect(error.code).toBe("NETWORK");
        expect(error.retryable).toBe(true);
        expect(error.message).toBe("请求 meta.example.com 超时（超过 20 毫秒 没有完成）");
        expect(error.fix).toBe(
            "网络较慢时可以调大 metadata.timeoutMs，例如 saltnet config set metadata.timeoutMs 60000"
        );
    });

    it("reports a body that breaks off while it is read", async () => {
        const response: FetchResponse = {
            ok: true,
            status: 200,
            text: async () => Promise.reject(fetchFailed("ECONNRESET")),
            json: async () => Promise.reject(new Error("unused")),
        };
        const error = await failureOf((await http(async () => response)(URL_WITH_TOKEN)).text());
        expect(error.code).toBe("NETWORK");
        expect(error.message).toBe("读取 meta.example.com 的响应时中断（ECONNRESET）");
    });

    it("names a placeholder when the URL has no host", async () => {
        const error = await failureOf(
            http(async () => Promise.reject(new Error("x")))("not a url")
        );
        expect(error.message).toBe("无法连接到 上游服务（x）");
    });
});

describe("statuses and hosts", () => {
    it("makes an upstream error of a status, retryable when it may pass", () => {
        const retryable = [500, 502, 503, 429].map(status =>
            upstreamStatusError(URL_WITH_TOKEN, status)
        );
        for (const error of retryable) expect(error.retryable).toBe(true);

        const final = [400, 403, 404].map(status => upstreamStatusError(URL_WITH_TOKEN, status));
        for (const error of final) expect(error.retryable).toBe(false);

        const [error] = retryable;
        expect(error.code).toBe("UPSTREAM_ERROR");
        expect(error.message).toBe("meta.example.com 返回了 HTTP 500");
        expect(error.extra).toEqual({ status: 500 });
    });

    it("takes the host out of a URL", () => {
        expect(hostOf("https://maimai.lxns.net/api/v0/maimai/trophy/list?required=true")).toBe(
            "maimai.lxns.net"
        );
        expect(hostOf("http://localhost:8080/x")).toBe("localhost:8080");
        expect(hostOf("nope")).toBe("上游服务");
    });
});

describe("a command's http", () => {
    const ping = defineCommand(
        {
            name: "ping",
            summary: "请求一个地址",
            category: "data",
            effect: "none",
            output: "object",
            options: { slow: { kind: "boolean", description: "把超时设得很短" } },
        },
        async (args, ctx) => {
            const response = await ctx.http(
                args.options.slow ? { timeoutMs: 15, timeoutKey: "metadata.timeoutMs" } : undefined
            )("https://example.com/ping");
            return { data: await response.json() };
        }
    );
    const registry = buildRegistry({ commands: [ping], groups: {} });

    it("uses the configured user agent", async () => {
        const fetch = mockFetch({ "https://example.com/ping": jsonResponse({ pong: true }) });
        const harness = createHarness({ fetch, env: { SALTNET_NETWORK_USER_AGENT: "agent/7" } });

        expect(await run(registry, harness, "ping")).toBe(0);
        expect(JSON.parse(harness.stdout()).data).toEqual({ pong: true });
        expect(fetch.requests[0].init?.headers).toEqual({ "User-Agent": "agent/7" });
    });

    it("defaults the user agent to the CLI's own name and version", async () => {
        const fetch = mockFetch({ "https://example.com/ping": jsonResponse({}) });
        const harness = createHarness({ fetch });

        await run(registry, harness, "ping");
        expect(fetch.requests[0].init?.headers).toEqual({ "User-Agent": "saltnet-cli/9.9.9" });
    });

    it("answers a failed connection with the NETWORK error and its exit code", async () => {
        const harness = createHarness({
            fetch: async () => Promise.reject(fetchFailed("ECONNREFUSED")),
        });

        expect(await run(registry, harness, "ping")).toBe(5);
        expect(JSON.parse(harness.stdout()).error).toMatchObject({
            code: "NETWORK",
            retryable: true,
            message: "无法连接到 example.com（ECONNREFUSED）",
        });
    });

    it("answers a request that runs out of time the same way", async () => {
        const hung: HttpFetch = (_url, init) =>
            new Promise((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
            });
        const harness = createHarness({ fetch: hung });

        expect(await run(registry, harness, "ping", "--slow")).toBe(5);
        expect(JSON.parse(harness.stdout()).error).toMatchObject({
            message: expect.stringContaining("超时"),
            fix: expect.stringContaining("metadata.timeoutMs"),
        });
    });

    it("has no network at all unless the test brings one", async () => {
        const harness = createHarness();

        expect(await run(registry, harness, "ping")).toBe(5);
        expect(JSON.parse(harness.stdout()).error.message).toContain(
            "测试没有模拟这个地址的网络请求"
        );
        expect(harness.fetch).toHaveBeenCalledTimes(1);
    });
});

describe("header character checks", () => {
    it.each([
        ["NUL", "bad\x00val"],
        ["CR", "bad\rval"],
        ["LF", "bad\nval"],
        ["U+0100", "bad\u0100val"],
        ["emoji", "bad\u{1F600}val"],
    ])(
        "rejects header with %s before calling fetch and names header without value",
        async (_, badVal) => {
            let fetchCalled = false;
            const fetch: HttpFetch = async () => {
                fetchCalled = true;
                return textResponse("ok");
            };
            const error = await failureOf(
                http(fetch)(URL_WITH_TOKEN, {
                    headers: { Authorization: badVal },
                })
            );
            expect(fetchCalled).toBe(false);
            expect(error.code).toBe("INTERNAL");
            expect(error.message).toContain("Authorization");
            expect(error.message).not.toContain(badVal);
            expect(error.message).toBe(
                "请求头 Authorization 的值含有不能发送的字符；如果它来自绑定的凭据，请重新绑定"
            );
            expect(error.cause).toBeUndefined();
        }
    );

    it("sends a header value with a tab or Latin-1 characters", async () => {
        const fetch = mockFetch({ [URL_WITH_TOKEN]: jsonResponse({}) });
        const latin1AndTab = "prefix\t\xE9\xFF";
        await http(fetch)(URL_WITH_TOKEN, {
            headers: { "X-Custom": latin1AndTab },
        });
        expect(fetch.requests).toHaveLength(1);
        expect(fetch.requests[0].init?.headers?.["X-Custom"]).toBe(latin1AndTab);
    });
});

describe("redaction of header values from errors", () => {
    it("redacts fake token from fetch error message and cause without leaking into serialized error", async () => {
        const fakeToken = "fake-secret-token-xyz";
        const fetch: HttpFetch = async () => {
            const err = new TypeError(`fetch failed with ${fakeToken}`);
            err.cause = Object.assign(new Error(`connect ECONNREFUSED with ${fakeToken}`), {
                code: "ECONNREFUSED",
            });
            throw err;
        };

        const error = await failureOf(
            http(fetch)(URL_WITH_TOKEN, {
                headers: { Authorization: `Bearer ${fakeToken}` },
            })
        );

        expect(error.code).toBe("NETWORK");
        expect(error.message).toBe("无法连接到 meta.example.com（ECONNREFUSED）");
        expect(error.message).not.toContain(fakeToken);
        expect(error.fix).toBeUndefined();
        expect(error.cause).toBeUndefined();

        const serialized = JSON.stringify(error);
        expect(serialized).not.toContain(fakeToken);

        let cur: unknown = error;
        while (cur instanceof Error) {
            expect(cur.message).not.toContain(fakeToken);
            cur = cur.cause;
        }
    });

    it("redacts fake token when error has no code and uses message", async () => {
        const fakeToken = "fake-secret-token-12345";
        const fetch: HttpFetch = async () => {
            throw new Error(`something failed ${fakeToken}`);
        };

        const error = await failureOf(
            http(fetch)(URL_WITH_TOKEN, {
                headers: { Authorization: fakeToken },
            })
        );

        expect(error.code).toBe("NETWORK");
        expect(error.message).toBe("无法连接到 meta.example.com（something failed <已隐藏>）");
        expect(error.message).not.toContain(fakeToken);
        expect(error.cause).toBeUndefined();
        expect(JSON.stringify(error)).not.toContain(fakeToken);
    });

    it("drops the cause of a timeout whose error holds a header value", async () => {
        const fakeToken = "fake-secret-token-timeout";
        const fetch: HttpFetch = async () => {
            throw Object.assign(new Error(`aborted while sending ${fakeToken}`), {
                name: "TimeoutError",
            });
        };

        const error = await failureOf(
            http(fetch)(URL_WITH_TOKEN, { headers: { Authorization: `Bearer ${fakeToken}` } })
        );

        expect(error.code).toBe("NETWORK");
        expect(error.message).toContain("超时");
        expect(error.cause).toBeUndefined();
        expect(JSON.stringify(error)).not.toContain(fakeToken);
    });

    it.each([false, true])(
        "keeps no cause when an answer that is not JSON repeats a header value (retry %s)",
        async retry => {
            const fakeToken = "fake-secret-token-echoed";
            const fetch: HttpFetch = async () => textResponse(`{"echo": ${fakeToken}}`, 200);
            const client = createHttp({
                fetch,
                userAgent: "saltnet-cli/1.2.3",
                timeoutMs: 5000,
                timeoutKey: "network.timeoutMs",
                retry,
            });

            const response = await client(URL_WITH_TOKEN, { headers: { "X-Token": fakeToken } });
            const error = await failureOf(response.json());

            expect(error.code).toBe("UPSTREAM_ERROR");
            expect(error.message).toBe("meta.example.com 返回的内容不是合法的 JSON");
            expect(error.cause).toBeUndefined();
        }
    );
});

describe("retry", () => {
    function retryingHttp(
        fetch: HttpFetch,
        options?: {
            timeoutMs?: number;
            retryDelayMs?: number;
            sleep?: (ms: number) => Promise<void>;
            log?: (msg: string) => void;
        }
    ) {
        return createHttp({
            fetch,
            userAgent: "saltnet-cli/1.2.3",
            timeoutMs: options?.timeoutMs ?? 5000,
            timeoutKey: "network.timeoutMs",
            retry: true,
            retryDelayMs: options?.retryDelayMs ?? 0,
            sleep: options?.sleep,
            log: options?.log,
        });
    }

    it.each([
        ["connection failure", async () => Promise.reject(fetchFailed("ECONNREFUSED"))],
        ["timeout", async () => Promise.reject(fetchFailed("UND_ERR_CONNECT_TIMEOUT"))],
        ["429", async () => textResponse("rate limited", 429)],
        ["500", async () => textResponse("internal server error", 500)],
        ["502", async () => textResponse("bad gateway", 502)],
        ["503", async () => textResponse("service unavailable", 503)],
        ["504", async () => textResponse("gateway timeout", 504)],
    ])("retries %s exactly once on failure (count is 2)", async (_, failingResponse) => {
        let calls = 0;
        const fetch: HttpFetch = async () => {
            calls++;
            return failingResponse();
        };

        try {
            await retryingHttp(fetch)(URL_WITH_TOKEN);
        } catch {
            // expected for network failures
        }
        expect(calls).toBe(2);
    });

    it.each([400, 404])("does not retry HTTP %s", async status => {
        let calls = 0;
        const fetch: HttpFetch = async () => {
            calls++;
            return textResponse("error", status);
        };

        const res = await retryingHttp(fetch)(URL_WITH_TOKEN);
        expect(calls).toBe(1);
        expect(res.status).toBe(status);
    });

    it("does not retry when retry option is false", async () => {
        let calls = 0;
        const fetch: HttpFetch = async () => {
            calls++;
            return textResponse("service unavailable", 503);
        };
        const client = createHttp({
            fetch,
            userAgent: "agent",
            timeoutMs: 1000,
            timeoutKey: "network.timeoutMs",
            retry: false,
        });
        const res = await client(URL_WITH_TOKEN);
        expect(calls).toBe(1);
        expect(res.status).toBe(503);
    });

    it("returns body when second try succeeds", async () => {
        let calls = 0;
        const fetch: HttpFetch = async () => {
            calls++;
            if (calls === 1) return textResponse("busy", 503);
            return jsonResponse({ success: true });
        };

        const res = await retryingHttp(fetch)(URL_WITH_TOKEN);
        expect(calls).toBe(2);
        expect(res.ok).toBe(true);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true });
    });

    it("second failure is final", async () => {
        let calls = 0;
        const fetch: HttpFetch = async () => {
            calls++;
            return textResponse("down", 503);
        };

        const res = await retryingHttp(fetch)(URL_WITH_TOKEN);
        expect(calls).toBe(2);
        expect(res.status).toBe(503);
        expect(await res.text()).toBe("down");
    });

    it("retries a failure while reading the body", async () => {
        let calls = 0;
        const fetch: HttpFetch = async () => {
            calls++;
            if (calls === 1) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => Promise.reject(fetchFailed("ECONNRESET")),
                    json: async () => Promise.reject(new Error("unused")),
                };
            }
            return jsonResponse({ recovered: true });
        };

        const res = await retryingHttp(fetch)(URL_WITH_TOKEN);
        expect(calls).toBe(2);
        expect(res.ok).toBe(true);
        expect(await res.json()).toEqual({ recovered: true });
    });

    it("does not retry invalid JSON on body read", async () => {
        let calls = 0;
        const fetch: HttpFetch = async () => {
            calls++;
            return textResponse("not json at all");
        };

        const res = await retryingHttp(fetch)(URL_WITH_TOKEN);
        expect(calls).toBe(1);
        const error = await failureOf(res.json());
        expect(error.code).toBe("UPSTREAM_ERROR");
        expect(calls).toBe(1);
    });

    it("awaits the retry delay between tries", async () => {
        const delays: number[] = [];
        const sleep = async (ms: number) => {
            delays.push(ms);
        };
        let calls = 0;
        const fetch: HttpFetch = async () => {
            calls++;
            if (calls === 1) return textResponse("busy", 503);
            return textResponse("ok", 200);
        };

        await retryingHttp(fetch, { retryDelayMs: 250, sleep })(URL_WITH_TOKEN);
        expect(calls).toBe(2);
        expect(delays).toEqual([250]);
    });

    it("waits before retrying a connection failure and logs the retry", async () => {
        const delays: number[] = [];
        const lines: string[] = [];
        let calls = 0;
        const fetch: HttpFetch = async () => {
            calls++;
            if (calls === 1) throw fetchFailed("ECONNRESET");
            return textResponse("ok", 200);
        };
        const sleep = async (ms: number) => {
            delays.push(ms);
        };

        const response = await retryingHttp(fetch, {
            retryDelayMs: 250,
            sleep,
            log: line => lines.push(line),
        })(URL_WITH_TOKEN);

        expect(await response.text()).toBe("ok");
        expect(calls).toBe(2);
        expect(delays).toEqual([250]);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain("meta.example.com");
        expect(lines[0]).toContain("准备重试");
    });

    it("logs a retried status", async () => {
        const lines: string[] = [];
        let calls = 0;
        const fetch: HttpFetch = async () => {
            calls++;
            return calls === 1 ? textResponse("busy", 503) : textResponse("ok", 200);
        };

        await retryingHttp(fetch, { log: line => lines.push(line) })(URL_WITH_TOKEN);

        expect(lines).toEqual(["请求 meta.example.com 返回 HTTP 503，准备重试"]);
    });

    it("waits 500 ms before a retry by default", async () => {
        const delays: number[] = [];
        let calls = 0;
        const client = createHttp({
            fetch: async () => {
                calls++;
                return textResponse(calls === 1 ? "busy" : "ok", calls === 1 ? 502 : 200);
            },
            userAgent: "saltnet-cli/1.2.3",
            timeoutMs: 5000,
            timeoutKey: "network.timeoutMs",
            retry: true,
            sleep: async ms => {
                delays.push(ms);
            },
        });

        expect(await (await client(URL_WITH_TOKEN)).text()).toBe("ok");
        expect(delays).toEqual([500]);
    });

    it("gives each try its own deadline", async () => {
        const fetch = mockFetch({
            [URL_WITH_TOKEN]: delayedRoute(textResponse("ok"), 30),
        });

        const error = await failureOf(retryingHttp(fetch, { timeoutMs: 20 })(URL_WITH_TOKEN));
        expect(fetch.requests).toHaveLength(2);
        expect(error.code).toBe("NETWORK");
        expect(error.message).toContain("超时");
    });
});
