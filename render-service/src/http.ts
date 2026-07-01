import type { RenderEnv } from "./env";

export interface RenderContext {
    request: Request;
    env: RenderEnv;
}

export async function handleRenderRequest(context: RenderContext): Promise<Response> {
    const url = new URL(context.request.url);

    if (context.request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "saltnet-render-service" });
    }

    return json({ error: "Not found" }, { status: 404 });
}

export function json(data: unknown, init: ResponseInit = {}): Response {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(data), {
        ...init,
        headers,
    });
}
