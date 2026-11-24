/** A network for tests: requests are answered from a table, and everything else fails loudly. */
import type { FetchResponse } from "@core/http";
import type { HttpFetch, HttpInit, HttpResponse } from "../src/runtime/io";

type RequestInitOptions = HttpInit & Pick<RequestInit, "redirect">;

export interface RecordedRequest {
    url: string;
    init?: RequestInitOptions;
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

/**
 * A binary body (a picture) as real `fetch` gives it: `text()` and `json()` decode it as UTF-8 the
 * way a real `Response` does, so code that reads a picture as text breaks here as it would against
 * a real server, and `arrayBuffer()` gives the bytes. Unlike a real response it can be read again.
 */
export function binaryResponse(bytes: Uint8Array, status = 200): HttpResponse {
    const fresh = () => new Response(bytes.slice(), { status });
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => fresh().text(),
        json: async () => (await fresh().json()) as unknown,
        arrayBuffer: async () => fresh().arrayBuffer(),
    };
}

type RouteResponse = HttpResponse & { headers?: Headers };
export type Route =
    | RouteResponse
    | ((request: RecordedRequest) => RouteResponse | Promise<RouteResponse>);

export function redirectResponse(location: string, status: number): RouteResponse {
    return { ...textResponse("", status), headers: new Headers({ Location: location }) };
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function redirectedInit(
    init: RequestInitOptions | undefined,
    status: number,
    crossOrigin: boolean
) {
    const method = init?.method?.toUpperCase() ?? "GET";
    const toGet =
        ((status === 301 || status === 302) && method === "POST") ||
        (status === 303 && method !== "GET" && method !== "HEAD");
    const headers = new Headers(init?.headers);
    if (crossOrigin) {
        for (const name of ["authorization", "proxy-authorization", "cookie", "host"]) {
            headers.delete(name);
        }
    }
    if (toGet) {
        for (const name of [
            "content-encoding",
            "content-language",
            "content-location",
            "content-type",
        ]) {
            headers.delete(name);
        }
    }
    // Preserve spelling so callers inspecting the mock see the original request header names.
    const keptHeaders = Object.fromEntries(
        Object.entries(init?.headers ?? {}).filter(([name]) => headers.has(name))
    );
    return {
        ...init,
        headers: keptHeaders,
        ...(toGet ? { method: "GET", body: undefined } : {}),
    };
}

/** Answers after a delay, rejecting like fetch when the request's deadline aborts first. */
export function delayedRoute(response: FetchResponse, delayMs: number): Route {
    return request =>
        new Promise((resolve, reject) => {
            const { signal } = request.init ?? {};
            const aborted = () =>
                reject(
                    signal?.reason ?? Object.assign(new Error("aborted"), { name: "AbortError" })
                );
            if (signal?.aborted) {
                aborted();
                return;
            }
            let timer: ReturnType<typeof setTimeout>;
            const onAbort = () => {
                clearTimeout(timer);
                aborted();
            };
            timer = setTimeout(() => {
                signal?.removeEventListener("abort", onAbort);
                resolve(response);
            }, delayMs);
            signal?.addEventListener("abort", onAbort, { once: true });
        });
}

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
    const send = async (
        url: string,
        init: RequestInitOptions | undefined,
        redirects: number
    ): Promise<HttpResponse> => {
        const request: RecordedRequest = { url, init };
        requests.push(request);
        const route = routes[url];
        if (route === undefined) {
            throw new Error(`测试没有模拟这个地址的网络请求：${url}`);
        }
        const response = typeof route === "function" ? await route(request) : route;
        if (!REDIRECT_STATUSES.has(response.status) || init?.redirect === "manual") {
            return response;
        }
        if (init?.redirect === "error") throw new TypeError("Unexpected redirect");
        const location = response.headers?.get("location");
        if (location == null) return response;
        if (redirects >= 20) throw new TypeError("Too many redirects");
        const nextUrl = new URL(location, url);
        return send(
            nextUrl.href,
            redirectedInit(init, response.status, nextUrl.origin !== new URL(url).origin),
            redirects + 1
        );
    };
    const fetch: HttpFetch = (url, init) => send(url, init, 0);
    return Object.assign(fetch, { requests });
}
