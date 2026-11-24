import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV_FILES, ENV_KEYS, readBuildDefaults } from "../../build-defaults.mjs";
import { getBuildDefaults } from "../../src/runtime/buildDefaults";

// Fake deployment values: the real ones are never read or printed by the tests.
function repoWith(files: Record<string, string>): string {
    const dir = mkdtempSync(path.join(tmpdir(), "saltnet-build-defaults-"));
    for (const [name, content] of Object.entries(files))
        writeFileSync(path.join(dir, name), content);
    return dir;
}

describe("readBuildDefaults", () => {
    it("reads the five values the web app defines", () => {
        const dir = repoWith({
            ".env": [
                "VITE_API_URL=https://api.example.test",
                "VITE_API_FALLBACK_URL=https://backup.example.test",
                "VITE_TAKUMI_RENDERER_URL=https://render.example.test/api",
                "VITE_LXNS_OAUTH_CLIENT_ID=client-id",
                "VITE_LXNS_OAUTH_REDIRECT_URI=https://app.example.test/callback",
                "VITE_DB_URL=https://db.example.test",
            ].join("\n"),
        });
        expect(readBuildDefaults(dir)).toEqual({
            apiUrl: "https://api.example.test",
            apiFallbackUrl: "https://backup.example.test",
            renderUrl: "https://render.example.test/api",
            lxnsClientId: "client-id",
            lxnsRedirectUri: "https://app.example.test/callback",
        });
    });

    it("accepts spaces around the equals sign and quotes, as the web app's .env does", () => {
        const dir = repoWith({
            ".env": [
                "VITE_API_URL = https://api.example.test",
                "VITE_LXNS_OAUTH_CLIENT_ID = 'quoted'",
            ].join("\n"),
        });
        const defaults = readBuildDefaults(dir);
        expect(defaults.apiUrl).toBe("https://api.example.test");
        expect(defaults.lxnsClientId).toBe("quoted");
    });

    it("lets later files win, in the order Vite loads them", () => {
        expect(ENV_FILES).toEqual([
            ".env",
            ".env.local",
            ".env.production",
            ".env.production.local",
        ]);
        const dir = repoWith({
            ".env": "VITE_API_URL=from-env\nVITE_TAKUMI_RENDERER_URL=render-env",
            ".env.local": "VITE_API_URL=from-local\nVITE_TAKUMI_RENDERER_URL=render-local",
            ".env.production": "VITE_API_URL=from-production",
            ".env.production.local": "VITE_LXNS_OAUTH_CLIENT_ID=only-here",
        });
        expect(readBuildDefaults(dir)).toMatchObject({
            apiUrl: "from-production",
            renderUrl: "render-local",
            lxnsClientId: "only-here",
        });
    });

    it("lets the build process's own environment win over every file", () => {
        const dir = repoWith({ ".env": "VITE_API_URL=from-file" });
        const defaults = readBuildDefaults(dir, { VITE_API_URL: "from-process" });
        expect(defaults.apiUrl).toBe("from-process");
    });

    it("returns empty strings for what is not defined, and when there are no files at all", () => {
        const empty = Object.fromEntries(Object.keys(ENV_KEYS).map(field => [field, ""]));
        expect(readBuildDefaults(repoWith({}))).toEqual(empty);
        expect(readBuildDefaults(repoWith({ ".env": "OTHER=1" }))).toEqual(empty);
    });
});

describe("getBuildDefaults", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("is empty when the sources run unbundled", () => {
        expect(getBuildDefaults()).toEqual({
            apiUrl: "",
            apiFallbackUrl: "",
            renderUrl: "",
            lxnsClientId: "",
            lxnsRedirectUri: "",
        });
    });

    it("returns what the bundle was built with, filling in anything missing", () => {
        vi.stubGlobal("__SALTNET_BUILD_DEFAULTS__", { apiUrl: "https://api.example.test" });
        expect(getBuildDefaults()).toEqual({
            apiUrl: "https://api.example.test",
            apiFallbackUrl: "",
            renderUrl: "",
            lxnsClientId: "",
            lxnsRedirectUri: "",
        });
    });
});
