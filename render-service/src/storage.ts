import type { RenderEnv } from "./env";

interface UpstashResponse<T> {
    result?: T;
    error?: string;
}

export class RenderPayloadStore {
    constructor(private readonly env: RenderEnv) {}

    async set(key: string, value: string, ttlSeconds: number): Promise<void> {
        await this.command<"OK">(["SET", key, value, "EX", ttlSeconds]);
    }

    async get(key: string): Promise<string | null> {
        return this.command<string | null>(["GET", key]);
    }

    private async command<T>(command: unknown[]): Promise<T> {
        const url = this.env.RENDER_REDIS_REST_URL;
        const token = this.env.RENDER_REDIS_REST_TOKEN;
        if (!url || !token) {
            throw new Error("Redis REST environment is not configured");
        }

        const response = await fetch(url, {
            method: "POST",
            headers: {
                authorization: `Bearer ${token}`,
                "content-type": "application/json",
            },
            body: JSON.stringify(command),
        });

        if (!response.ok) {
            throw new Error(`Redis REST request failed: ${response.status}`);
        }

        const data = (await response.json()) as UpstashResponse<T>;
        if (data.error) throw new Error(data.error);
        return data.result as T;
    }
}

export function createRenderId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(36).padStart(2, "0")).join("");
}

export function getPayloadKey(id: string): string {
    return `saltnet_render_b50:${id}`;
}

export function isValidRenderId(id: string): boolean {
    return /^[a-z0-9]{32,64}$/.test(id);
}
