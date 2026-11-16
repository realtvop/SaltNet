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
    /** The OAuth client id of the LXNS application; it has no usable default, so callers that talk to the token endpoint pass it. */
    lxnsClientId: string;
    /** Diving Fish prober API base, for example `https://www.diving-fish.com/api/maimaidxprober`. */
    divingFishBaseUrl: string;
    /** SaltNet backend, primary address. */
    saltnetApiUrl: string;
    /** SaltNet backend, address used when the primary one fails. */
    saltnetApiFallbackUrl: string;
}

export const DEFAULT_CORE_CONFIG: Readonly<CoreConfig> = {
    saltMetaUrl: SALTMETA_NEXT_COMPACTED_URL,
    lxnsBaseUrl: "https://maimai.lxns.net",
    lxnsClientId: "",
    divingFishBaseUrl: "https://www.diving-fish.com/api/maimaidxprober",
    saltnetApiUrl: "",
    saltnetApiFallbackUrl: "",
};

/** Fills every field the caller left out with its default. */
export function resolveCoreConfig(overrides: Partial<CoreConfig> = {}): CoreConfig {
    return {
        saltMetaUrl: overrides.saltMetaUrl ?? DEFAULT_CORE_CONFIG.saltMetaUrl,
        lxnsBaseUrl: overrides.lxnsBaseUrl ?? DEFAULT_CORE_CONFIG.lxnsBaseUrl,
        lxnsClientId: overrides.lxnsClientId ?? DEFAULT_CORE_CONFIG.lxnsClientId,
        divingFishBaseUrl: overrides.divingFishBaseUrl ?? DEFAULT_CORE_CONFIG.divingFishBaseUrl,
        saltnetApiUrl: overrides.saltnetApiUrl ?? DEFAULT_CORE_CONFIG.saltnetApiUrl,
        saltnetApiFallbackUrl:
            overrides.saltnetApiFallbackUrl ?? DEFAULT_CORE_CONFIG.saltnetApiFallbackUrl,
    };
}
