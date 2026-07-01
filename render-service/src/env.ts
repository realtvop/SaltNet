export interface RenderEnv {
    RENDER_IMAGE_CACHE_SECONDS?: string;
    ASSETS?: Fetcher;
}

export function getImageCacheSeconds(env: RenderEnv): number {
    return parsePositiveInteger(env.RENDER_IMAGE_CACHE_SECONDS, 600);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
