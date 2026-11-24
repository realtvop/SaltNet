/**
 * The slice of the Fetch API that shared/core needs. Browsers, Workers and Node 18+ all provide a
 * global `fetch` that satisfies `FetchLike`, and tests can pass a plain function. Callers inject
 * their own implementation to add timeouts, proxies or request logging.
 */
export interface FetchInit {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    cache?: "no-store";
}

export interface FetchResponse {
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
}

export type FetchLike = (input: string, init?: FetchInit) => Promise<FetchResponse>;
