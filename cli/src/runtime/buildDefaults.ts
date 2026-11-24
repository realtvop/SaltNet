/**
 * Defaults compiled into the bundle from the web app's `.env` files (see build-defaults.mjs).
 * An empty string means the build had no value for that setting.
 */
export interface BuildDefaults {
    /** SaltNet backend, primary address. */
    apiUrl: string;
    /** SaltNet backend, fallback address. */
    apiFallbackUrl: string;
    /** B50 image render service. */
    renderUrl: string;
    /** LXNS OAuth client id. */
    lxnsClientId: string;
    /** LXNS OAuth redirect URI. */
    lxnsRedirectUri: string;
}

const EMPTY_BUILD_DEFAULTS: Readonly<BuildDefaults> = {
    apiUrl: "",
    apiFallbackUrl: "",
    renderUrl: "",
    lxnsClientId: "",
    lxnsRedirectUri: "",
};

/** The defaults of this build, or empty ones when the sources run unbundled (Vitest). */
export function getBuildDefaults(): BuildDefaults {
    if (typeof __SALTNET_BUILD_DEFAULTS__ === "object" && __SALTNET_BUILD_DEFAULTS__ !== null) {
        return { ...EMPTY_BUILD_DEFAULTS, ...__SALTNET_BUILD_DEFAULTS__ };
    }
    return { ...EMPTY_BUILD_DEFAULTS };
}
