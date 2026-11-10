// Reads the defaults that build.mjs compiles into the bundle from the web app's `.env` files.
//
// The CLI shares the web app's deployment values (backend addresses, render service, LXNS client)
// so that both are configured in one place. The values are never printed: callers only get them
// back as an object that is embedded in the bundle.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/** The env files Vite loads for a production build, lowest priority first. */
export const ENV_FILES = [".env", ".env.local", ".env.production", ".env.production.local"];

/** Maps each build default to the web app's variable that provides it. */
export const ENV_KEYS = {
    apiUrl: "VITE_API_URL",
    apiFallbackUrl: "VITE_API_FALLBACK_URL",
    renderUrl: "VITE_TAKUMI_RENDERER_URL",
    lxnsClientId: "VITE_LXNS_OAUTH_CLIENT_ID",
    lxnsRedirectUri: "VITE_LXNS_OAUTH_REDIRECT_URI",
};

/**
 * @param {string} repoRoot directory that holds the `.env` files
 * @param {Record<string, string | undefined>} [processEnv] variables of the build process itself;
 *   like Vite, they win over every file
 * @returns {import("./src/runtime/buildDefaults").BuildDefaults} the values to compile in; an
 *   empty string stands for a variable that none of the sources defines
 */
export function readBuildDefaults(repoRoot, processEnv = {}) {
    const fromFiles = {};
    for (const name of ENV_FILES) {
        const file = path.join(repoRoot, name);
        if (existsSync(file)) Object.assign(fromFiles, parseEnv(readFileSync(file, "utf8")));
    }

    const defaults = {};
    for (const [field, variable] of Object.entries(ENV_KEYS)) {
        defaults[field] = (processEnv[variable] ?? fromFiles[variable] ?? "").trim();
    }
    return defaults;
}
