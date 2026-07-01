import { ImageResponse } from "takumi-js/response";
import {
    B50_FONT_FAMILIES,
    B50_RENDER_LANG,
    loadB50RenderFonts,
} from "../../shared/rendering/b50-fonts";
import { B50_RENDER_SIZE, B50RenderImage } from "../../shared/rendering/b50-image";
import { getImageCacheSeconds } from "./env";
import type { RenderEnv } from "./env";
import { decompressPayload, parseB50Payload } from "./payload";

export interface RenderContext {
    request: Request;
    env: RenderEnv;
    renderB50Response?: (
        payload: ReturnType<typeof parseB50Payload>,
        env: RenderEnv
    ) => Promise<Response>;
}

let assetsFetcher: Fetcher | undefined;

// Intercept fetch globally to route static asset calls internally via env.ASSETS.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    // Check if it's requesting one of the static assets
    const isAsset =
        urlStr.includes("/favicon.png") ||
        urlStr.includes("/b50_background.png") ||
        urlStr.includes("/icons/");

    if (isAsset && assetsFetcher) {
        try {
            const url = new URL(urlStr, "http://assets.local");
            const assetPath = url.pathname;
            return await assetsFetcher.fetch(new Request(`http://assets.local${assetPath}`, init));
        } catch (error) {
            console.error("Error fetching local static asset:", error);
        }
    }

    return originalFetch(input, init);
};

export async function handleRenderRequest(context: RenderContext): Promise<Response> {
    try {
        assetsFetcher = context.env.ASSETS;
        const url = new URL(context.request.url);
        const pathname = normalizePathname(url.pathname);

        if (context.request.method === "OPTIONS") {
            return withCors(new Response(null, { status: 204 }));
        }

        if (context.request.method === "GET" && pathname === "/health") {
            return withCors(json({ ok: true, service: "saltnet-render-service" }));
        }

        if (
            (context.request.method === "GET" || context.request.method === "POST") &&
            pathname === "/render/b50.png"
        ) {
            return withCors(await renderB50Image(context));
        }

        return withCors(json({ error: "Not found" }, { status: 404 }));
    } catch (error) {
        return withCors(
            json({ error: `Internal Server Error: ${getErrorMessage(error)}` }, { status: 500 })
        );
    }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(data), {
        ...init,
        headers,
    });
}

async function renderB50Image(context: RenderContext): Promise<Response> {
    let payload: ReturnType<typeof parseB50Payload>;
    const url = new URL(context.request.url);
    const pParam = url.searchParams.get("p") || url.searchParams.get("payload");

    if (context.request.method === "GET" || pParam) {
        if (!pParam) {
            return json({ error: "Missing payload parameter" }, { status: 400 });
        }
        try {
            payload = await decompressPayload(pParam);
        } catch (error) {
            return json(
                { error: `Invalid payload encoding: ${getErrorMessage(error)}` },
                { status: 400 }
            );
        }
    } else {
        let body: unknown;
        try {
            body = await context.request.json();
        } catch {
            return json({ error: "Request body must be JSON" }, { status: 400 });
        }

        try {
            payload = parseB50Payload(body);
        } catch (error) {
            return json({ error: getErrorMessage(error) }, { status: 400 });
        }
    }

    try {
        return context.renderB50Response
            ? context.renderB50Response(payload, context.env)
            : renderTakumiB50Response(payload, context.env);
    } catch (error) {
        return json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

async function renderTakumiB50Response(
    payload: ReturnType<typeof parseB50Payload>,
    env: RenderEnv
): Promise<Response> {
    const fonts = await loadB50RenderFonts(payload);
    const response = new ImageResponse(<B50RenderImage payload={payload} />, {
        ...B50_RENDER_SIZE,
        format: "png",
        fonts,
        fontFamilies: B50_FONT_FAMILIES,
        lang: B50_RENDER_LANG,
        headers: {
            "cache-control": `public, max-age=${getImageCacheSeconds(env)}`,
        },
    });
    await response.ready;
    return response;
}

function normalizePathname(pathname: string): string {
    return pathname.startsWith("/api/render")
        ? pathname.slice("/api/render".length) || "/"
        : pathname;
}

function withCors(response: Response): Response {
    try {
        response.headers.set("Access-Control-Allow-Origin", "*");
        response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        response.headers.set(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, Accept, Origin, X-Requested-With"
        );
        response.headers.set("Access-Control-Max-Age", "86400");
        return response;
    } catch {
        const headers = new Headers(response.headers);
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        headers.set(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, Accept, Origin, X-Requested-With"
        );
        headers.set("Access-Control-Max-Age", "86400");
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    }
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Unknown error";
}
