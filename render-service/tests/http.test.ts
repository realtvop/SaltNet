import { describe, expect, it } from "vitest";
import { handleRenderRequest } from "../src/http";
import type { RenderEnv } from "../src/env";
import type { B50RenderPayload } from "../src/payload";

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
