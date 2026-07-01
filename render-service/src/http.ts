import { ImageResponse } from "takumi-js/response";
import { B50_RENDER_SIZE, renderB50Html } from "./b50-template";
import { getImageCacheSeconds, getTtlSeconds } from "./env";
import type { RenderEnv } from "./env";
import { parseB50Payload } from "./payload";
import { createRenderId, getPayloadKey, isValidRenderId, RenderPayloadStore } from "./storage";

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

    if (context.request.method === "POST" && pathname === "/render/b50/jobs") {
        return withCors(await createB50RenderJob(context, url));
    }

    const match = pathname.match(/^\/render\/b50\/([a-z0-9]{32,64})\.png$/);
    if (context.request.method === "GET" && match) {
        return withCors(await renderB50Image(context, match[1]));
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

async function createB50RenderJob(context: RenderContext, url: URL): Promise<Response> {
    let body: unknown;
    try {
        body = await context.request.json();
    } catch {
        return json({ error: "Request body must be JSON" }, { status: 400 });
    }

    try {
        const payload = parseB50Payload(body);
        const id = createRenderId();
        const store = new RenderPayloadStore(context.env);
        await store.set(getPayloadKey(id), JSON.stringify(payload), getTtlSeconds(context.env));

        return json(
            {
                id,
                url: `${url.origin}/render/b50/${id}.png`,
                expiresIn: getTtlSeconds(context.env),
            },
            { status: 201 }
        );
    } catch (error) {
        return json({ error: getErrorMessage(error) }, { status: 400 });
    }
}

async function renderB50Image(context: RenderContext, id: string): Promise<Response> {
    if (!isValidRenderId(id)) return json({ error: "Invalid render id" }, { status: 400 });

    try {
        const store = new RenderPayloadStore(context.env);
        const stored = await store.get(getPayloadKey(id));
        if (!stored) return json({ error: "Render payload expired or not found" }, { status: 404 });

        const payload = parseB50Payload(JSON.parse(stored));
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
    const response = new ImageResponse(renderB50Html(payload), {
        ...B50_RENDER_SIZE,
        format: "png",
        fonts: [
            "https://fonts.gstatic.com/s/notosanssc/v39/k3kJo84MPvpLmixcA63oeALZTYKL2wv287Sb.otf",
            "https://fonts.gstatic.com/s/notosansjp/v55/-F6jfjtqLzI2JPCgQBnw7HFQoggM-FNthvIU.otf",
            "https://fonts.gstatic.com/s/notosanstc/v38/-nF7OG829Oofr2wohFbTp9i9WyEJIfNZ1g.woff2",
        ],
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
