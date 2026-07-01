import { ImageResponse } from "takumi-js/response";
import {
    B50_FONT_FAMILIES,
    B50_RENDER_LANG,
    loadB50RenderFonts,
} from "../../shared/rendering/b50-fonts";
import { B50_RENDER_SIZE, B50RenderImage } from "../../shared/rendering/b50-image";
import { getImageCacheSeconds } from "./env";
import type { RenderEnv } from "./env";
import { parseB50Payload } from "./payload";

export interface RenderContext {
    request: Request;
    env: RenderEnv;
    renderB50Response?: (
        payload: ReturnType<typeof parseB50Payload>,
        env: RenderEnv
    ) => Promise<Response>;
}

export async function handleRenderRequest(context: RenderContext): Promise<Response> {
    const url = new URL(context.request.url);
    const pathname = normalizePathname(url.pathname);

    if (context.request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }));
    }

    if (context.request.method === "GET" && pathname === "/health") {
        return withCors(json({ ok: true, service: "saltnet-render-service" }));
    }

    if (context.request.method === "POST" && pathname === "/render/b50.png") {
        return withCors(await renderB50Image(context));
    }

    return withCors(json({ error: "Not found" }, { status: 404 }));
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
    let body: unknown;
    try {
        body = await context.request.json();
    } catch {
        return json({ error: "Request body must be JSON" }, { status: 400 });
    }

    let payload: ReturnType<typeof parseB50Payload>;
    try {
        payload = parseB50Payload(body);
    } catch (error) {
        return json({ error: getErrorMessage(error) }, { status: 400 });
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
    const headers = new Headers(response.headers);
    headers.set("access-control-allow-origin", "*");
    headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
    headers.set("access-control-allow-headers", "content-type, authorization");
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Unknown error";
}
