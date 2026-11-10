import type { FetchResponse } from "@core/http";
import type { HttpFetch } from "../../src/runtime/io";
import { describe, expect, it } from "vitest";
import { buildRegistry, defineCommand } from "../../src/commands/registry";
import { CliError } from "../../src/errors";
import { createHttp, hostOf, upstreamStatusError } from "../../src/runtime/http";
import { createHarness, run } from "../harness";
import { jsonResponse, mockFetch, textResponse } from "../mockHttp";

const URL_WITH_TOKEN = "https://meta.example.com/data/v1.json?token=secret";

function http(fetch: HttpFetch, timeoutMs = 5000) {
    return createHttp({ fetch, userAgent: "saltnet-cli/1.2.3", timeoutMs });
}

/** An error the way Node's `fetch` reports a connection that failed. */
function fetchFailed(code: string): Error {
    return Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error(`connect ${code} 127.0.0.1:443`), { code }),
    });
}

function named(name: string, message: string): Error {
    return Object.assign(new Error(message), { name });
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

describe("network failures", () => {
    it("reports a refused connection as NETWORK, with the host and the cause", async () => {
        const error = await failureOf(
            http(async () => Promise.reject(fetchFailed("ECONNREFUSED")))(URL_WITH_TOKEN)
        );

        expect(error.code).toBe("NETWORK");
        expect(error.exitCode).toBe(5);
        expect(error.retryable).toBe(true);
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

    it("reports a body that times out while it is read", async () => {
        const response: FetchResponse = {
            ok: true,
            status: 200,
            text: async () =>
                Promise.reject(named("TimeoutError", "The operation was aborted due to timeout")),
            json: async () => Promise.reject(named("TimeoutError", "unused")),
        };
        const read = (await http(async () => response, 1500)(URL_WITH_TOKEN)).json();

        const error = await failureOf(read);
        expect(error.code).toBe("NETWORK");
        expect(error.message).toBe("请求 meta.example.com 超时（超过 1.5 秒 没有完成）");
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
            const response = await ctx.http(args.options.slow ? { timeoutMs: 15 } : undefined)(
                "https://example.com/ping"
            );
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
        expect(JSON.parse(harness.stdout()).error.message).toContain("超时");
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
