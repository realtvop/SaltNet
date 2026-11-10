/** A network for tests: requests are answered from a table, and everything else fails loudly. */
import type { FetchResponse } from "@core/http";
import type { HttpFetch, HttpInit } from "../src/runtime/io";

export interface RecordedRequest {
    url: string;
    init?: HttpInit;
}

/** A response with a text body, the way `fetch` gives it; `json()` fails on text that is not JSON. */
export function textResponse(text: string, status = 200): FetchResponse {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => text,
        json: async () => JSON.parse(text) as unknown,
    };
}

export function jsonResponse(body: unknown, status = 200): FetchResponse {
    return textResponse(JSON.stringify(body), status);
}

export type Route =
    | FetchResponse
    | ((request: RecordedRequest) => FetchResponse | Promise<FetchResponse>);

export interface MockFetch extends HttpFetch {
    /** Every request made so far, in order. */
    readonly requests: RecordedRequest[];
}

/**
 * Answers a request with the route keyed by its exact URL. A URL without a route is a bug in the
 * test (or in the code under test, which reached for a service nobody expected), so it throws.
 */
export function mockFetch(routes: Readonly<Record<string, Route>> = {}): MockFetch {
    const requests: RecordedRequest[] = [];
    const fetch: HttpFetch = async (url, init) => {
        const request: RecordedRequest = { url, init };
        requests.push(request);
        const route = routes[url];
        if (route === undefined) {
            throw new Error(`测试没有模拟这个地址的网络请求：${url}`);
        }
        return typeof route === "function" ? route(request) : route;
    };
    return Object.assign(fetch, { requests });
}
