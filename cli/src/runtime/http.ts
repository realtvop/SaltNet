/**
 * The CLI's HTTP layer (design 4.6). shared/core takes a `fetch` it can call without caring where
 * it runs; this one adds the User-Agent and a deadline for the whole exchange, and turns what goes
 * wrong into errors an agent can act on: a connection that failed or ran out of time is `NETWORK`,
 * an answer that cannot be read is `UPSTREAM_ERROR`. Messages name the host only, because a URL
 * can carry a token in its query.
 */
import type { FetchInit, FetchResponse } from "@core/http";
import type { ConfigKey } from "./config";
import type { HttpFetch, HttpResponse } from "./io";
import { CliError } from "../errors";

export type TimeoutConfigKey = Extract<
    ConfigKey,
    "metadata.timeoutMs" | "network.timeoutMs" | "network.updateTimeoutMs"
>;

/**
 * A response from `createHttp`: core's response plus `bytes`, the body as it came, for a body that
 * is not text (a picture). Each response's body is read once: by `text`, `json` or `bytes`.
 */
export interface CliResponse extends FetchResponse {
    bytes: () => Promise<Uint8Array>;
}

type CliRequestInit = FetchInit & Pick<RequestInit, "redirect">;

/** What `createHttp` gives. It is a `FetchLike` too, so shared/core takes it as it is. */
export type CliFetch = (input: string, init?: CliRequestInit) => Promise<CliResponse>;

export interface HttpOptions {
    /** The real network in production; a test passes its own. */
    fetch: HttpFetch;
    userAgent: string;
    /** For the whole exchange, the body included. */
    timeoutMs: number;
    /** The setting to name when this deadline expires. */
    timeoutKey: TimeoutConfigKey;
    retry?: boolean;
    /** Read the response body within the request, even when the caller handles retries. */
    buffer?: boolean;
    retryDelayMs?: number;
    sleep?: (ms: number) => Promise<void>;
    log?: (message: string) => void;
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

const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 500, 502, 503, 504]);

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

function hasInvalidHeaderChar(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code === 0 || code === 10 || code === 13 || code > 0xff) {
            return true;
        }
    }
    return false;
}

function collectHeaderSecrets(headers: Record<string, string>): readonly string[] {
    const secrets: string[] = [];
    for (const v of Object.values(headers)) {
        if (typeof v === "string" && v.length >= 4) {
            secrets.push(v);
            if (v.startsWith("Bearer ") && v.length > 7) {
                secrets.push(v.slice(7));
            }
        }
    }
    return [...new Set(secrets)].sort((a, b) => b.length - a.length);
}

function redact(text: string, secrets: readonly string[]): { text: string; replaced: boolean } {
    let result = text;
    let replaced = false;
    for (const secret of secrets) {
        if (result.includes(secret)) {
            replaced = true;
            result = result.replaceAll(secret, "<已隐藏>");
        }
    }
    return { text: result, replaced };
}

function errorChainContains(error: unknown, secrets: readonly string[]): boolean {
    if (secrets.length === 0) return false;
    let current: unknown = error;
    for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current != null; depth++) {
        const message = current instanceof Error ? current.message : String(current);
        for (const secret of secrets) {
            if (message.includes(secret)) return true;
        }
        current = current instanceof Error ? current.cause : undefined;
    }
    return false;
}

function networkError(
    host: string,
    error: unknown,
    timeoutMs: number,
    timeoutKey: TimeoutConfigKey,
    phase: "request" | "body",
    secrets: readonly string[]
): CliError {
    const hasSecret = errorChainContains(error, secrets);
    if (isTimeout(error)) {
        return new CliError(
            "NETWORK",
            `请求 ${host} 超时（超过 ${formatDuration(timeoutMs)} 没有完成）`,
            {
                fix: `网络较慢时可以调大 ${timeoutKey}，例如 saltnet config set ${timeoutKey} 60000`,
                cause: hasSecret ? undefined : error,
            }
        );
    }
    const rawReason = reasonOf(error);
    const { text: reason, replaced } = redact(rawReason, secrets);
    const shouldDropCause = hasSecret || replaced;
    return new CliError(
        "NETWORK",
        phase === "request"
            ? `无法连接到 ${host}（${reason}）`
            : `读取 ${host} 的响应时中断（${reason}）`,
        { cause: shouldDropCause ? undefined : error }
    );
}

/**
 * The body as JSON. The parse error is not kept as the cause: it quotes the start of the body, which
 * can repeat a header value cut short (a server that echoes the request), and it adds nothing to
 * the message.
 */
function parseJson(host: string, text: string): unknown {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        throw new CliError("UPSTREAM_ERROR", `${host} 返回的内容不是合法的 JSON`);
    }
}

/**
 * The whole body, as bytes when the response can give them (real `fetch` can) and as text when it
 * cannot (a test's made-up response).
 */
async function readBody(response: HttpResponse): Promise<Uint8Array | string> {
    return response.arrayBuffer
        ? new Uint8Array(await response.arrayBuffer())
        : await response.text();
}

function bytesOf(body: Uint8Array | string): Uint8Array {
    return typeof body === "string" ? new TextEncoder().encode(body) : body;
}

/** The text `Response.text()` gives for these bytes: UTF-8, a BOM dropped, bad bytes replaced. */
function textOf(body: Uint8Array | string): string {
    return typeof body === "string" ? body : new TextDecoder().decode(body);
}

/** A response whose body was read already, so that text, JSON and bytes can all be asked for. */
function bufferedResponse(
    host: string,
    response: FetchResponse,
    body: Uint8Array | string
): CliResponse {
    let text: string | undefined;
    const readText = (): string => (text ??= textOf(body));
    return {
        ok: response.ok,
        status: response.status,
        text: async () => readText(),
        json: async () => parseJson(host, readText()),
        bytes: async () => bytesOf(body),
    };
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
 * A `fetch` for shared/core and the commands. Guarded manual redirects are status errors.
 * Other unsuccessful responses are passed through for the caller to interpret.
 * With `retry` or `buffer` the body is read before the response is returned. Otherwise the caller
 * reads the body on demand.
 */
export function createHttp(options: HttpOptions): CliFetch {
    const { timeoutMs, timeoutKey, retry = false } = options;
    const retryDelayMs = options.retryDelayMs ?? 500;
    const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));

    return async (input: string, init?: CliRequestInit): Promise<CliResponse> => {
        const host = hostOf(input);
        const headers: Record<string, string> = {
            "User-Agent": options.userAgent,
            ...init?.headers,
        };

        for (const [name, val] of Object.entries(headers)) {
            if (val !== undefined && hasInvalidHeaderChar(String(val))) {
                throw new CliError(
                    "INTERNAL",
                    `请求头 ${name} 的值含有不能发送的字符；如果它来自绑定的凭据，请重新绑定`
                );
            }
        }

        const method = init?.method?.toUpperCase() ?? "GET";
        const guarded =
            (method !== "GET" && method !== "HEAD") ||
            Object.keys(headers).some(name => {
                const lower = name.toLowerCase();
                return lower === "authorization" || lower === "import-token";
            });
        const request: CliRequestInit = { ...init, headers };
        if (guarded) request.redirect ??= "manual";
        const secrets = collectHeaderSecrets(headers);

        function checkRedirect(status: number): void {
            if (guarded && request.redirect === "manual" && status >= 300 && status < 400) {
                throw upstreamStatusError(input, status);
            }
        }

        if (retry || options.buffer) {
            const attempts = retry ? 2 : 1;
            let lastError: unknown;
            for (let attempt = 1; attempt <= attempts; attempt++) {
                const signal = AbortSignal.timeout(timeoutMs);
                let rawResponse: HttpResponse;
                try {
                    rawResponse = await options.fetch(input, { ...request, signal });
                } catch (error) {
                    lastError = networkError(
                        host,
                        error,
                        timeoutMs,
                        timeoutKey,
                        "request",
                        secrets
                    );
                    if (attempt < attempts) {
                        options.log?.(
                            `请求 ${host} 失败（${(lastError as CliError).message}），准备重试`
                        );
                        await sleep(retryDelayMs);
                        continue;
                    }
                    throw lastError;
                }

                checkRedirect(rawResponse.status);
                if (attempt < attempts && RETRYABLE_STATUSES.has(rawResponse.status)) {
                    options.log?.(`请求 ${host} 返回 HTTP ${rawResponse.status}，准备重试`);
                    await sleep(retryDelayMs);
                    continue;
                }

                let body: Uint8Array | string;
                try {
                    body = await readBody(rawResponse);
                } catch (error) {
                    lastError = networkError(host, error, timeoutMs, timeoutKey, "body", secrets);
                    if (attempt < attempts) {
                        options.log?.(`读取 ${host} 响应中断，准备重试`);
                        await sleep(retryDelayMs);
                        continue;
                    }
                    throw lastError;
                }

                return bufferedResponse(host, rawResponse, body);
            }
            throw lastError;
        }

        let response: HttpResponse;
        try {
            response = await options.fetch(input, {
                ...request,
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch (error) {
            throw networkError(host, error, timeoutMs, timeoutKey, "request", secrets);
        }
        checkRedirect(response.status);

        // The deadline also covers the body, which is where a slow server usually stalls.
        const readText = async (): Promise<string> => {
            try {
                return await response.text();
            } catch (error) {
                throw networkError(host, error, timeoutMs, timeoutKey, "body", secrets);
            }
        };
        const readBytes = async (): Promise<Uint8Array> => {
            try {
                return bytesOf(await readBody(response));
            } catch (error) {
                throw networkError(host, error, timeoutMs, timeoutKey, "body", secrets);
            }
        };

        return {
            ok: response.ok,
            status: response.status,
            text: readText,
            json: async () => parseJson(host, await readText()),
            bytes: readBytes,
        };
    };
}
