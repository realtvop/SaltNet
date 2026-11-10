/**
 * The CLI's HTTP layer (design 4.6). shared/core takes a `fetch` it can call without caring where
 * it runs; this one adds the User-Agent and a deadline for the whole exchange, and turns what goes
 * wrong into errors an agent can act on: a connection that failed or ran out of time is `NETWORK`,
 * an answer that cannot be read is `UPSTREAM_ERROR`. Messages name the host only, because a URL
 * can carry a token in its query.
 */
import type { FetchInit, FetchLike, FetchResponse } from "@core/http";
import type { HttpFetch } from "./io";
import { CliError } from "../errors";

export interface HttpOptions {
    /** The real network in production; a test passes its own. */
    fetch: HttpFetch;
    userAgent: string;
    /** For the whole exchange, the body included. */
    timeoutMs: number;
}

/** Just the host, for messages. */
export function hostOf(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return "上游服务";
    }
}

function formatDuration(ms: number): string {
    return ms < 1000 ? `${ms} 毫秒` : `${Number((ms / 1000).toFixed(1))} 秒`;
}

// The deadlines undici (Node's `fetch`) applies on its own, named by the code of the error.
const TIMEOUT_CODES: ReadonlySet<string> = new Set([
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_BODY_TIMEOUT",
    "ETIMEDOUT",
]);

const MAX_CAUSE_DEPTH = 5;

function codeOf(error: unknown): string | undefined {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === "string" ? code : undefined;
}

/** An error that says the time ran out, either this layer's own deadline or one of undici's. */
function isTimeout(error: unknown, depth = 0): boolean {
    if (!(error instanceof Error) || depth > MAX_CAUSE_DEPTH) return false;
    if (error.name === "TimeoutError" || error.name === "AbortError") return true;
    const code = codeOf(error);
    if (code !== undefined && TIMEOUT_CODES.has(code)) return true;
    return isTimeout(error.cause, depth + 1);
}

/** `fetch failed` says nothing; the code of its cause (ECONNREFUSED, ENOTFOUND, ...) does. */
function reasonOf(error: unknown): string {
    let current: unknown = error;
    let message = error instanceof Error ? error.message : String(error);
    for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current instanceof Error; depth++) {
        const code = codeOf(current);
        if (code !== undefined) return code;
        message = current.message || message;
        current = current.cause;
    }
    return message;
}

function networkError(
    host: string,
    error: unknown,
    timeoutMs: number,
    phase: "request" | "body"
): CliError {
    if (isTimeout(error)) {
        return new CliError(
            "NETWORK",
            `请求 ${host} 超时（超过 ${formatDuration(timeoutMs)} 没有完成）`,
            { cause: error }
        );
    }
    const reason = reasonOf(error);
    return new CliError(
        "NETWORK",
        phase === "request"
            ? `无法连接到 ${host}（${reason}）`
            : `读取 ${host} 的响应时中断（${reason}）`,
        { cause: error }
    );
}

/**
 * The error for an HTTP status that is not a success. A 5xx or 429 may pass by itself, so the same
 * command can be run again; anything else would answer the same way.
 */
export function upstreamStatusError(url: string, status: number): CliError {
    return new CliError("UPSTREAM_ERROR", `${hostOf(url)} 返回了 HTTP ${status}`, {
        retryable: status >= 500 || status === 429,
        extra: { status },
    });
}

/**
 * A `fetch` for shared/core. It does not judge the status: core reports `!ok` in its own way, and
 * `upstreamStatusError` is there for the callers that turn it into a `CliError`.
 */
export function createHttp(options: HttpOptions): FetchLike {
    const { timeoutMs } = options;

    return async (input: string, init?: FetchInit): Promise<FetchResponse> => {
        const host = hostOf(input);
        let response: FetchResponse;
        try {
            response = await options.fetch(input, {
                ...init,
                headers: { "User-Agent": options.userAgent, ...init?.headers },
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch (error) {
            throw networkError(host, error, timeoutMs, "request");
        }

        // The deadline also covers the body, which is where a slow server usually stalls.
        const readText = async (): Promise<string> => {
            try {
                return await response.text();
            } catch (error) {
                throw networkError(host, error, timeoutMs, "body");
            }
        };

        return {
            ok: response.ok,
            status: response.status,
            text: readText,
            json: async () => {
                const text = await readText();
                try {
                    return JSON.parse(text) as unknown;
                } catch (error) {
                    throw new CliError("UPSTREAM_ERROR", `${host} 返回的内容不是合法的 JSON`, {
                        cause: error,
                    });
                }
            },
        };
    };
}
