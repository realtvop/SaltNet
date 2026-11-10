import { SALTMETA_NEXT_COMPACTED_URL } from "./music/saltmeta";

/**
 * Deployment-specific values that shared/core must not read from the environment itself. The web
 * app relies on the defaults; the CLI overrides them from `config.json` or environment variables.
 * New fields are added here as the integrations that need them move into shared/core.
 */
export interface CoreConfig {
    /** Compacted SaltMeta metadata document. */
    saltMetaUrl: string;
    /** Origin of the LXNS (落雪) service, for example `https://maimai.lxns.net`. */
    lxnsBaseUrl: string;
}

export const DEFAULT_CORE_CONFIG: Readonly<CoreConfig> = {
    saltMetaUrl: SALTMETA_NEXT_COMPACTED_URL,
    lxnsBaseUrl: "https://maimai.lxns.net",
};

/** Fills every field the caller left out with its default. */
export function resolveCoreConfig(overrides: Partial<CoreConfig> = {}): CoreConfig {
    return {
        saltMetaUrl: overrides.saltMetaUrl ?? DEFAULT_CORE_CONFIG.saltMetaUrl,
        lxnsBaseUrl: overrides.lxnsBaseUrl ?? DEFAULT_CORE_CONFIG.lxnsBaseUrl,
    };
}
