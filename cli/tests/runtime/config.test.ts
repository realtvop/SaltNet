import type { BuildDefaults } from "../../src/runtime/buildDefaults";
import type { ConfigValue, ConfigValues } from "../../src/runtime/config";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_CORE_CONFIG } from "@core/config";
import { describe, expect, it } from "vitest";
import {
    CONFIG_DEFINITIONS,
    configEnvName,
    findConfigDefinition,
    loadConfig,
    parseConfigText,
    readConfigFile,
    resolveConfig,
    toCoreConfig,
} from "../../src/runtime/config";

// Fake deployment values: the real ones are never read or printed by the tests.
const build: BuildDefaults = {
    apiUrl: "https://api.example.test/",
    apiFallbackUrl: "https://backup.example.test",
    renderUrl: "https://render.example.test/api/",
    lxnsClientId: "build-client",
    lxnsRedirectUri: "https://app.example.test/callback",
};
const noBuild: BuildDefaults = {
    apiUrl: "",
    apiFallbackUrl: "",
    renderUrl: "",
    lxnsClientId: "",
    lxnsRedirectUri: "",
};

function flatten(values: ConfigValues): Record<string, ConfigValue> {
    const flat: Record<string, ConfigValue> = {};
    for (const [group, entries] of Object.entries(values)) {
        for (const [name, value] of Object.entries(entries as Record<string, ConfigValue>)) {
            flat[`${group}.${name}`] = value;
        }
    }
    return flat;
}

function resolve(input: Parameters<typeof resolveConfig>[0] = {}) {
    return resolveConfig({ env: {}, buildDefaults: noBuild, version: "9.9.9", ...input });
}

describe("settings table", () => {
    it("covers every setting exactly once, with a description", () => {
        const keys = CONFIG_DEFINITIONS.map(definition => definition.key);
        expect(new Set(keys).size).toBe(keys.length);
        expect(Object.keys(flatten(resolve().values)).sort()).toEqual([...keys].sort());
        for (const definition of CONFIG_DEFINITIONS) {
            expect(definition.description.length).toBeGreaterThan(0);
        }
    });

    it("derives an environment variable name from each key", () => {
        expect(configEnvName("api.url")).toBe("SALTNET_API_URL");
        expect(configEnvName("api.fallbackUrl")).toBe("SALTNET_API_FALLBACK_URL");
        expect(configEnvName("lxns.clientId")).toBe("SALTNET_LXNS_CLIENT_ID");
        expect(configEnvName("metadata.maxAgeHours")).toBe("SALTNET_METADATA_MAX_AGE_HOURS");
        expect(configEnvName("sync.qrOtherAccount")).toBe("SALTNET_SYNC_QR_OTHER_ACCOUNT");

        const names = CONFIG_DEFINITIONS.map(definition => configEnvName(definition.key));
        expect(new Set(names).size).toBe(names.length);
        // SALTNET_HOME names the data directory and must never be taken for a setting.
        expect(names).not.toContain("SALTNET_HOME");
    });

    it("finds a definition by its dotted key", () => {
        expect(findConfigDefinition("lxns.clientId")?.key).toBe("lxns.clientId");
        expect(findConfigDefinition("lxns")).toBeUndefined();
        expect(findConfigDefinition("__proto__.x")).toBeUndefined();
    });
});

describe("resolveConfig defaults", () => {
    it("uses the built-in defaults when nothing else is set", () => {
        const { values, sources, problems } = resolve();
        expect(problems).toEqual([]);
        expect(values).toEqual({
            api: { url: "", fallbackUrl: "" },
            render: { url: "" },
            saltmeta: { url: DEFAULT_CORE_CONFIG.saltMetaUrl },
            lxns: {
                baseUrl: DEFAULT_CORE_CONFIG.lxnsBaseUrl,
                clientId: "",
                redirectUri: "",
                refreshTokenDays: 30,
                expiringWarnDays: 3,
            },
            metadata: { maxAgeHours: 24, timeoutMs: 8000 },
            scores: { staleDays: 3 },
            network: { timeoutMs: 15000, updateTimeoutMs: 120000, userAgent: "saltnet-cli/9.9.9" },
            output: { format: "json" },
            sync: { qrOtherAccount: "rewrite" },
        });
        expect(new Set(Object.values(sources))).toEqual(new Set(["default"]));
    });

    it("takes the deployment values from the build, without trailing slashes", () => {
        const { values, sources } = resolve({ buildDefaults: build });
        expect(values.api).toEqual({
            url: "https://api.example.test",
            fallbackUrl: "https://backup.example.test",
        });
        expect(values.render.url).toBe("https://render.example.test/api");
        expect(values.lxns.clientId).toBe("build-client");
        // The redirect URI has to match the registered one exactly, so it is kept as written.
        expect(values.lxns.redirectUri).toBe("https://app.example.test/callback");
        expect(sources["api.url"]).toBe("build");
        expect(sources["lxns.clientId"]).toBe("build");
        expect(sources["saltmeta.url"]).toBe("default");
    });

    it("reports a build value that is missing as an unset default, not a build value", () => {
        const { sources } = resolve({ buildDefaults: { ...build, apiFallbackUrl: "" } });
        expect(sources["api.fallbackUrl"]).toBe("default");
        expect(sources["api.url"]).toBe("build");
    });

    it("hands shared/core the two addresses it takes", () => {
        const { values } = resolve({
            file: { saltmeta: { url: "https://meta.example.test/m.json" } },
        });
        expect(toCoreConfig(values)).toEqual({
            saltMetaUrl: "https://meta.example.test/m.json",
            lxnsBaseUrl: DEFAULT_CORE_CONFIG.lxnsBaseUrl,
        });
    });
});

describe("resolveConfig layers", () => {
    it("lets config.json beat the build, and an environment variable beat both", () => {
        const file = {
            api: { url: "https://file.example.test" },
            lxns: { clientId: "file-client" },
        };
        const env = { SALTNET_LXNS_CLIENT_ID: "env-client" };
        const { values, sources, problems } = resolve({ buildDefaults: build, file, env });
        expect(problems).toEqual([]);
        expect(values.api.url).toBe("https://file.example.test");
        expect(sources["api.url"]).toBe("file");
        expect(values.lxns.clientId).toBe("env-client");
        expect(sources["lxns.clientId"]).toBe("env");
        // Not overridden anywhere: still the build's value.
        expect(values.render.url).toBe("https://render.example.test/api");
        expect(sources["render.url"]).toBe("build");
    });

    it("reads typed values from the file and text values from the environment", () => {
        const { values } = resolve({
            file: { metadata: { maxAgeHours: 6.5, timeoutMs: 2000 }, output: { format: "TEXT" } },
            env: { SALTNET_SCORES_STALE_DAYS: "0.5", SALTNET_SYNC_QR_OTHER_ACCOUNT: "Error" },
        });
        expect(values.metadata).toEqual({ maxAgeHours: 6.5, timeoutMs: 2000 });
        expect(values.output.format).toBe("text");
        expect(values.scores.staleDays).toBe(0.5);
        expect(values.sync.qrOtherAccount).toBe("error");
    });

    it("accepts zero for the metadata age, meaning refresh every time", () => {
        const { values, problems } = resolve({ env: { SALTNET_METADATA_MAX_AGE_HOURS: "0" } });
        expect(problems).toEqual([]);
        expect(values.metadata.maxAgeHours).toBe(0);
    });

    it("lets an empty environment variable clear a setting that may be empty", () => {
        const { values, sources } = resolve({
            buildDefaults: build,
            env: { SALTNET_API_FALLBACK_URL: "", SALTNET_LXNS_CLIENT_ID: "  " },
        });
        expect(values.api.fallbackUrl).toBe("");
        expect(sources["api.fallbackUrl"]).toBe("env");
        expect(values.lxns.clientId).toBe("");
        expect(sources["lxns.clientId"]).toBe("env");
    });

    it("ignores an empty environment variable for a setting that must not be empty", () => {
        const { values, sources, problems } = resolve({
            env: {
                SALTNET_SALTMETA_URL: "",
                SALTNET_NETWORK_USER_AGENT: " ",
                SALTNET_OUTPUT_FORMAT: "",
            },
        });
        expect(problems).toEqual([]);
        expect(values.saltmeta.url).toBe(DEFAULT_CORE_CONFIG.saltMetaUrl);
        expect(sources["saltmeta.url"]).toBe("default");
        expect(values.output.format).toBe("json");
    });

    it("ignores variables that are not settings", () => {
        const { problems } = resolve({
            env: { SALTNET_HOME: "/somewhere", SALTNET_UNKNOWN: "1", PATH: "/usr/bin" },
        });
        expect(problems).toEqual([]);
    });
});

describe("resolveConfig problems", () => {
    it("skips an invalid file value, uses the next layer and says what is wrong", () => {
        const { values, sources, problems } = resolve({
            buildDefaults: build,
            file: {
                lxns: { refreshTokenDays: 0, clientId: 42, redirectUri: "not a url" },
                metadata: { maxAgeHours: -1, timeoutMs: 1.5 },
                output: { format: "xml" },
            },
        });
        expect(values.lxns.refreshTokenDays).toBe(30);
        expect(values.lxns.clientId).toBe("build-client");
        expect(sources["lxns.clientId"]).toBe("build");
        expect(values.output.format).toBe("json");
        expect(problems.map(problem => [problem.severity, problem.source, problem.key])).toEqual([
            ["error", "file", "lxns.refreshTokenDays"],
            ["error", "file", "lxns.clientId"],
            ["error", "file", "lxns.redirectUri"],
            ["error", "file", "metadata.maxAgeHours"],
            ["error", "file", "metadata.timeoutMs"],
            ["error", "file", "output.format"],
        ]);
        expect(problems[0].message).toBe(
            "config.json 里的 lxns.refreshTokenDays 应该是1 到 3650 的整数（现在是 0）"
        );
        expect(problems[5].message).toBe(
            `config.json 里的 output.format 应该是json 或 text（现在是 ${JSON.stringify("xml")}）`
        );
    });

    it("skips an invalid environment variable and names it", () => {
        const { values, problems } = resolve({
            file: { network: { timeoutMs: 20000 } },
            env: {
                SALTNET_NETWORK_TIMEOUT_MS: "soon",
                SALTNET_LXNS_REFRESH_TOKEN_DAYS: "1e3",
                SALTNET_API_URL: "ftp://files.example.test",
                SALTNET_OUTPUT_FORMAT: "tsv",
            },
        });
        // Falls back to the file, then to the default.
        expect(values.network.timeoutMs).toBe(20000);
        expect(values.lxns.refreshTokenDays).toBe(30);
        expect(values.api.url).toBe("");
        expect(values.output.format).toBe("json");
        expect(problems.map(problem => problem.key)).toEqual([
            "api.url",
            "lxns.refreshTokenDays",
            "network.timeoutMs",
            "output.format",
        ]);
        expect(problems.every(problem => problem.severity === "error")).toBe(true);
        expect(problems.every(problem => problem.source === "env")).toBe(true);
        expect(problems[0].message).toMatch(/^环境变量 SALTNET_API_URL /);
    });

    it("rejects numbers that are not finite, not whole or out of range", () => {
        const definition = findConfigDefinition("network.timeoutMs")!;
        const bad = ["NaN", "Infinity", "-1", "99", "600001", "1500.5", "0x10", "1_000", ""];
        for (const text of bad) {
            expect(parseConfigText(definition, text).ok, text).toBe(false);
        }
        expect(parseConfigText(definition, " 1500 ")).toEqual({ ok: true, value: 1500 });
    });

    it("does not quote an address or text back in a message", () => {
        // Valid as a URL, but not http(s), so every use of it below is rejected.
        const secret = "ftp://user:hunter2@example.test/files";
        const { problems } = resolve({
            file: { api: { url: secret }, lxns: { clientId: 7 } },
            env: { SALTNET_RENDER_URL: secret, SALTNET_SALTMETA_URL: secret },
        });
        expect(problems.length).toBe(4);
        expect(JSON.stringify(problems)).not.toContain("hunter2");
    });

    it("warns about a setting it does not know and keeps going", () => {
        const { values, problems } = resolve({
            file: { lxns: { clientID: "typo", clientId: "right" }, telemetry: { on: true } },
        });
        expect(values.lxns.clientId).toBe("right");
        expect(problems).toEqual([
            {
                severity: "warning",
                source: "file",
                key: "lxns.clientID",
                message: "config.json 里有不认识的设置 lxns.clientID，已忽略",
            },
            {
                severity: "warning",
                source: "file",
                key: "telemetry",
                message: "config.json 里有不认识的设置 telemetry，已忽略",
            },
        ]);
    });

    it("reports a group that is not an object, and a file that is not an object", () => {
        const group = resolve({ file: { lxns: "abc", api: [] } });
        expect(group.problems.map(problem => [problem.severity, problem.key])).toEqual([
            ["error", "lxns"],
            ["error", "api"],
        ]);
        for (const file of [[], "text", 3, null]) {
            const { problems, values } = resolve({ file });
            expect(problems).toEqual([
                {
                    severity: "error",
                    source: "file",
                    key: "",
                    message: "config.json 的内容必须是 JSON 对象",
                },
            ]);
            expect(values.metadata.maxAgeHours).toBe(24);
        }
    });

    it("is not fooled by keys that exist on every object", () => {
        // A computed key makes `__proto__` an own property, as JSON.parse does for a file.
        const file = { ["__proto__"]: { polluted: true }, constructor: { x: 1 } };
        const { problems } = resolve({ file });
        expect(problems.map(problem => problem.key)).toEqual(["__proto__", "constructor"]);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it("passes on the problems found while reading the file", () => {
        const { problems } = resolve({
            fileProblems: [{ severity: "error", source: "file", key: "", message: "坏了" }],
        });
        expect(problems.map(problem => problem.message)).toEqual(["坏了"]);
    });
});

describe("readConfigFile and loadConfig", () => {
    function homeWith(config?: string): { config: string } {
        const home = mkdtempSync(path.join(tmpdir(), "saltnet-config-"));
        const file = path.join(home, "config.json");
        if (config !== undefined) writeFileSync(file, config);
        return { config: file };
    }

    it("treats a missing or empty file as no configuration", () => {
        expect(readConfigFile(homeWith().config)).toEqual({ data: undefined, problems: [] });
        expect(readConfigFile(homeWith("  \n").config)).toEqual({ data: undefined, problems: [] });
        expect(loadConfig(homeWith(), { env: {}, buildDefaults: noBuild }).problems).toEqual([]);
    });

    it("loads settings from the file in the data directory", () => {
        const paths = homeWith(
            `${JSON.stringify({ metadata: { maxAgeHours: 12 }, lxns: { clientId: "c" } })}\n`
        );
        const { values, sources, problems } = loadConfig(paths, {
            env: {},
            buildDefaults: noBuild,
        });
        expect(problems).toEqual([]);
        expect(values.metadata.maxAgeHours).toBe(12);
        expect(sources["metadata.maxAgeHours"]).toBe("file");
        expect(values.lxns.clientId).toBe("c");
    });

    it("skips a byte order mark", () => {
        const paths = homeWith(
            String.fromCharCode(65279) + JSON.stringify({ scores: { staleDays: 7 } })
        );
        expect(loadConfig(paths, { env: {}, buildDefaults: noBuild }).values.scores.staleDays).toBe(
            7
        );
    });

    it("reports a malformed file without quoting it, and still resolves the rest", () => {
        // Not JSON (the keys are not quoted); the value must not show up in the message.
        const paths = homeWith("{ lxns: secret-looking-value }");
        const result = loadConfig(paths, { env: {}, buildDefaults: build });
        expect(result.problems).toEqual([
            { severity: "error", source: "file", key: "", message: "config.json 不是合法的 JSON" },
        ]);
        expect(JSON.stringify(result.problems)).not.toContain("secret-looking-value");
        expect(result.values.lxns.clientId).toBe("build-client");
    });

    it("reports a file that cannot be read instead of throwing", () => {
        const home = mkdtempSync(path.join(tmpdir(), "saltnet-config-"));
        const asDirectory = path.join(home, "config.json");
        mkdirSync(asDirectory);
        const { data, problems } = readConfigFile(asDirectory);
        expect(data).toBeUndefined();
        expect(problems).toEqual([
            {
                severity: "error",
                source: "file",
                key: "",
                message: "无法读取 config.json（EISDIR）",
            },
        ]);
    });
});
