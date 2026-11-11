import type { BuildDefaults } from "../../src/runtime/buildDefaults";
import { DEFAULT_CORE_CONFIG } from "@core/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFIG_DEFINITIONS, resolveConfig } from "../../src/runtime/config";
import { settingRow, settingRows } from "../../src/runtime/configRows";

const noBuild: BuildDefaults = {
    apiUrl: "",
    apiFallbackUrl: "",
    renderUrl: "",
    lxnsClientId: "",
    lxnsRedirectUri: "",
};

const EXPECTED_TABLE = [
    {
        key: "api.url",
        default: "",
        env: "SALTNET_API_URL",
        type: "http 或 https 地址（可以留空）",
    },
    {
        key: "api.fallbackUrl",
        default: "",
        env: "SALTNET_API_FALLBACK_URL",
        type: "http 或 https 地址（可以留空）",
    },
    {
        key: "render.url",
        default: "",
        env: "SALTNET_RENDER_URL",
        type: "http 或 https 地址（可以留空）",
    },
    {
        key: "saltmeta.url",
        default: DEFAULT_CORE_CONFIG.saltMetaUrl,
        env: "SALTNET_SALTMETA_URL",
        type: "http 或 https 地址",
    },
    {
        key: "lxns.baseUrl",
        default: DEFAULT_CORE_CONFIG.lxnsBaseUrl,
        env: "SALTNET_LXNS_BASE_URL",
        type: "http 或 https 地址",
    },
    {
        key: "lxns.clientId",
        default: "",
        env: "SALTNET_LXNS_CLIENT_ID",
        type: "文字（可以留空）",
    },
    {
        key: "lxns.redirectUri",
        default: "",
        env: "SALTNET_LXNS_REDIRECT_URI",
        type: "http 或 https 地址（可以留空）",
    },
    {
        key: "lxns.refreshTokenDays",
        default: 30,
        env: "SALTNET_LXNS_REFRESH_TOKEN_DAYS",
        type: "1 到 3650 的整数",
    },
    {
        key: "lxns.expiringWarnDays",
        default: 3,
        env: "SALTNET_LXNS_EXPIRING_WARN_DAYS",
        type: "0 到 3650 的整数",
    },
    {
        key: "metadata.maxAgeHours",
        default: 24,
        env: "SALTNET_METADATA_MAX_AGE_HOURS",
        type: "0 到 8760 的数字",
    },
    {
        key: "metadata.timeoutMs",
        default: 8000,
        env: "SALTNET_METADATA_TIMEOUT_MS",
        type: "100 到 600000 的整数",
    },
    {
        key: "scores.staleDays",
        default: 3,
        env: "SALTNET_SCORES_STALE_DAYS",
        type: "0 到 3650 的数字",
    },
    {
        key: "network.timeoutMs",
        default: 15000,
        env: "SALTNET_NETWORK_TIMEOUT_MS",
        type: "100 到 600000 的整数",
    },
    {
        key: "network.updateTimeoutMs",
        default: 120000,
        env: "SALTNET_NETWORK_UPDATE_TIMEOUT_MS",
        type: "1000 到 3600000 的整数",
    },
    {
        key: "network.userAgent",
        default: "saltnet-cli/9.9.9",
        env: "SALTNET_NETWORK_USER_AGENT",
        type: "非空文字",
    },
    {
        key: "output.format",
        default: "json",
        env: "SALTNET_OUTPUT_FORMAT",
        type: "json 或 text",
    },
    {
        key: "sync.qrOtherAccount",
        default: "rewrite",
        env: "SALTNET_SYNC_QR_OTHER_ACCOUNT",
        type: "rewrite 或 error",
    },
] as const;

describe("settingRows", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("returns 17 rows with keys in table order and row keys in order", () => {
        const config = resolveConfig({ env: {}, buildDefaults: noBuild, version: "9.9.9" });
        const rows = settingRows(config, "9.9.9");

        expect(rows).toHaveLength(17);
        expect(rows.map(r => r.key)).toEqual(EXPECTED_TABLE.map(t => t.key));

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const expected = EXPECTED_TABLE[i];

            expect(Object.keys(row)).toEqual([
                "key",
                "value",
                "source",
                "default",
                "env",
                "type",
                "description",
            ]);
            expect(row.env).toBe(expected.env);
            expect(row.type).toBe(expected.type);
            expect(row.default).toBe(expected.default);
            expect(row.source).toBe("default");
            expect(row.value).toBe(expected.default);
            expect(row.description.length).toBeGreaterThan(0);
        }
    });

    it("handles env, file, and build sources in the same config", () => {
        vi.stubGlobal("__SALTNET_BUILD_DEFAULTS__", {
            ...noBuild,
            apiUrl: "https://api.example.test/",
        });

        const config = resolveConfig({
            env: { SALTNET_METADATA_MAX_AGE_HOURS: "10" },
            file: { scores: { staleDays: 5 } },
            buildDefaults: { ...noBuild, apiUrl: "https://api.example.test/" },
            version: "9.9.9",
        });

        const rows = settingRows(config, "9.9.9");
        const byKey = new Map(rows.map(r => [r.key, r]));

        const apiUrl = byKey.get("api.url")!;
        expect(apiUrl.value).toBe("https://api.example.test");
        expect(apiUrl.source).toBe("build");
        expect(apiUrl.default).toBe("https://api.example.test");

        const maxAge = byKey.get("metadata.maxAgeHours")!;
        expect(maxAge.value).toBe(10);
        expect(maxAge.source).toBe("env");
        expect(maxAge.default).toBe(24);

        const staleDays = byKey.get("scores.staleDays")!;
        expect(staleDays.value).toBe(5);
        expect(staleDays.source).toBe("file");
        expect(staleDays.default).toBe(3);
    });

    it("retains the built-in default for default when a setting is overridden in file", () => {
        const config = resolveConfig({
            env: {},
            file: { metadata: { maxAgeHours: 12 } },
            buildDefaults: noBuild,
            version: "9.9.9",
        });

        const rows = settingRows(config, "9.9.9");
        const maxAge = rows.find(r => r.key === "metadata.maxAgeHours")!;
        expect(maxAge.value).toBe(12);
        expect(maxAge.source).toBe("file");
        expect(maxAge.default).toBe(24);
    });

    it("settingRow respects version for network.userAgent default and value", () => {
        const config = resolveConfig({
            env: {},
            buildDefaults: noBuild,
            version: "1.2.3",
        });
        const definition = CONFIG_DEFINITIONS.find(d => d.key === "network.userAgent")!;
        const row = settingRow(definition, config, "1.2.3");

        expect(row.value).toBe("saltnet-cli/1.2.3");
        expect(row.default).toBe("saltnet-cli/1.2.3");
        expect(row.source).toBe("default");
    });
});
