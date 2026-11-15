import type { JsonSchema } from "../src/commands/registry";
import { spawnSync } from "node:child_process";
import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { afterAll, expect, it } from "vitest";
import { createRegistry } from "../src/commands";
import { splitCommandLine } from "../src/util/shell";
import { expectConforms } from "../tests/dataSchema";

const SALTMETA_URL = "https://meta.e2e.invalid/saltmeta.json";
const LXNS_URL = "https://lxns.e2e.invalid";
/** A hung child must fail the test: `spawnSync` blocks, so Vitest's own timeout cannot stop it. */
const CHILD_TIMEOUT_MS = 60_000;
/** The made-up `.env` values the bundle is built with, and the setting each one is the default of. */
const BUILD_DEFAULTS = [
    { variable: "VITE_API_URL", key: "api.url", value: "https://api.e2e.invalid" },
    {
        variable: "VITE_API_FALLBACK_URL",
        key: "api.fallbackUrl",
        value: "https://fallback.e2e.invalid",
    },
    {
        variable: "VITE_TAKUMI_RENDERER_URL",
        key: "render.url",
        value: "https://render.e2e.invalid",
    },
    { variable: "VITE_LXNS_OAUTH_CLIENT_ID", key: "lxns.clientId", value: "e2e-client-id" },
    {
        variable: "VITE_LXNS_OAUTH_REDIRECT_URI",
        key: "lxns.redirectUri",
        value: "https://callback.e2e.invalid/cb",
    },
] as const;
/** The settings every child overrides with an environment variable. */
const RUNTIME_SETTINGS: Readonly<Record<string, string>> = {
    "api.url": "https://api.runtime.e2e.invalid",
    "api.fallbackUrl": "https://fallback.runtime.e2e.invalid",
    "render.url": "https://render.runtime.e2e.invalid",
};
const KEPT_ENVIRONMENT = [
    "PATH",
    "SystemRoot",
    "SYSTEMROOT",
    "ComSpec",
    "COMSPEC",
    "PATHEXT",
    "WINDIR",
    "TEMP",
    "TMP",
    "TMPDIR",
    "LANG",
    "LC_ALL",
] as const;

interface SuccessEnvelope {
    v: number;
    ok: boolean;
    command: string;
    data: unknown;
}

interface RunResult {
    status: number | null;
    stdout: string;
    stderr: string;
    saltnetHome: string;
}

const cliDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(cliDir, "..");
const preload = path.join(cliDir, "e2e", "fetch-preload.mjs");
const registry = createRegistry();
const sandbox = mkdtempSync(path.join(tmpdir(), "saltnet-cli-e2e-"));
const bundle = path.join(sandbox, "bundle", "saltnet.mjs");
const refusedLog = path.join(sandbox, "refused-fetches.log");
let processNumber = 0;

function baseEnvironment(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const key of KEPT_ENVIRONMENT) {
        const value = process.env[key];
        if (value !== undefined) env[key] = value;
    }
    return env;
}

function processHome(seed?: string): { env: NodeJS.ProcessEnv; saltnetHome: string } {
    const root = path.join(sandbox, `process-${processNumber++}`);
    const saltnetHome = path.join(root, "saltnet-home");
    const userHome = path.join(root, "user-home");
    mkdirSync(userHome, { recursive: true });
    if (seed) cpSync(seed, saltnetHome, { recursive: true });
    else mkdirSync(saltnetHome, { recursive: true });

    return {
        saltnetHome,
        env: {
            ...baseEnvironment(),
            HOME: userHome,
            USERPROFILE: userHome,
            SALTNET_HOME: saltnetHome,
            SALTNET_SALTMETA_URL: SALTMETA_URL,
            SALTNET_LXNS_BASE_URL: LXNS_URL,
            SALTNET_API_URL: RUNTIME_SETTINGS["api.url"],
            SALTNET_API_FALLBACK_URL: RUNTIME_SETTINGS["api.fallbackUrl"],
            SALTNET_RENDER_URL: RUNTIME_SETTINGS["render.url"],
            TZ: "Asia/Shanghai",
        },
    };
}

function runBundle(args: readonly string[], mode: "serve" | "deny", seed?: string): RunResult {
    const home = processHome(seed);
    const result = spawnSync(process.execPath, ["--import", preload, bundle, ...args], {
        cwd: repoRoot,
        env: {
            ...home.env,
            E2E_FETCH_MODE: mode,
            E2E_REFUSED_LOG: refusedLog,
            E2E_SALTMETA_URL: SALTMETA_URL,
            E2E_LXNS_BASE_URL: LXNS_URL,
        },
        encoding: "utf8",
        timeout: CHILD_TIMEOUT_MS,
    });
    if (result.error) throw result.error;
    return {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        saltnetHome: home.saltnetHome,
    };
}

/** The envelope schema the bundle publishes; read before any other command runs. */
let envelopeSchema: JsonSchema | undefined;

function success(result: RunResult, label: string): SuccessEnvelope {
    expect(result.status, label).toBe(0);
    expect(result.stderr, label).toBe("");
    const parsed = JSON.parse(result.stdout) as SuccessEnvelope;
    expect(parsed.v, label).toBe(1);
    expect(parsed.ok, label).toBe(true);
    if (!envelopeSchema) throw new Error(`${label}: the envelope schema has not been read yet`);
    expectConforms(envelopeSchema, parsed);
    return parsed;
}

function guideExamples(markdown: string): string[] {
    const examples: string[] = [];
    let inBash = false;
    for (const line of markdown.split("\n")) {
        if (line === "```bash") {
            inBash = true;
        } else if (inBash && line === "```") {
            inBash = false;
        } else if (inBash && line !== "" && !line.startsWith("#")) {
            expect(line.startsWith("saltnet "), line).toBe(true);
            examples.push(line.slice("saltnet ".length));
        }
    }
    expect(inBash).toBe(false);
    return examples;
}

function commandName(args: readonly string[]): string {
    const command = [...registry.commands]
        .sort((left, right) => right.words.length - left.words.length)
        .find(candidate => candidate.words.every((word, index) => args[index] === word));
    if (!command) throw new Error(`no command for example: ${args.join(" ")}`);
    return command.spec.name;
}

function requestedFormat(args: readonly string[]): string | undefined {
    const index = args.findIndex(arg => arg === "--format");
    if (index !== -1) return args[index + 1];
    return args.find(arg => arg.startsWith("--format="))?.slice("--format=".length);
}

function requestedFields(args: readonly string[]): string[] | undefined {
    const index = args.findIndex(arg => arg === "--fields");
    if (index !== -1) return args[index + 1]?.split(",");
    return args
        .find(arg => arg.startsWith("--fields="))
        ?.slice("--fields=".length)
        .split(",");
}

function withoutFormat(args: readonly string[]): string[] {
    const kept: string[] = [];
    for (let index = 0; index < args.length; index++) {
        if (args[index] === "--format") index++;
        else if (!args[index].startsWith("--format=")) kept.push(args[index]);
    }
    return kept;
}

/** A TSV cell as design 4.2 writes it: empty for null, JSON for objects, escaped tabs and newlines. */
function cellText(value: unknown): string {
    let text: string;
    if (value === null || value === undefined) text = "";
    else if (typeof value === "string") text = value;
    else if (typeof value === "number" || typeof value === "boolean") text = String(value);
    else text = JSON.stringify(value);
    return text
        .replaceAll("\\", "\\\\")
        .replaceAll("\t", "\\t")
        .replaceAll("\n", "\\n")
        .replaceAll("\r", "\\r");
}

function valueAt(row: unknown, column: string): unknown {
    let value = row;
    for (const segment of column.split(".")) {
        value =
            value !== null && typeof value === "object"
                ? (value as Record<string, unknown>)[segment]
                : undefined;
    }
    return value;
}

afterAll(() => {
    const refused = existsSync(refusedLog) ? readFileSync(refusedLog, "utf8") : "";
    try {
        expect(refused).toBe("");
    } finally {
        rmSync(sandbox, { recursive: true, force: true });
    }
});

it("runs every bundled guide example from seeded fixtures without network", () => {
    writeFileSync(refusedLog, "");

    const buildHome = processHome();
    const build = spawnSync(process.execPath, ["cli/build.mjs", "--outfile", bundle], {
        cwd: repoRoot,
        env: {
            ...buildHome.env,
            ...Object.fromEntries(BUILD_DEFAULTS.map(({ variable, value }) => [variable, value])),
        },
        encoding: "utf8",
        timeout: CHILD_TIMEOUT_MS,
    });
    if (build.error) throw build.error;
    expect(build.status, build.stderr).toBe(0);
    expect(build.stderr).toBe("");
    expect(build.stdout.trimEnd().split("\n").at(-1)).toMatch(/saltnet\.mjs$/);
    expect(existsSync(bundle)).toBe(true);

    const index = runBundle(["schema", "--offline"], "deny");
    expect(index.status, index.stderr).toBe(0);
    const indexData = (JSON.parse(index.stdout) as { data: { envelope: { schema: JsonSchema } } })
        .data;
    envelopeSchema = indexData.envelope.schema;
    success(index, "schema");

    const schemas = new Map<string, JsonSchema>();
    for (const command of registry.commands) {
        const name = command.spec.name;
        const schemaArgs = ["schema", ...name.split(" "), "--offline"];
        const envelope = success(runBundle(schemaArgs, "deny"), `schema ${name}`);
        const data = envelope.data as { data: JsonSchema };
        schemas.set(name, data.data);
    }
    const schemaOf = (name: string): JsonSchema => {
        const schema = schemas.get(name);
        if (!schema) throw new Error(`no published schema for ${name}`);
        return schema;
    };

    const settings = success(runBundle(["config", "list", "--offline"], "deny"), "config list");
    expectConforms(schemaOf("config list"), settings.data);
    const rows = (
        settings.data as {
            items: { key: string; value: unknown; source: string; default: unknown }[];
        }
    ).items;
    for (const { key, value } of BUILD_DEFAULTS) {
        const row = rows.find(candidate => candidate.key === key);
        const runtime = RUNTIME_SETTINGS[key];
        expect(row?.default, key).toBe(value);
        expect(row?.value, key).toBe(runtime ?? value);
        expect(row?.source, key).toBe(runtime === undefined ? "build" : "env");
    }

    const refresh = runBundle(["refresh"], "serve");
    expect(success(refresh, "refresh").command).toBe("refresh");
    const seed = refresh.saltnetHome;

    const status = success(runBundle(["status", "--offline"], "deny", seed), "offline status");
    expectConforms(schemaOf("status"), status.data);
    const statusData = status.data as {
        metadata: { catalog: { state: string }; collections: { state: string } };
    };
    expect(statusData.metadata.catalog.state).toBe("fresh");
    expect(statusData.metadata.collections.state).toBe("fresh");

    const chartsLine = "charts --level 13+ --diff mas --offline";
    const charts = success(runBundle(chartsLine.split(" "), "deny", seed), chartsLine);
    expect(charts.command).toBe("charts");
    expectConforms(schemaOf("charts"), charts.data);
    const chartItems = (charts.data as { items: { level: string; difficulty: string }[] }).items;
    expect(chartItems.length, chartsLine).toBeGreaterThan(0);
    for (const item of chartItems)
        expect(item, chartsLine).toMatchObject({ level: "13+", difficulty: "MASTER" });

    const search = success(runBundle(["search", "39", "--offline"], "deny", seed), "search 39");
    expect(search.command).toBe("search");
    expectConforms(schemaOf("search"), search.data);
    const [best] = (
        search.data as { items: { musicId: number; title: string; matchedBy: string[] }[] }
    ).items;
    expect(best, "search 39").toMatchObject({ musicId: 146, title: "39" });
    expect(best.matchedBy, "search 39").toContain("title");

    const guide = runBundle(["guide"], "deny", seed);
    expect(guide.status, "guide").toBe(0);
    expect(guide.stderr, "guide").toBe("");
    expect(guide.stdout.startsWith("# ")).toBe(true);
    const examples = guideExamples(guide.stdout);
    const expectedExamples = registry.commands.reduce(
        (count, command) => count + (command.spec.examples?.length ?? 0),
        0
    );
    expect(examples).toHaveLength(expectedExamples);

    for (const example of examples) {
        const args = splitCommandLine(example);
        const name = commandName(args);
        const line = `saltnet ${example}`;
        const isRefresh = name === "refresh";
        const runArgs = isRefresh ? args : [...args, "--offline"];
        const result = runBundle(runArgs, isRefresh ? "serve" : "deny", seed);
        const format = requestedFormat(args);
        expect(result.status, line).toBe(0);
        if (format === "tsv") {
            expect(
                result.stderr
                    .split("\n")
                    .filter(Boolean)
                    .every(comment => comment.startsWith("# ")),
                line
            ).toBe(true);
        } else {
            expect(result.stderr, line).toBe("");
        }

        if (name === "guide") {
            expect(result.stdout.startsWith("# "), line).toBe(true);
            continue;
        }

        if (format === "tsv") {
            // The same rows as JSON, so the table is checked cell by cell. `--fields` projects the
            // rows, so only the envelope is checked against a schema here, not the data.
            const asJson = success(
                runBundle([...withoutFormat(runArgs), "--format", "json"], "deny", seed),
                `${line} as json`
            );
            const jsonRows = (asJson.data as { items: unknown[] }).items;
            const lines = result.stdout.split("\n");
            expect(lines.pop(), line).toBe("");
            const columns = (lines.shift() ?? "").split("\t");
            const fields = requestedFields(args);
            if (fields) expect(columns, line).toEqual(fields);
            expect(jsonRows.length, line).toBeGreaterThan(0);
            expect(lines, line).toEqual(
                jsonRows.map(row =>
                    columns.map(column => cellText(valueAt(row, column))).join("\t")
                )
            );
            continue;
        }

        if (format === "text") {
            expect(result.stdout, line).not.toBe("");
            expect(() => JSON.parse(result.stdout), line).toThrow();
            continue;
        }

        const envelope = success(result, line);
        expect(envelope.command, line).toBe(name);
        expectConforms(schemaOf(name), envelope.data);
    }
});
