export interface RenderEnv {
    RENDER_REDIS_REST_URL?: string;
    RENDER_REDIS_REST_TOKEN?: string;
    RENDER_PAYLOAD_TTL_SECONDS?: string;
    RENDER_IMAGE_CACHE_SECONDS?: string;
}

export function getTtlSeconds(env: RenderEnv): number {
    return parsePositiveInteger(env.RENDER_PAYLOAD_TTL_SECONDS, 3600);
}

export function getImageCacheSeconds(env: RenderEnv): number {
    return parsePositiveInteger(env.RENDER_IMAGE_CACHE_SECONDS, 600);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
