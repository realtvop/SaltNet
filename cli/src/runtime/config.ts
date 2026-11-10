import type { CoreConfig } from "@core/config";
import type { BuildDefaults } from "./buildDefaults";
import type { RuntimePaths } from "./paths";
import { readFileSync } from "node:fs";
import process from "node:process";
import { DEFAULT_CORE_CONFIG } from "@core/config";
import { VERSION } from "../version";
import { getBuildDefaults } from "./buildDefaults";

/**
 * Settings of the CLI. Every one has a built-in default and can be changed in `config.json` or,
 * with higher priority, in an environment variable named after it (see `configEnvName`).
 */
export interface ConfigValues {
    api: {
        /** SaltNet backend, primary address. */
        url: string;
        /** SaltNet backend, address used when the primary one fails. */
        fallbackUrl: string;
    };
    render: {
        /** B50 image render service. */
        url: string;
    };
    saltmeta: {
        /** Compacted SaltMeta document. */
        url: string;
    };
    lxns: {
        /** Origin of the LXNS service. */
        baseUrl: string;
        clientId: string;
        redirectUri: string;
        /** How long a refresh token is assumed to stay valid. */
        refreshTokenDays: number;
        /** `status` warns when a refresh token has fewer days than this left. */
        expiringWarnDays: number;
    };
    metadata: {
        /** Catalog and collections older than this are refreshed before they are used. */
        maxAgeHours: number;
        /** Timeout of each request made while refreshing them. */
        timeoutMs: number;
    };
    scores: {
        /** Scores older than this get a `STALE_SCORES` warning. */
        staleDays: number;
    };
    network: {
        timeoutMs: number;
        /** In-game account updates are slow, so they get their own limit. */
        updateTimeoutMs: number;
        userAgent: string;
    };
    output: {
        /** Used only when the command runs in a terminal and `--format` is not given. */
        format: "json" | "text";
    };
    sync: {
        /** What to do when a QR code belongs to another Maimai account than the bound one. */
        qrOtherAccount: "rewrite" | "error";
    };
}

type Paths<T> = {
    [K in keyof T & string]: T[K] extends object ? `${K}.${keyof T[K] & string}` : K;
}[keyof T & string];

/** Dotted name of a setting, as in `saltnet config get lxns.clientId`. */
export type ConfigKey = Paths<ConfigValues>;

export type ConfigValue = string | number;

/** Where a value comes from, from the highest priority to the lowest. */
export type ConfigSource = "env" | "file" | "build" | "default";

export type ConfigKind =
    /** An http(s) address; trailing slashes are dropped because paths are appended to it. */
    | { type: "baseUrl"; allowEmpty: boolean }
    /** An http(s) address that is kept exactly as written. */
    | { type: "url"; allowEmpty: boolean }
    | { type: "string"; allowEmpty: boolean }
    | { type: "integer"; min: number; max: number }
    | { type: "number"; min: number; max: number }
    /** Matched without regard to case. */
    | { type: "enum"; values: readonly string[] };

export interface ConfigDefinition {
    key: ConfigKey;
    kind: ConfigKind;
    /** What the setting does, for `config list` and the schema. */
    description: string;
    defaultValue: (context: { build: BuildDefaults; version: string }) => {
        value: ConfigValue;
        source: "build" | "default";
    };
}

function fixed(value: ConfigValue): ConfigDefinition["defaultValue"] {
    return () => ({ value, source: "default" });
}

/** A default that the build takes from the web app's `.env`; empty when the build had none. */
function fromBuild(pick: (build: BuildDefaults) => string): ConfigDefinition["defaultValue"] {
    return ({ build }) => {
        const value = pick(build);
        return { value, source: value === "" ? "default" : "build" };
    };
}

/** Every setting, in the order `config list` shows them. */
export const CONFIG_DEFINITIONS: readonly ConfigDefinition[] = [
    {
        key: "api.url",
        kind: { type: "baseUrl", allowEmpty: true },
        description: "SaltNet 后端主地址",
        defaultValue: fromBuild(build => build.apiUrl),
    },
    {
        key: "api.fallbackUrl",
        kind: { type: "baseUrl", allowEmpty: true },
        description: "SaltNet 后端备用地址，主地址失败时自动改用；留空表示不用备用地址",
        defaultValue: fromBuild(build => build.apiFallbackUrl),
    },
    {
        key: "render.url",
        kind: { type: "baseUrl", allowEmpty: true },
        description: "B50 图片渲染服务地址",
        defaultValue: fromBuild(build => build.renderUrl),
    },
    {
        key: "saltmeta.url",
        kind: { type: "url", allowEmpty: false },
        description: "SaltMeta 曲库元数据文件的地址",
        defaultValue: fixed(DEFAULT_CORE_CONFIG.saltMetaUrl),
    },
    {
        key: "lxns.baseUrl",
        kind: { type: "baseUrl", allowEmpty: false },
        description: "落雪咖啡屋服务的源地址",
        defaultValue: fixed(DEFAULT_CORE_CONFIG.lxnsBaseUrl),
    },
    {
        key: "lxns.clientId",
        kind: { type: "string", allowEmpty: true },
        description: "落雪 OAuth 的 client id",
        defaultValue: fromBuild(build => build.lxnsClientId),
    },
    {
        key: "lxns.redirectUri",
        kind: { type: "url", allowEmpty: true },
        description: "落雪 OAuth 的回调地址，必须和这个 client 登记的完全一致",
        defaultValue: fromBuild(build => build.lxnsRedirectUri),
    },
    {
        key: "lxns.refreshTokenDays",
        kind: { type: "integer", min: 1, max: 3650 },
        description: "落雪 refresh token 按多少天有效来估算到期时间",
        defaultValue: fixed(30),
    },
    {
        key: "lxns.expiringWarnDays",
        kind: { type: "integer", min: 0, max: 3650 },
        description: "refresh token 剩余天数不到这个值时，status 给出 LXNS_EXPIRING 警告",
        defaultValue: fixed(3),
    },
    {
        key: "metadata.maxAgeHours",
        kind: { type: "number", min: 0, max: 8760 },
        description: "曲库和收藏品的过期时间（小时）；超过就在下次查询前自动刷新，0 表示每次都刷新",
        defaultValue: fixed(24),
    },
    {
        key: "metadata.timeoutMs",
        kind: { type: "integer", min: 100, max: 600000 },
        description: "刷新曲库和收藏品时每个请求的超时（毫秒）",
        defaultValue: fixed(8000),
    },
    {
        key: "scores.staleDays",
        kind: { type: "number", min: 0, max: 3650 },
        description: "成绩超过这么多天没更新，就附上 STALE_SCORES 警告",
        defaultValue: fixed(3),
    },
    {
        key: "network.timeoutMs",
        kind: { type: "integer", min: 100, max: 600000 },
        description: "普通请求的超时（毫秒）",
        defaultValue: fixed(15000),
    },
    {
        key: "network.updateTimeoutMs",
        kind: { type: "integer", min: 1000, max: 3600000 },
        description: "舞萌账号更新请求的超时（毫秒），比普通请求长",
        defaultValue: fixed(120000),
    },
    {
        key: "network.userAgent",
        kind: { type: "string", allowEmpty: false },
        description: "请求使用的 User-Agent",
        defaultValue: ({ version }) => ({ value: `saltnet-cli/${version}`, source: "default" }),
    },
    {
        key: "output.format",
        kind: { type: "enum", values: ["json", "text"] },
        description:
            "在终端里直接运行、又没写 --format 时的默认输出格式；输出不在终端时一律是 json",
        defaultValue: fixed("json"),
    },
    {
        key: "sync.qrOtherAccount",
        kind: { type: "enum", values: ["rewrite", "error"] },
        description:
            "二维码属于另一个舞萌账号时：rewrite 和网页端一致，改写用户的游戏 id；error 报错并提示改用 user bind",
        defaultValue: fixed("rewrite"),
    },
];

const DEFINITIONS_BY_KEY = new Map<string, ConfigDefinition>(
    CONFIG_DEFINITIONS.map(definition => [definition.key, definition])
);

export function findConfigDefinition(key: string): ConfigDefinition | undefined {
    return DEFINITIONS_BY_KEY.get(key);
}

/**
 * The environment variable that overrides a setting: `SALTNET_` plus the dotted key in upper snake
 * case, so `lxns.clientId` is `SALTNET_LXNS_CLIENT_ID`.
 */
export function configEnvName(key: ConfigKey): string {
    return `SALTNET_${key
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/\./g, "_")
        .toUpperCase()}`;
}

export type ParsedConfigValue = { ok: true; value: ConfigValue } | { ok: false; reason: string };

/** Reads a value typed on the command line or set in the environment. */
export function parseConfigText(definition: ConfigDefinition, text: string): ParsedConfigValue {
    return coerce(definition.kind, text, true);
}

/** Checks a value read from `config.json`. */
export function parseConfigJson(definition: ConfigDefinition, value: unknown): ParsedConfigValue {
    return coerce(definition.kind, value, false);
}

/** What a setting accepts, as a noun phrase: "1 到 365 的整数". */
export function describeConfigKind(kind: ConfigKind): string {
    switch (kind.type) {
        case "baseUrl":
        case "url":
            return kind.allowEmpty ? "http 或 https 地址（可以留空）" : "http 或 https 地址";
        case "string":
            return kind.allowEmpty ? "文字（可以留空）" : "非空文字";
        case "integer":
            return `${kind.min} 到 ${kind.max} 的整数`;
        case "number":
            return `${kind.min} 到 ${kind.max} 的数字`;
        case "enum":
            return kind.values.join(" 或 ");
    }
}

const DECIMAL_TEXT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

function coerce(kind: ConfigKind, input: unknown, fromText: boolean): ParsedConfigValue {
    const invalid = (): ParsedConfigValue => ({
        ok: false,
        reason: `应该是${describeConfigKind(kind)}${echo(kind, input)}`,
    });

    switch (kind.type) {
        case "string": {
            if (typeof input !== "string") return invalid();
            const value = input.trim();
            return value === "" && !kind.allowEmpty ? invalid() : { ok: true, value };
        }
        case "baseUrl":
        case "url": {
            if (typeof input !== "string") return invalid();
            const value = input.trim();
            if (value === "") return kind.allowEmpty ? { ok: true, value } : invalid();
            if (!isHttpUrl(value)) return invalid();
            return { ok: true, value: kind.type === "baseUrl" ? value.replace(/\/+$/, "") : value };
        }
        case "integer":
        case "number": {
            let value: number;
            if (typeof input === "number") {
                value = input;
            } else if (fromText && typeof input === "string" && DECIMAL_TEXT.test(input.trim())) {
                value = Number(input.trim());
            } else {
                return invalid();
            }
            const integerOk = kind.type === "number" || Number.isInteger(value);
            if (!Number.isFinite(value) || !integerOk || value < kind.min || value > kind.max) {
                return invalid();
            }
            return { ok: true, value };
        }
        case "enum": {
            if (typeof input !== "string") return invalid();
            const wanted = input.trim().toLowerCase();
            const match = kind.values.find(candidate => candidate.toLowerCase() === wanted);
            return match === undefined ? invalid() : { ok: true, value: match };
        }
    }
}

/**
 * Numbers and enum names are safe to quote back and make a mistake easy to spot. Addresses and
 * text are not quoted: they can carry credentials.
 */
function echo(kind: ConfigKind, input: unknown): string {
    if (kind.type !== "integer" && kind.type !== "number" && kind.type !== "enum") return "";
    if (typeof input !== "string" && typeof input !== "number") return "";
    return `（现在是 ${JSON.stringify(input)}）`;
}

function isHttpUrl(text: string): boolean {
    try {
        const url = new URL(text);
        return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "";
    } catch {
        return false;
    }
}

/** Something wrong with a value or with the file itself. The setting falls back to the next layer. */
export interface ConfigProblem {
    /** An `error` should stop the command; a `warning` is only worth mentioning. */
    severity: "error" | "warning";
    source: "env" | "file";
    /** Dotted key, or empty when the whole file is the problem. */
    key: string;
    message: string;
}

export interface ResolvedConfig {
    values: ConfigValues;
    sources: Readonly<Record<ConfigKey, ConfigSource>>;
    problems: readonly ConfigProblem[];
}

export interface ResolveConfigInput {
    /** Variables to read overrides from; defaults to the process environment. */
    env?: Readonly<Record<string, string | undefined>>;
    /** The parsed content of `config.json`, or undefined when there is none. */
    file?: unknown;
    /** Problems found while reading the file, reported along with the rest. */
    fileProblems?: readonly ConfigProblem[];
    buildDefaults?: BuildDefaults;
    version?: string;
}

/**
 * Combines the layers: an environment variable beats `config.json`, which beats the defaults. A
 * value that is not valid is reported in `problems` and skipped, so one bad entry cannot make the
 * rest unusable; the caller decides whether to go on.
 */
export function resolveConfig(input: ResolveConfigInput = {}): ResolvedConfig {
    const env = input.env ?? process.env;
    const context = {
        build: input.buildDefaults ?? getBuildDefaults(),
        version: input.version ?? VERSION,
    };
    const problems: ConfigProblem[] = [...(input.fileProblems ?? [])];
    const fromFile = readFileLayer(input.file, problems);

    const values: Record<string, Record<string, ConfigValue>> = {};
    const sources = {} as Record<ConfigKey, ConfigSource>;

    for (const definition of CONFIG_DEFINITIONS) {
        const [group, name] = definition.key.split(".");
        let resolved: { value: ConfigValue; source: ConfigSource } | undefined;

        const envName = configEnvName(definition.key);
        const envText = env[envName];
        // A variable that is set but empty only counts when an empty value is a valid setting.
        const allowsEmpty =
            (definition.kind.type === "baseUrl" ||
                definition.kind.type === "url" ||
                definition.kind.type === "string") &&
            definition.kind.allowEmpty;
        if (envText !== undefined && (envText.trim() !== "" || allowsEmpty)) {
            const parsed = parseConfigText(definition, envText);
            if (parsed.ok) {
                resolved = { value: parsed.value, source: "env" };
            } else {
                problems.push({
                    severity: "error",
                    source: "env",
                    key: definition.key,
                    message: `环境变量 ${envName} ${parsed.reason}`,
                });
            }
        }

        const fileValue = fromFile.get(definition.key);
        if (resolved === undefined && fileValue !== undefined) {
            resolved = { value: fileValue, source: "file" };
        }

        resolved ??= definition.defaultValue(context);
        if (resolved.source === "build") {
            // The build values come straight from `.env`; treat them like a typed-in value.
            const parsed = parseConfigText(definition, String(resolved.value));
            if (parsed.ok) resolved = { value: parsed.value, source: "build" };
        }

        (values[group] ??= {})[name] = resolved.value;
        sources[definition.key] = resolved.source;
    }

    return { values: values as unknown as ConfigValues, sources, problems };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validates `config.json` against the settings table and returns the values it sets. */
function readFileLayer(file: unknown, problems: ConfigProblem[]): Map<ConfigKey, ConfigValue> {
    const layer = new Map<ConfigKey, ConfigValue>();
    if (file === undefined) return layer;
    if (!isPlainObject(file)) {
        problems.push({
            severity: "error",
            source: "file",
            key: "",
            message: "config.json 的内容必须是 JSON 对象",
        });
        return layer;
    }

    const groups = new Set(CONFIG_DEFINITIONS.map(definition => definition.key.split(".")[0]));
    for (const [group, groupValue] of Object.entries(file)) {
        if (!groups.has(group)) {
            problems.push({
                severity: "warning",
                source: "file",
                key: group,
                message: `config.json 里有不认识的设置 ${group}，已忽略`,
            });
            continue;
        }
        if (!isPlainObject(groupValue)) {
            problems.push({
                severity: "error",
                source: "file",
                key: group,
                message: `config.json 里的 ${group} 应该是对象`,
            });
            continue;
        }
        for (const [name, raw] of Object.entries(groupValue)) {
            const key = `${group}.${name}`;
            const definition = findConfigDefinition(key);
            if (definition === undefined) {
                problems.push({
                    severity: "warning",
                    source: "file",
                    key,
                    message: `config.json 里有不认识的设置 ${key}，已忽略`,
                });
                continue;
            }
            const parsed = parseConfigJson(definition, raw);
            if (parsed.ok) {
                layer.set(definition.key, parsed.value);
            } else {
                problems.push({
                    severity: "error",
                    source: "file",
                    key,
                    message: `config.json 里的 ${key} ${parsed.reason}`,
                });
            }
        }
    }
    return layer;
}

export interface ConfigFile {
    /** The parsed content; undefined when the file does not exist or is empty. */
    data: unknown;
    problems: ConfigProblem[];
}

/** Reads `config.json`. A missing file is normal; an unreadable or malformed one is a problem. */
export function readConfigFile(file: string): ConfigFile {
    let text: string;
    try {
        text = readFileSync(file, "utf8");
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") return { data: undefined, problems: [] };
        return {
            data: undefined,
            problems: [
                {
                    severity: "error",
                    source: "file",
                    key: "",
                    message: `无法读取 config.json（${code ?? "未知错误"}）`,
                },
            ],
        };
    }

    // Editors on some systems put a byte order mark at the start of UTF-8 files.
    // U+FEFF, written in decimal because Prettier and unicorn disagree on hex digit case.
    if (text.charCodeAt(0) === 65279) text = text.slice(1);
    if (text.trim() === "") return { data: undefined, problems: [] };
    try {
        return { data: JSON.parse(text) as unknown, problems: [] };
    } catch {
        return {
            data: undefined,
            problems: [
                {
                    severity: "error",
                    source: "file",
                    key: "",
                    message: "config.json 不是合法的 JSON",
                },
            ],
        };
    }
}

/** Reads `config.json` from the data directory and resolves the settings. */
export function loadConfig(
    paths: Pick<RuntimePaths, "config">,
    input: Omit<ResolveConfigInput, "file" | "fileProblems"> = {}
): ResolvedConfig {
    const file = readConfigFile(paths.config);
    return resolveConfig({ ...input, file: file.data, fileProblems: file.problems });
}

/** The part of the settings that `shared/core` takes as its configuration. */
export function toCoreConfig(values: ConfigValues): CoreConfig {
    return { saltMetaUrl: values.saltmeta.url, lxnsBaseUrl: values.lxns.baseUrl };
}
