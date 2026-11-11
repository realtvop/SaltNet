import type { ConfigSource, ConfigValue } from "../../src/runtime/config";
import type { PrintedOutput } from "../commandRun";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import process from "node:process";
import { DEFAULT_CORE_CONFIG } from "@core/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFIG_DEFINITIONS } from "../../src/runtime/config";
import { commandIn, LXNS_URL, META_URL } from "../commandRun";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

interface SettingRowOutput {
    key: string;
    value: ConfigValue;
    source: ConfigSource;
    default: ConfigValue;
    env: string;
    type: string;
    description: string;
}

interface ConfigSetOutputRow extends SettingRowOutput {
    changed: boolean;
}

interface ConfigListOutput extends Omit<PrintedOutput, "data" | "meta"> {
    data: {
        file: string;
        items: SettingRowOutput[];
        problems: { severity: string; source: string; key: string; message: string }[];
    };
    meta: {
        page: { total: number; offset: number; limit: number; nextOffset: number | null };
    };
}

interface ConfigGetOutput extends Omit<PrintedOutput, "data"> {
    data: SettingRowOutput;
}

interface ConfigSetOutput extends Omit<PrintedOutput, "data"> {
    data: ConfigSetOutputRow;
}

interface Printed<Output> {
    code: number;
    json: Output;
    stdout: string;
    requests: { url: string }[];
}

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

async function configListIn(
    paths: ReturnType<typeof makeHome>,
    args: string[] = [],
    options?: Parameters<typeof commandIn>[3]
) {
    const res = await commandIn(paths, "config", ["list", ...args], options);
    return res as unknown as Printed<ConfigListOutput>;
}

async function configGetIn(
    paths: ReturnType<typeof makeHome>,
    args: string[] = [],
    options?: Parameters<typeof commandIn>[3]
) {
    const res = await commandIn(paths, "config", ["get", ...args], options);
    return res as unknown as Printed<ConfigGetOutput>;
}

async function configSetIn(
    paths: ReturnType<typeof makeHome>,
    args: string[] = [],
    options?: Parameters<typeof commandIn>[3]
) {
    const res = await commandIn(paths, "config", ["set", ...args], options);
    return res as unknown as Printed<ConfigSetOutput>;
}

async function configUnsetIn(
    paths: ReturnType<typeof makeHome>,
    args: string[] = [],
    options?: Parameters<typeof commandIn>[3]
) {
    const res = await commandIn(paths, "config", ["unset", ...args], options);
    return res as unknown as Printed<ConfigSetOutput>;
}

describe("config command", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe("config list", () => {
        it("lists 17 settings in table order with default source when env vars are unset", async () => {
            const paths = makeHome();
            const res = await configListIn(paths, [], {
                env: {
                    SALTNET_SALTMETA_URL: undefined,
                    SALTNET_LXNS_BASE_URL: undefined,
                },
            });

            expect(res.code).toBe(0);
            expect(res.requests).toEqual([]);
            expect(res.json.data.file).toBe(paths.config);
            expect(res.json.data.problems).toEqual([]);
            expect(res.json.meta.page).toEqual({
                total: 17,
                offset: 0,
                limit: 50,
                nextOffset: null,
            });

            const { items } = res.json.data;
            expect(items).toHaveLength(17);
            expect(items.map((r: SettingRowOutput) => r.key)).toEqual(
                EXPECTED_TABLE.map(t => t.key)
            );

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const expected = EXPECTED_TABLE[i];
                expect(Object.keys(item)).toEqual([
                    "key",
                    "value",
                    "source",
                    "default",
                    "env",
                    "type",
                    "description",
                ]);
                expect(item.default).toBe(expected.default);
                expect(item.env).toBe(expected.env);
                expect(item.type).toBe(expected.type);
                expect(item.source).toBe("default");
                expect(item.value).toBe(expected.default);
            }
        });

        it("shows source env for settings provided by environment in commandIn", async () => {
            const paths = makeHome();
            const res = await configListIn(paths);
            expect(res.code).toBe(0);

            const byKey = new Map(res.json.data.items.map((r: SettingRowOutput) => [r.key, r]));

            const saltmeta = byKey.get("saltmeta.url")!;
            expect(saltmeta.source).toBe("env");
            expect(saltmeta.value).toBe(META_URL);
            expect(saltmeta.default).toBe(DEFAULT_CORE_CONFIG.saltMetaUrl);

            const lxns = byKey.get("lxns.baseUrl")!;
            expect(lxns.source).toBe("env");
            expect(lxns.value).toBe(LXNS_URL);
            expect(lxns.default).toBe(DEFAULT_CORE_CONFIG.lxnsBaseUrl);
        });

        it("supports paging with --limit and --offset", async () => {
            const paths = makeHome();
            const resPaged = await configListIn(paths, ["--limit", "5", "--offset", "15"]);
            expect(resPaged.code).toBe(0);
            expect(resPaged.json.data.items.map((i: SettingRowOutput) => i.key)).toEqual([
                "output.format",
                "sync.qrOtherAccount",
            ]);
            expect(resPaged.json.meta.page).toEqual({
                total: 17,
                offset: 15,
                limit: 5,
                nextOffset: null,
            });

            const resNext = await configListIn(paths, ["--limit", "2"]);
            expect(resNext.json.meta.page.nextOffset).toBe(2);
        });

        it("projects fields with --fields", async () => {
            const paths = makeHome();
            const res = await configListIn(paths, ["--fields", "key,source"]);
            expect(res.code).toBe(0);
            for (const item of res.json.data.items) {
                expect(Object.keys(item).sort()).toEqual(["key", "source"]);
            }
        });

        it("renders TSV with --format tsv and projected fields", async () => {
            const paths = makeHome();
            const res = await commandIn(paths, "config", [
                "list",
                "--format",
                "tsv",
                "--fields",
                "key,value,source",
            ]);
            expect(res.code).toBe(0);
            const lines = res.stdout.trim().split("\n");
            expect(lines[0]).toBe("key\tvalue\tsource");
            expect(lines).toHaveLength(18);
            expect(lines).toContain("metadata.maxAgeHours\t24\tdefault");
        });

        it("renders text format with file and problems lines", async () => {
            const paths = makeHome();
            const res = await commandIn(paths, "config", ["list", "--format", "text"]);
            expect(res.code).toBe(0);
            expect(res.stdout).toContain("file:");
            expect(res.stdout).toContain("problems: []");
            expect(res.stdout).toMatch(/^metadata\.maxAgeHours/m);
        });

        it("applies environment overrides and trims trailing slashes", async () => {
            const paths = makeHome();
            const res = await configListIn(paths, [], {
                env: {
                    SALTNET_METADATA_MAX_AGE_HOURS: "7",
                    SALTNET_API_FALLBACK_URL: "https://backup.example.test/",
                },
            });
            const byKey = new Map(res.json.data.items.map((r: SettingRowOutput) => [r.key, r]));

            const maxAge = byKey.get("metadata.maxAgeHours")!;
            expect(maxAge.value).toBe(7);
            expect(maxAge.source).toBe("env");

            const fallback = byKey.get("api.fallbackUrl")!;
            expect(fallback.value).toBe("https://backup.example.test");
            expect(fallback.source).toBe("env");
        });

        it("reads settings from config.json and prioritizes env over file", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(paths.config, JSON.stringify({ scores: { staleDays: 9 } }));

            const resFileOnly = await configListIn(paths);
            const staleOnly = resFileOnly.json.data.items.find(
                (r: SettingRowOutput) => r.key === "scores.staleDays"
            )!;
            expect(staleOnly.value).toBe(9);
            expect(staleOnly.source).toBe("file");

            const resEnvWins = await configListIn(paths, [], {
                env: { SALTNET_SCORES_STALE_DAYS: "5" },
            });
            const staleEnvWins = resEnvWins.json.data.items.find(
                (r: SettingRowOutput) => r.key === "scores.staleDays"
            )!;
            expect(staleEnvWins.value).toBe(5);
            expect(staleEnvWins.source).toBe("env");
        });

        it("allows empty env var only for settings that may be empty", async () => {
            const paths = makeHome();
            const res = await configListIn(paths, [], {
                env: {
                    SALTNET_API_FALLBACK_URL: "",
                    SALTNET_METADATA_MAX_AGE_HOURS: "",
                },
            });
            const byKey = new Map(res.json.data.items.map((r: SettingRowOutput) => [r.key, r]));

            const fallback = byKey.get("api.fallbackUrl")!;
            expect(fallback.source).toBe("env");
            expect(fallback.value).toBe("");

            const maxAge = byKey.get("metadata.maxAgeHours")!;
            expect(maxAge.source).toBe("default");
            expect(maxAge.value).toBe(24);
        });

        it("reflects build defaults when stubbed", async () => {
            vi.stubGlobal("__SALTNET_BUILD_DEFAULTS__", {
                lxnsClientId: "build-client",
            });

            const paths = makeHome();
            const res = await configListIn(paths);
            const client = res.json.data.items.find(
                (r: SettingRowOutput) => r.key === "lxns.clientId"
            )!;
            expect(client.value).toBe("build-client");
            expect(client.source).toBe("build");
            expect(client.default).toBe("build-client");
        });

        it("returns code 0 and reports problems for broken config.json, while status aborts", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(
                paths.config,
                JSON.stringify({ metadata: { maxAgeHours: "abc" }, weird: 1, lxns: 5 })
            );

            const resList = await configListIn(paths);
            expect(resList.code).toBe(0);
            expect(resList.json.data.problems).toEqual([
                {
                    severity: "error",
                    source: "file",
                    key: "metadata.maxAgeHours",
                    message: `config.json 里的 metadata.maxAgeHours 应该是 0 到 8760 的数字（现在是 "abc"）`,
                },
                {
                    severity: "warning",
                    source: "file",
                    key: "weird",
                    message: "config.json 里有不认识的设置 weird，已忽略",
                },
                {
                    severity: "error",
                    source: "file",
                    key: "lxns",
                    message: "config.json 里的 lxns 应该是对象",
                },
            ]);

            const byKey = new Map(resList.json.data.items.map((r: SettingRowOutput) => [r.key, r]));
            expect(byKey.get("metadata.maxAgeHours")!.value).toBe(24);
            expect(byKey.get("metadata.maxAgeHours")!.source).toBe("default");
            expect(byKey.get("lxns.clientId")!.value).toBe("");
            expect(byKey.get("lxns.clientId")!.source).toBe("default");

            // At the same time, status and search fail with code 2 USAGE
            const resStatus = await commandIn(paths, "status", []);
            expect(resStatus.code).toBe(2);
            expect(resStatus.json.error.code).toBe("USAGE");

            const resSearch = await commandIn(paths, "search", ["x"]);
            expect(resSearch.code).toBe(2);
            expect(resSearch.json.error.code).toBe("USAGE");
        });

        it("creates neither the home directory nor database", async () => {
            const paths = makeHome();
            await configListIn(paths);
            expect(existsSync(paths.home)).toBe(false);
            expect(existsSync(paths.database)).toBe(false);
        });
    });

    describe("config get", () => {
        it("returns the exact setting row for metadata.maxAgeHours", async () => {
            const paths = makeHome();
            const res = await configGetIn(paths, ["metadata.maxAgeHours"]);
            expect(res.code).toBe(0);
            expect(Object.keys(res.json.data)).toEqual([
                "key",
                "value",
                "source",
                "default",
                "env",
                "type",
                "description",
            ]);
            expect(res.json.data).toEqual({
                key: "metadata.maxAgeHours",
                value: 24,
                source: "default",
                default: 24,
                env: "SALTNET_METADATA_MAX_AGE_HOURS",
                type: "0 到 8760 的数字",
                description:
                    "曲库和收藏品的过期时间（小时）；超过就在下次查询前自动刷新，0 表示每次都刷新",
            });
        });

        it("handles case and width variations", async () => {
            const paths = makeHome();
            const resUpper = await configGetIn(paths, ["METADATA.MAXAGEHOURS"]);
            expect(resUpper.code).toBe(0);
            expect(resUpper.json.data.key).toBe("metadata.maxAgeHours");

            const resFull = await configGetIn(paths, ["ｍｅｔａｄａｔａ.maxAgeHours"]);
            expect(resFull.code).toBe(0);
            expect(resFull.json.data.key).toBe("metadata.maxAgeHours");
        });

        it("returns NOT_FOUND and nearest or fallback candidates", async () => {
            const paths = makeHome();

            for (const text of ["maxAge", "metadata", "url"]) {
                const res = await configGetIn(paths, [text]);
                expect(res.code).toBe(3);
                expect(res.json.error.code).toBe("NOT_FOUND");
            }

            const resTypo = await configGetIn(paths, ["metadata.maxAgeHour"]);
            expect(resTypo.code).toBe(3);
            expect(resTypo.json.error.code).toBe("NOT_FOUND");
            expect(resTypo.json.error.candidates).toEqual([
                {
                    ref: "metadata.maxAgeHours",
                    title: CONFIG_DEFINITIONS.find(d => d.key === "metadata.maxAgeHours")!
                        .description,
                },
            ]);

            const resNosuch = await configGetIn(paths, ["nosuch"]);
            expect(resNosuch.code).toBe(3);
            expect(resNosuch.json.error.code).toBe("NOT_FOUND");
            expect(resNosuch.json.error.message).toBe(
                "找不到设置「nosuch」；config list 列出全部设置"
            );
            expect(resNosuch.json.error.candidates).toEqual(
                CONFIG_DEFINITIONS.slice(0, 10).map(d => ({
                    ref: d.key,
                    title: d.description,
                }))
            );
        });

        it("displays value from file or env", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(paths.config, JSON.stringify({ scores: { staleDays: 9 } }));

            const resFile = await configGetIn(paths, ["scores.staleDays"]);
            expect(resFile.json.data.value).toBe(9);
            expect(resFile.json.data.source).toBe("file");

            const resEnv = await configGetIn(paths, ["scores.staleDays"], {
                env: { SALTNET_SCORES_STALE_DAYS: "9" },
            });
            expect(resEnv.json.data.value).toBe(9);
            expect(resEnv.json.data.source).toBe("env");
        });

        it("works with a broken file and returns code 0", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(paths.config, JSON.stringify({ metadata: { maxAgeHours: "abc" } }));

            const res = await configGetIn(paths, ["metadata.maxAgeHours"]);
            expect(res.code).toBe(0);
            expect(res.json.data.value).toBe(24);
            expect(res.json.data.source).toBe("default");
        });

        it("reports USAGE when key positional is missing", async () => {
            const paths = makeHome();
            const res = await configGetIn(paths);
            expect(res.code).toBe(2);
            expect(res.json.error.code).toBe("USAGE");
            expect(res.json.error.message).toBe("缺少参数 <设置>");
        });

        it("shows the user agent default with the version of the CLI", async () => {
            const paths = makeHome();
            const res = await configGetIn(paths, ["network.userAgent"]);
            expect(res.code).toBe(0);
            expect(res.json.data.value).toBe("saltnet-cli/9.9.9");
            expect(res.json.data.default).toBe("saltnet-cli/9.9.9");
            expect(res.json.data.source).toBe("default");
        });
    });

    describe("config set", () => {
        it("creates config.json with exact text, modes, and sets changed: true then false", async () => {
            const paths = makeHome();
            const res1 = await configSetIn(paths, ["metadata.maxAgeHours", "12"]);

            expect(res1.code).toBe(0);
            expect(res1.json.data.changed).toBe(true);
            expect(res1.json.data.key).toBe("metadata.maxAgeHours");
            expect(res1.json.data.value).toBe(12);
            expect(res1.json.data.source).toBe("file");

            const content = readFileSync(paths.config, "utf8");
            expect(content).toBe('{\n  "metadata": {\n    "maxAgeHours": 12\n  }\n}\n');

            if (process.platform !== "win32") {
                expect(statSync(paths.home).mode & 0o777).toBe(0o700);
                expect(statSync(paths.config).mode & 0o777).toBe(0o600);
            }

            // Repeat setting same value
            const res2 = await configSetIn(paths, ["metadata.maxAgeHours", "12"]);
            expect(res2.json.data.changed).toBe(false);

            // Repeat with 4-space formatted file preserves byte for byte
            const formatted = '{\n    "metadata": {\n        "maxAgeHours": 12\n    }\n}\n';
            writeFileSync(paths.config, formatted);
            const res3 = await configSetIn(paths, ["metadata.maxAgeHours", "12"]);
            expect(res3.json.data.changed).toBe(false);
            expect(readFileSync(paths.config, "utf8")).toBe(formatted);

            // Subsequent config get in a new run shows source: "file"
            const resGet = await configGetIn(paths, ["metadata.maxAgeHours"]);
            expect(resGet.json.data.source).toBe("file");
            expect(resGet.json.data.value).toBe(12);
        });

        it("preserves unknown keys and appends new groups", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(
                paths.config,
                `${JSON.stringify({ weird: 1, lxns: { clientId: "abc", extra: true } }, null, 2)}\n`
            );

            const res = await configSetIn(paths, ["lxns.clientId", "x"]);
            expect(res.code).toBe(0);
            expect(res.json.data.changed).toBe(true);

            const parsed = JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                string,
                unknown
            >;
            expect(parsed.weird).toBe(1);
            expect(parsed.lxns).toEqual({ clientId: "x", extra: true });

            // New group appended
            await configSetIn(paths, ["output.format", "text"]);
            const parsedAppended = JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                string,
                unknown
            >;
            expect(Object.keys(parsedAppended)).toEqual(["weird", "lxns", "output"]);
        });

        it("normalizes accepted values and rejects invalid values", async () => {
            const paths = makeHome();

            // 12 -> number 12
            await configSetIn(paths, ["metadata.maxAgeHours", "12"]);
            expect(
                (
                    JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                        string,
                        { maxAgeHours: unknown }
                    >
                ).metadata.maxAgeHours
            ).toBe(12);

            // 0.5 -> number 0.5
            await configSetIn(paths, ["metadata.maxAgeHours", "0.5"]);
            expect(
                (
                    JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                        string,
                        { maxAgeHours: unknown }
                    >
                ).metadata.maxAgeHours
            ).toBe(0.5);

            // TEXT -> "text"
            await configSetIn(paths, ["output.format", "TEXT"]);
            expect(
                (
                    JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                        string,
                        { format: unknown }
                    >
                ).output.format
            ).toBe("text");

            // Trailing slashes stripped
            await configSetIn(paths, ["api.url", "https://api.example.test/v1///"]);
            expect(
                (JSON.parse(readFileSync(paths.config, "utf8")) as Record<string, { url: unknown }>)
                    .api.url
            ).toBe("https://api.example.test/v1");

            // Trimmed text
            await configSetIn(paths, ["lxns.clientId", "  abc  "]);
            expect(
                (
                    JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                        string,
                        { clientId: unknown }
                    >
                ).lxns.clientId
            ).toBe("abc");

            // sync.qrOtherAccount ERROR -> "error"
            await configSetIn(paths, ["sync.qrOtherAccount", "ERROR"]);
            expect(
                (
                    JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                        string,
                        { qrOtherAccount: unknown }
                    >
                ).sync.qrOtherAccount
            ).toBe("error");

            // metadata.maxAgeHours boundaries 0 and 8760
            const res0 = await configSetIn(paths, ["metadata.maxAgeHours", "0"]);
            expect(res0.code).toBe(0);
            expect(res0.json.data.value).toBe(0);

            const res8760 = await configSetIn(paths, ["metadata.maxAgeHours", "8760"]);
            expect(res8760.code).toBe(0);
            expect(res8760.json.data.value).toBe(8760);

            // "" for all 5 settings that may be empty
            const emptyAllowed = [
                "api.url",
                "api.fallbackUrl",
                "render.url",
                "lxns.clientId",
                "lxns.redirectUri",
            ];
            for (const key of emptyAllowed) {
                const resEmpty = await configSetIn(paths, [key, ""]);
                expect(resEmpty.code).toBe(0);
                expect(resEmpty.json.data.value).toBe("");
            }

            // Rejected cases
            const resEmptyMaxAge = await configSetIn(paths, ["metadata.maxAgeHours", ""]);
            expect(resEmptyMaxAge.code).toBe(2);
            expect(resEmptyMaxAge.json.error.code).toBe("USAGE");
            expect(resEmptyMaxAge.json.error.message).toBe(
                '设置 metadata.maxAgeHours 应该是 0 到 8760 的数字（现在是 ""）'
            );

            const refreshBad = [
                { val: "1.5", echo: '"1.5"' },
                { val: "0", echo: '"0"' },
                { val: "3651", echo: '"3651"' },
                { val: "abc", echo: '"abc"' },
            ];
            for (const item of refreshBad) {
                const res = await configSetIn(paths, ["lxns.refreshTokenDays", item.val]);
                expect(res.code).toBe(2);
                expect(res.json.error.code).toBe("USAGE");
                expect(res.json.error.message).toBe(
                    `设置 lxns.refreshTokenDays 应该是 1 到 3650 的整数（现在是 ${item.echo}）`
                );
            }

            for (const val of ["xml", "tsv"]) {
                const res = await configSetIn(paths, ["output.format", val]);
                expect(res.code).toBe(2);
                expect(res.json.error.code).toBe("USAGE");
                expect(res.json.error.message).toBe(
                    `设置 output.format 应该是 json 或 text（现在是 "${val}"）`
                );
            }

            const res8761 = await configSetIn(paths, ["metadata.maxAgeHours", "8761"]);
            expect(res8761.code).toBe(2);
            expect(res8761.json.error.code).toBe("USAGE");
            expect(res8761.json.error.message).toBe(
                '设置 metadata.maxAgeHours 应该是 0 到 8760 的数字（现在是 "8761"）'
            );

            const resNeg1 = await configSetIn(paths, ["metadata.maxAgeHours", "-1"]);
            expect(resNeg1.code).toBe(2);
            expect(resNeg1.json.error.code).toBe("USAGE");
            // A negative number is a value, not an option.
            expect(resNeg1.json.error.message).toBe(
                '设置 metadata.maxAgeHours 应该是 0 到 8760 的数字（现在是 "-1"）'
            );
        });

        it("leaves file untouched on syntax errors and missing argument", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(paths.config, "{ not json");

            const resBadJson = await configSetIn(paths, ["metadata.maxAgeHours", "12"]);
            expect(resBadJson.code).toBe(2);
            expect(resBadJson.json.error.code).toBe("USAGE");
            expect(resBadJson.json.error.message).toBe(
                `config.json 不是合法的 JSON，没有改动；请先修好或删掉 ${paths.config}`
            );
            expect(readFileSync(paths.config, "utf8")).toBe("{ not json");

            writeFileSync(paths.config, "[]");
            const resNotObj = await configSetIn(paths, ["metadata.maxAgeHours", "12"]);
            expect(resNotObj.code).toBe(2);
            expect(resNotObj.json.error.code).toBe("USAGE");
            expect(resNotObj.json.error.message).toBe(
                `config.json 的内容必须是 JSON 对象，没有改动；请先修好或删掉 ${paths.config}`
            );
            expect(readFileSync(paths.config, "utf8")).toBe("[]");

            const pathsDir = makeHome();
            mkdirSync(pathsDir.config, { recursive: true });
            const resDir = await configSetIn(pathsDir, ["metadata.maxAgeHours", "12"]);
            expect(resDir.code).toBe(2);
            expect(resDir.json.error.code).toBe("USAGE");
            expect(resDir.json.error.message).toBe(
                `无法读取 config.json（EISDIR），没有改动；请先修好或删掉 ${pathsDir.config}`
            );

            // Missing value
            const pathsNormal = makeHome();
            const resMissingVal = await configSetIn(pathsNormal, ["metadata.maxAgeHours"]);
            expect(resMissingVal.code).toBe(2);
            expect(resMissingVal.json.error.code).toBe("USAGE");
            expect(resMissingVal.json.error.message).toBe("缺少参数 <值>");
            expect(resMissingVal.json.error.fix).toBe("saltnet config set --help");
        });

        it("writes file while env variable still overrides the active value", async () => {
            const paths = makeHome();
            const res = await configSetIn(paths, ["metadata.maxAgeHours", "5"], {
                env: { SALTNET_METADATA_MAX_AGE_HOURS: "7" },
            });

            expect(res.code).toBe(0);
            expect(res.json.data.changed).toBe(true);
            expect(res.json.data.value).toBe(7);
            expect(res.json.data.source).toBe("env");

            const parsed = JSON.parse(readFileSync(paths.config, "utf8")) as Record<
                string,
                { maxAgeHours: unknown }
            >;
            expect(parsed.metadata.maxAgeHours).toBe(5);
        });

        it("never creates database file and makes no network requests", async () => {
            const paths = makeHome();
            const res = await configSetIn(paths, ["metadata.maxAgeHours", "12"]);
            expect(res.requests).toEqual([]);
            expect(existsSync(paths.database)).toBe(false);
        });

        it("answers with the row of the setting, changed first", async () => {
            const paths = makeHome();
            const res = await configSetIn(paths, ["network.userAgent", "  my-agent/1  "]);
            expect(res.code).toBe(0);
            expect(Object.keys(res.json.data)).toEqual([
                "changed",
                "key",
                "value",
                "source",
                "default",
                "env",
                "type",
                "description",
            ]);
            expect(res.json.data).toMatchObject({
                changed: true,
                key: "network.userAgent",
                value: "my-agent/1",
                source: "file",
                default: "saltnet-cli/9.9.9",
                env: "SALTNET_NETWORK_USER_AGENT",
                type: "非空文字",
            });
            expect(res.json.data.description.length).toBeGreaterThan(0);
        });

        it("writes the setting under its own name, whatever case or width the key was typed in", async () => {
            const paths = makeHome();
            const res = await configSetIn(paths, ["METADATA.MAXAGEHOURS", "12"]);
            expect(res.code).toBe(0);
            expect(res.json.data.key).toBe("metadata.maxAgeHours");
            expect(readFileSync(paths.config, "utf8")).toBe(
                '{\n  "metadata": {\n    "maxAgeHours": 12\n  }\n}\n'
            );

            const resFull = await configSetIn(paths, ["ｓｃｏｒｅｓ.staleDays", "5"]);
            expect(resFull.json.data.key).toBe("scores.staleDays");
            expect(JSON.parse(readFileSync(paths.config, "utf8"))).toEqual({
                metadata: { maxAgeHours: 12 },
                scores: { staleDays: 5 },
            });
        });
    });

    describe("config unset", () => {
        it("removes entry and writes {} when nothing is left", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(paths.config, JSON.stringify({ metadata: { maxAgeHours: 12 } }));

            const res = await configUnsetIn(paths, ["metadata.maxAgeHours"]);
            expect(res.code).toBe(0);
            expect(res.json.data.changed).toBe(true);
            expect(res.json.data.value).toBe(24);
            expect(res.json.data.source).toBe("default");
            expect(readFileSync(paths.config, "utf8")).toBe("{}\n");
        });

        it("leaves file byte for byte and returns changed: false when nothing to remove", async () => {
            // Missing file -> no directory created
            const pathsFresh = makeHome();
            const resFresh = await configUnsetIn(pathsFresh, ["metadata.maxAgeHours"]);
            expect(resFresh.code).toBe(0);
            expect(resFresh.json.data.changed).toBe(false);
            expect(existsSync(pathsFresh.home)).toBe(false);

            // Missing key in existing group
            const pathsExisting = makeHome();
            mkdirSync(pathsExisting.home, { recursive: true });
            const formatted = '{\n    "metadata": {\n        "maxAgeHours": 12\n    }\n}\n';
            writeFileSync(pathsExisting.config, formatted);

            const resMissingKey = await configUnsetIn(pathsExisting, ["metadata.timeoutMs"]);
            expect(resMissingKey.code).toBe(0);
            expect(resMissingKey.json.data.changed).toBe(false);
            expect(readFileSync(pathsExisting.config, "utf8")).toBe(formatted);

            // Missing group
            const resMissingGroup = await configUnsetIn(pathsExisting, ["lxns.clientId"]);
            expect(resMissingGroup.code).toBe(0);
            expect(resMissingGroup.json.data.changed).toBe(false);
            expect(readFileSync(pathsExisting.config, "utf8")).toBe(formatted);
        });

        it("removes a non-object group as a whole", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(paths.config, JSON.stringify({ lxns: 5 }));

            const res = await configUnsetIn(paths, ["lxns.clientId"]);
            expect(res.code).toBe(0);
            expect(res.json.data.changed).toBe(true);
            expect(readFileSync(paths.config, "utf8")).toBe("{}\n");
        });

        it("reflects env variable value when unset with env set", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(paths.config, JSON.stringify({ metadata: { maxAgeHours: 5 } }));

            const res = await configUnsetIn(paths, ["metadata.maxAgeHours"], {
                env: { SALTNET_METADATA_MAX_AGE_HOURS: "7" },
            });
            expect(res.code).toBe(0);
            expect(res.json.data.changed).toBe(true);
            expect(res.json.data.value).toBe(7);
            expect(res.json.data.source).toBe("env");
            expect(readFileSync(paths.config, "utf8")).toBe("{}\n");
        });

        it("returns NOT_FOUND for unknown key", async () => {
            const paths = makeHome();
            const res = await configUnsetIn(paths, ["nosuch"]);
            expect(res.code).toBe(3);
            expect(res.json.error.code).toBe("NOT_FOUND");
        });

        it("answers with the row of the setting, changed first", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(paths.config, JSON.stringify({ network: { userAgent: "my-agent/1" } }));

            const res = await configUnsetIn(paths, ["network.userAgent"]);
            expect(res.code).toBe(0);
            expect(Object.keys(res.json.data)).toEqual([
                "changed",
                "key",
                "value",
                "source",
                "default",
                "env",
                "type",
                "description",
            ]);
            expect(res.json.data).toMatchObject({
                changed: true,
                key: "network.userAgent",
                value: "saltnet-cli/9.9.9",
                source: "default",
                default: "saltnet-cli/9.9.9",
            });
        });

        it("removes the entry under its own name, whatever case or width the key was typed in", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(
                paths.config,
                JSON.stringify({ metadata: { maxAgeHours: 12 }, scores: { staleDays: 5 } })
            );

            const res = await configUnsetIn(paths, ["METADATA.MAXAGEHOURS"]);
            expect(res.code).toBe(0);
            expect(res.json.data.changed).toBe(true);
            expect(res.json.data.key).toBe("metadata.maxAgeHours");
            expect(JSON.parse(readFileSync(paths.config, "utf8"))).toEqual({
                scores: { staleDays: 5 },
            });
        });

        it("leaves broken file untouched on syntax errors", async () => {
            const paths = makeHome();
            mkdirSync(paths.home, { recursive: true });
            writeFileSync(paths.config, "{ not json");

            const res = await configUnsetIn(paths, ["metadata.maxAgeHours"]);
            expect(res.code).toBe(2);
            expect(res.json.error.code).toBe("USAGE");
            expect(res.json.error.message).toBe(
                `config.json 不是合法的 JSON，没有改动；请先修好或删掉 ${paths.config}`
            );
            expect(readFileSync(paths.config, "utf8")).toBe("{ not json");
        });
    });

    describe("help and registry", () => {
        it("returns USAGE error for config alone without subcommands", async () => {
            const paths = makeHome();
            const res = await commandIn(paths, "config", []);
            expect(res.code).toBe(2);
            expect(res.json.error.code).toBe("USAGE");
            expect(res.json.error.message).toBe("「config」需要子命令：list、get、set、unset");
            expect(res.json.error.fix).toBe("saltnet config --help");
        });

        it("renders config --help with subcommands and group description", async () => {
            const paths = makeHome();
            const res = await commandIn(paths, "config", ["--help"]);
            expect(res.code).toBe(0);
            expect(res.stdout).toContain("list");
            expect(res.stdout).toContain("get <设置>");
            expect(res.stdout).toContain("set <设置> <值>");
            expect(res.stdout).toContain("unset <设置>");
            expect(res.stdout).toContain("设置：查看和修改 config.json");
        });

        it("renders side effect notes in help output", async () => {
            const paths = makeHome();
            const resSet = await commandIn(paths, "config", ["set", "--help"]);
            expect(resSet.stdout).toContain("副作用：本地");

            const resUnset = await commandIn(paths, "config", ["unset", "--help"]);
            expect(resUnset.stdout).toContain("副作用：本地");

            const resList = await commandIn(paths, "config", ["list", "--help"]);
            expect(resList.stdout).toContain("副作用：无，只读");

            const resGet = await commandIn(paths, "config", ["get", "--help"]);
            expect(resGet.stdout).toContain("副作用：无，只读");

            const resStatus = await commandIn(paths, "status", ["--help"]);
            expect(resStatus.stdout).toContain("副作用：无，只读");
        });
    });

    describe("round trip", () => {
        it("sets three settings, verifies with list, unsets all three, and returns to defaults", async () => {
            const paths = makeHome();
            const noEnv = {
                SALTNET_SALTMETA_URL: undefined,
                SALTNET_LXNS_BASE_URL: undefined,
            };

            // Set 3 settings
            await configSetIn(paths, ["metadata.maxAgeHours", "12"]);
            await configSetIn(paths, ["output.format", "text"]);
            await configSetIn(paths, ["scores.staleDays", "5"]);

            // List shows them with source: "file" and others default
            const resListAfterSet = await configListIn(paths, [], { env: noEnv });
            const byKeySet = new Map(
                resListAfterSet.json.data.items.map((r: SettingRowOutput) => [r.key, r])
            );

            expect(byKeySet.get("metadata.maxAgeHours")!.value).toBe(12);
            expect(byKeySet.get("metadata.maxAgeHours")!.source).toBe("file");
            expect(byKeySet.get("output.format")!.value).toBe("text");
            expect(byKeySet.get("output.format")!.source).toBe("file");
            expect(byKeySet.get("scores.staleDays")!.value).toBe(5);
            expect(byKeySet.get("scores.staleDays")!.source).toBe("file");

            const othersSet = resListAfterSet.json.data.items.filter(
                (r: SettingRowOutput) =>
                    !["metadata.maxAgeHours", "output.format", "scores.staleDays"].includes(r.key)
            );
            for (const item of othersSet) {
                expect(item.source).toBe("default");
            }

            // Unset all 3
            await configUnsetIn(paths, ["metadata.maxAgeHours"]);
            await configUnsetIn(paths, ["output.format"]);
            await configUnsetIn(paths, ["scores.staleDays"]);

            // List is back to all default
            const resListAfterUnset = await configListIn(paths, [], { env: noEnv });
            for (const item of resListAfterUnset.json.data.items) {
                expect(item.source).toBe("default");
            }
            expect(readFileSync(paths.config, "utf8")).toBe("{}\n");
        });
    });
});
