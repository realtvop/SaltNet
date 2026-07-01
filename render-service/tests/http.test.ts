import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleRenderRequest } from "../src/http";
import type { RenderEnv } from "../src/env";
import type { B50RenderPayload } from "../src/payload";

const env: RenderEnv = {
    RENDER_REDIS_REST_URL: "https://redis.example.test",
    RENDER_REDIS_REST_TOKEN: "token",
    RENDER_PAYLOAD_TTL_SECONDS: "3600",
    RENDER_IMAGE_CACHE_SECONDS: "600",
};

describe("handleRenderRequest", () => {
    const storage = new Map<string, string>();

    beforeEach(() => {
        storage.clear();
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
                const command = JSON.parse(String(init?.body)) as unknown[];
                const op = command[0];
                const key = String(command[1]);

                if (op === "SET") {
                    storage.set(key, String(command[2]));
                    return Response.json({ result: "OK" });
                }

                if (op === "GET") {
                    return Response.json({ result: storage.get(key) ?? null });
                }

                return Response.json({ error: "unknown command" }, { status: 400 });
            })
        );
    });

    it("returns health status", async () => {
        const response = await handleRenderRequest({
            request: new Request("https://render.example.test/health"),
            env,
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            ok: true,
            service: "saltnet-render-service",
        });
    });

    it("creates a B50 render job", async () => {
        const response = await createJob();
        const data = (await response.json()) as { id: string; url: string; expiresIn: number };

        expect(response.status).toBe(201);
        expect(data.id).toMatch(/^[a-z0-9]{32,64}$/);
        expect(data.url).toBe(`https://render.example.test/render/b50/${data.id}.png`);
        expect(data.expiresIn).toBe(3600);
    });

    it("renders a stored B50 job through the image route", async () => {
        const jobResponse = await createJob();
        const job = (await jobResponse.json()) as { id: string };

        const response = await handleRenderRequest({
            request: new Request(`https://render.example.test/render/b50/${job.id}.png`),
            env,
            renderB50Response: async payload =>
                new Response(`png:${payload.playerName}`, {
                    headers: {
                        "content-type": "image/png",
                    },
                }),
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/png");
        expect(await response.text()).toBe("png:Salt");
    });

    it("returns 404 for an expired render job", async () => {
        const response = await handleRenderRequest({
            request: new Request(`https://render.example.test/render/b50/${"a".repeat(32)}.png`),
            env,
        });

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toMatchObject({
            error: "Render payload expired or not found",
        });
    });
});

function createJob(): Promise<Response> {
    return handleRenderRequest({
        request: new Request("https://render.example.test/render/b50/jobs", {
            method: "POST",
            body: JSON.stringify(samplePayload()),
        }),
        env,
    });
}

function samplePayload(): B50RenderPayload {
    return {
        playerName: "Salt",
        playerSecondaryName: "舞萌",
        playerRating: 15000,
        modeLabel: "B50",
        showDxScore: true,
        sd: [
            {
                songId: 123,
                title: "テスト曲",
                type: "DX",
                levelIndex: 3,
                ds: 13.7,
                achievements: 100.5,
                fc: "app",
                fs: "fsdp",
                rate: "sssp",
                ra: 310,
                deluxeScore: 1200,
                deluxeScoreMax: 1250,
            },
        ],
        dx: [],
    };
}
