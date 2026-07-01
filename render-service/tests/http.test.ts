import { describe, expect, it } from "vitest";
import { handleRenderRequest } from "../src/http";
import type { RenderEnv } from "../src/env";
import type { B50RenderPayload } from "../src/payload";
import { compressPayload } from "../src/payload";

const env: RenderEnv = {
    RENDER_IMAGE_CACHE_SECONDS: "600",
};

describe("handleRenderRequest", () => {
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

    it("renders a B50 image directly from the posted payload", async () => {
        const response = await handleRenderRequest({
            request: new Request("https://render.example.test/render/b50.png", {
                method: "POST",
                body: JSON.stringify(samplePayload()),
            }),
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

    it("renders a B50 image from a GET request with compressed payload query parameter", async () => {
        const compressed = await compressPayload(samplePayload());
        const response = await handleRenderRequest({
            request: new Request(`https://render.example.test/render/b50.png?p=${compressed}`, {
                method: "GET",
            }),
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

    it("renders a B50 image from a POST request with form-encoded raw JSON payload", async () => {
        const formData = new FormData();
        formData.append("payload", JSON.stringify(samplePayload()));

        const response = await handleRenderRequest({
            request: new Request("https://render.example.test/render/b50.png", {
                method: "POST",
                body: formData,
            }),
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

    it("renders a B50 image from a POST request with form-encoded compressed payload", async () => {
        const compressed = await compressPayload(samplePayload());
        const formData = new FormData();
        formData.append("p", compressed);

        const response = await handleRenderRequest({
            request: new Request("https://render.example.test/render/b50.png", {
                method: "POST",
                body: formData,
            }),
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

    it("rejects invalid direct render payloads", async () => {
        const response = await handleRenderRequest({
            request: new Request("https://render.example.test/render/b50.png", {
                method: "POST",
                body: JSON.stringify({ playerName: "", sd: [], dx: [] }),
            }),
            env,
        });

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            error: "playerName cannot be empty",
        });
    });

    it("does not expose legacy B50 job routes", async () => {
        const postResponse = await handleRenderRequest({
            request: new Request("https://render.example.test/render/b50/jobs", {
                method: "POST",
                body: JSON.stringify(samplePayload()),
            }),
            env,
        });
        const getResponse = await handleRenderRequest({
            request: new Request(`https://render.example.test/render/b50/${"a".repeat(32)}.png`),
            env,
        });

        expect(postResponse.status).toBe(404);
        expect(getResponse.status).toBe(404);
        expect(postResponse.headers.get("Access-Control-Allow-Origin")).toBe("*");
        expect(getResponse.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    describe("CORS support", () => {
        it("returns CORS headers on OPTIONS preflight request", async () => {
            const response = await handleRenderRequest({
                request: new Request("https://render.example.test/render/b50.png", {
                    method: "OPTIONS",
                }),
                env,
            });

            expect(response.status).toBe(204);
            expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
            expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS");
            expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
                "Content-Type, Authorization, Accept, Origin, X-Requested-With"
            );
            expect(response.headers.get("Access-Control-Max-Age")).toBe("86400");
        });

        it("returns CORS headers on GET health check", async () => {
            const response = await handleRenderRequest({
                request: new Request("https://render.example.test/health"),
                env,
            });

            expect(response.status).toBe(200);
            expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
            expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS");
        });

        it("returns CORS headers on request failure (400 Bad Request)", async () => {
            const response = await handleRenderRequest({
                request: new Request("https://render.example.test/render/b50.png", {
                    method: "POST",
                    body: "invalid-json",
                }),
                env,
            });

            expect(response.status).toBe(400);
            expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
        });

        it("returns CORS headers on uncaught handler errors (500 Internal Server Error)", async () => {
            // Mocking context/env behavior to throw by passing invalid request/url
            const response = await handleRenderRequest({
                request: {
                    get url() {
                        throw new Error("Simulated URL parsing error");
                    },
                    get method() {
                        return "GET";
                    },
                } as unknown as Request,
                env,
            });

            expect(response.status).toBe(500);
            expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
            await expect(response.json()).resolves.toMatchObject({
                error: "Internal Server Error: Simulated URL parsing error",
            });
        });
    });
});

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
