import type { JsonSchema } from "../src/commands/registry";
import type { ErrorCode } from "../src/errors";
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
import { isUtageGrade } from "@core/chart/difficulty";
import { getSaltNetMusicIdForChartType } from "@core/music/saltmeta";
import {
    calculateRating,
    createMusicChartMap,
    getB50Gain,
    selectB50Charts,
    sumChartRatings,
} from "@core/query/b50";
import { decodeUserDataBackup } from "@core/user/backup";
import { normalizeRatingHistory } from "@core/user/ratingHistory";
import { afterAll, expect, it } from "vitest";
import { allChartEntries } from "../src/catalog/chartQuery";
import { constantOf } from "../src/catalog/chartRow";
import { chartKeyOf } from "../src/catalog/songs";
import { createRegistry } from "../src/commands";
import { commandErrorCodes } from "../src/commands/describe";
import { parseArgv } from "../src/commands/parse";
import { exitCodeOf } from "../src/errors";
import { splitCommandLine } from "../src/util/shell";
import { expectConforms } from "../tests/dataSchema";
import { fixtureSongCatalog } from "../tests/fixtureCatalog";

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
        value: "https://callback.e2e.invalid/cb?lxns_auth_complete",
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
    cwd: string;
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

function processHome(seed?: string): { env: NodeJS.ProcessEnv; saltnetHome: string; cwd: string } {
    const root = path.join(sandbox, `process-${processNumber++}`);
    const saltnetHome = path.join(root, "saltnet-home");
    const userHome = path.join(root, "user-home");
    const cwd = path.join(root, "work");
    mkdirSync(userHome, { recursive: true });
    mkdirSync(cwd, { recursive: true });
    if (seed) cpSync(seed, saltnetHome, { recursive: true });
    else mkdirSync(saltnetHome, { recursive: true });
    const exampleBackup = path.join(saltnetHome, "example-backup.json");
    if (existsSync(exampleBackup)) cpSync(exampleBackup, path.join(cwd, "saltnet-backup.json"));

    return {
        saltnetHome,
        cwd,
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
    return runBundleAt(args, mode, processHome(seed));
}

function runBundleAt(
    args: readonly string[],
    mode: "serve" | "deny",
    home: { env: NodeJS.ProcessEnv; saltnetHome: string; cwd: string }
): RunResult {
    const result = spawnSync(process.execPath, ["--import", preload, bundle, ...args], {
        cwd: home.cwd,
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
        cwd: home.cwd,
    };
}

/** Runs a confirmation fix against the exact preview copy, without copying its database again. */
function runBundleInPlace(
    args: readonly string[],
    mode: "serve" | "deny",
    saltnetHome: string,
    cwd: string
): RunResult {
    const root = path.dirname(saltnetHome);
    return runBundleAt(args, mode, {
        saltnetHome,
        cwd,
        env: {
            ...baseEnvironment(),
            HOME: path.join(root, "user-home"),
            USERPROFILE: path.join(root, "user-home"),
            SALTNET_HOME: saltnetHome,
            SALTNET_SALTMETA_URL: SALTMETA_URL,
            SALTNET_LXNS_BASE_URL: LXNS_URL,
            SALTNET_API_URL: RUNTIME_SETTINGS["api.url"],
            SALTNET_API_FALLBACK_URL: RUNTIME_SETTINGS["api.fallbackUrl"],
            SALTNET_RENDER_URL: RUNTIME_SETTINGS["render.url"],
            TZ: "Asia/Shanghai",
        },
    });
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

function withoutOption(args: readonly string[], option: string): string[] {
    const kept: string[] = [];
    for (let index = 0; index < args.length; index++) {
        if (args[index] === option) index++;
        else if (!args[index].startsWith(`${option}=`)) kept.push(args[index]);
    }
    return kept;
}

function withoutFormat(args: readonly string[]): string[] {
    return withoutOption(args, "--format");
}

/** The row lists of a result: its `items`, or the `items` of each of its `groups`. */
function rowLists(data: unknown): unknown[][] {
    const { items, groups } = data as { items?: unknown[]; groups?: { items: unknown[] }[] };
    return items ? [items] : (groups ?? []).map(group => group.items);
}

/** A result without its rows: the part `--fields` leaves alone. */
function withoutRows(data: unknown): unknown {
    const {
        items: _items,
        groups,
        ...rest
    } = data as {
        items?: unknown;
        groups?: { items: unknown }[];
    };
    return { ...rest, groups: groups?.map(({ items: _rows, ...group }) => group) };
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

/** Builds the bundle the first time a test needs it, so that each test can also run on its own. */
function buildBundle(): void {
    if (existsSync(bundle)) return;
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
}

/** Runs `schema` and keeps the envelope schema it publishes, which `success` checks against. */
function readEnvelopeSchema(): RunResult {
    const index = runBundle(["schema", "--offline"], "deny");
    expect(index.status, index.stderr).toBe(0);
    const indexData = (JSON.parse(index.stdout) as { data: { envelope: { schema: JsonSchema } } })
        .data;
    envelopeSchema = indexData.envelope.schema;
    return index;
}

it("runs every bundled guide example from seeded fixtures without network", () => {
    writeFileSync(refusedLog, "");
    buildBundle();
    const index = readEnvelopeSchema();
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
    const fixtureBackupPath = path.resolve(repoRoot, "shared/core/fixtures/web-backup-v1.json");
    const importPreview = runBundle(["import", fixtureBackupPath], "deny", refresh.saltnetHome);
    expect(importPreview.status, "import preview status").toBe(6);
    expect(importPreview.stderr, "import preview stderr").toBe("");
    const importFailed = JSON.parse(importPreview.stdout) as {
        ok: boolean;
        error: { code: string; fix: string };
    };
    expect(importFailed.ok, "import preview ok").toBe(false);
    expect(importFailed.error.code, "import preview error code").toBe("CONFIRMATION_REQUIRED");
    if (!envelopeSchema) throw new Error("envelope schema has not been read yet");
    expectConforms(envelopeSchema, importFailed);
    const importFixArgs = splitCommandLine(importFailed.error.fix);
    expect(importFixArgs.shift(), "import fix saltnet").toBe("saltnet");
    const importConfirmed = runBundleInPlace(
        importFixArgs,
        "deny",
        importPreview.saltnetHome,
        importPreview.cwd
    );
    expect(success(importConfirmed, "seed import").command).toBe("import");
    const seedFavCreate = runBundle(["fav", "create", "练习"], "deny", importPreview.saltnetHome);
    expect(success(seedFavCreate, "seed fav create").command).toBe("fav create");
    const seedFavAdd = runBundle(
        ["fav", "add", "练习", "146-3"],
        "deny",
        seedFavCreate.saltnetHome
    );
    expect(success(seedFavAdd, "seed fav add").command).toBe("fav add");
    const seed = seedFavAdd.saltnetHome;
    const seedBackup = runBundleInPlace(
        ["export", path.join(seed, "example-backup.json")],
        "deny",
        seed,
        seedFavAdd.cwd
    );
    expect(success(seedBackup, "seed backup").command).toBe("export");

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

    const fixtureBackup = decodeUserDataBackup(JSON.parse(readFileSync(fixtureBackupPath, "utf8")));
    const catalog = fixtureSongCatalog();
    const entries = allChartEntries(catalog);
    const catalogCharts = entries.map(entry => entry.chart);
    const chartMap = createMusicChartMap(catalogCharts);
    const b50Options = { fitDiff: false, nb50: false, comboFilter: null, pc50: false } as const;
    const user0B50 = selectB50Charts(fixtureBackup.users[0].data, chartMap, b50Options);
    const user1B50 = selectB50Charts(fixtureBackup.users[1].data, chartMap, b50Options);

    const userList = success(runBundle(["user", "list", "--offline"], "deny", seed), "user list");
    expect(userList.command).toBe("user list");
    expectConforms(schemaOf("user list"), userList.data);
    const userListItems = (userList.data as { items: { index: number; uid: string }[] }).items;
    expect(userListItems).toHaveLength(fixtureBackup.users.length);
    expect(userListItems.map(item => item.uid)).toEqual(fixtureBackup.users.map(u => u.uid));
    expect(userListItems.map(item => item.index)).toEqual([0, 1]);

    const ratingDefault = success(runBundle(["rating", "--offline"], "deny", seed), "rating");
    expect(ratingDefault.command).toBe("rating");
    expectConforms(schemaOf("rating"), ratingDefault.data);
    expect((ratingDefault.data as { rating: number | null }).rating).toBe(
        fixtureBackup.users[0].data.rating ?? null
    );

    const ratingUser1 = success(
        runBundle(["rating", "--user", "1", "--offline"], "deny", seed),
        "rating --user 1"
    );
    expect(ratingUser1.command).toBe("rating");
    expectConforms(schemaOf("rating"), ratingUser1.data);
    expect((ratingUser1.data as { rating: number | null }).rating).toBe(
        fixtureBackup.users[1].data.rating ?? null
    );

    const ratingHistory = success(
        runBundle(["rating", "--history", "--offline"], "deny", seed),
        "rating --history"
    );
    expect(ratingHistory.command).toBe("rating");
    expectConforms(schemaOf("rating"), ratingHistory.data);
    const expectedHistory = normalizeRatingHistory(fixtureBackup.users[0]);
    const historyRows = (
        ratingHistory.data as {
            history: { rating: number; change: number | null }[];
        }
    ).history;
    expect(historyRows).toHaveLength(expectedHistory.length);
    expect(historyRows.map(row => row.rating)).toEqual(expectedHistory.map(entry => entry.rating));
    expect(historyRows.map(row => row.change)).toEqual(
        expectedHistory.map((entry, index) =>
            index === 0 ? null : entry.rating - expectedHistory[index - 1].rating
        )
    );

    const b50Default = success(runBundle(["b50", "--offline"], "deny", seed), "b50");
    expect(b50Default.command).toBe("b50");
    expectConforms(schemaOf("b50"), b50Default.data);
    const b50DefaultData = b50Default.data as {
        rating: { b35: number; b15: number; total: number };
        groups: { key: string; items: { chartKey: string }[] }[];
    };
    const expectedB35Rating = sumChartRatings(user0B50.old);
    const expectedB15Rating = sumChartRatings(user0B50.newer);
    expect(b50DefaultData.rating.b35).toBe(expectedB35Rating);
    expect(b50DefaultData.rating.b15).toBe(expectedB15Rating);
    expect(b50DefaultData.rating.total).toBe(expectedB35Rating + expectedB15Rating);
    const b50B35Group = b50DefaultData.groups.find(group => group.key === "B35")!;
    const b50B15Group = b50DefaultData.groups.find(group => group.key === "B15")!;
    expect(b50B35Group.items.map(item => item.chartKey)).toEqual(user0B50.old.map(chartKeyOf));
    expect(b50B15Group.items.map(item => item.chartKey)).toEqual(user0B50.newer.map(chartKeyOf));

    const b50User1Result = runBundle(["b50", "--user", "1", "--offline"], "deny", seed);
    const b50User1 = success(b50User1Result, "b50 --user 1");
    expect(b50User1.command).toBe("b50");
    expectConforms(schemaOf("b50"), b50User1.data);
    const b50User1Data = b50User1.data as {
        rating: { b35: number; b15: number; total: number };
        groups: { key: string; items: { chartKey: string }[] }[];
    };
    const expectedUser1B35Rating = sumChartRatings(user1B50.old);
    const expectedUser1B15Rating = sumChartRatings(user1B50.newer);
    expect(b50User1Data.rating.b35).toBe(expectedUser1B35Rating);
    expect(b50User1Data.rating.b15).toBe(expectedUser1B15Rating);
    expect(b50User1Data.rating.total).toBe(expectedUser1B35Rating + expectedUser1B15Rating);
    const user1B35Group = b50User1Data.groups.find(group => group.key === "B35")!;
    const user1B15Group = b50User1Data.groups.find(group => group.key === "B15")!;
    expect(user1B35Group.items.map(item => item.chartKey)).toEqual(user1B50.old.map(chartKeyOf));
    expect(user1B15Group.items.map(item => item.chartKey)).toEqual(user1B50.newer.map(chartKeyOf));
    const b50User1Envelope = JSON.parse(b50User1Result.stdout) as { warnings?: { code: string }[] };
    expect(b50User1Envelope.warnings).toEqual([
        expect.objectContaining({ code: "PARTIAL_SCORES" }),
    ]);

    const historyAll = success(
        runBundle(["history", "--all-changes", "--offline"], "deny", seed),
        "history --all-changes"
    );
    expect(historyAll.command).toBe("history");
    expectConforms(schemaOf("history"), historyAll.data);
    const historyAllItems = (historyAll.data as { items: { chartKey: string }[] }).items;
    expect(historyAllItems).toHaveLength(4);
    expect(historyAllItems.map(item => item.chartKey)).toEqual(["131-4", "58-4", "70-4", "131-4"]);

    // No fixture event changes only the play count: the second event of 131-4 is marked as an
    // achievement change (mask 1, not `ScoreHistoryChange.PlayCount`, 16), so the default list
    // hides nothing. Hiding is covered by `tests/commands/history.test.ts`.
    const historyDefault = success(runBundle(["history", "--offline"], "deny", seed), "history");
    expect(historyDefault.command).toBe("history");
    expect(historyDefault.data).toEqual(historyAll.data);

    const chartsAchieved = success(
        runBundle(["charts", "--achieved", "sss", "--limit", "1000", "--offline"], "deny", seed),
        "charts --achieved sss --limit 1000"
    );
    expect(chartsAchieved.command).toBe("charts");
    expectConforms(schemaOf("charts"), chartsAchieved.data);
    const achievedItems = (
        chartsAchieved.data as { items: { chartKey: string; score: { achievements: number } }[] }
    ).items;
    expect(achievedItems.length).toBeGreaterThan(0);
    for (const row of achievedItems) {
        expect(row.score.achievements).toBeGreaterThanOrEqual(100);
    }
    const expectedSssCount = Object.values(fixtureBackup.users[0].data.detailed ?? {}).filter(
        record => {
            if (record.achievements < 100) return false;
            const musicId = getSaltNetMusicIdForChartType(record.song_id, record.type);
            const chart = chartMap.get(`${musicId}-${record.level_index}`);
            return chart !== undefined && !isUtageGrade(chart.info.grade);
        }
    ).length;
    expect(achievedItems).toHaveLength(expectedSssCount);

    const targetChartKey = "131-4";
    const targetChart = chartMap.get(targetChartKey)!;
    const targetRecord = fixtureBackup.users[0].data.detailed![targetChartKey];
    const chartDetail = success(
        runBundle(["chart", targetChartKey, "--offline"], "deny", seed),
        `chart ${targetChartKey}`
    );
    expect(chartDetail.command).toBe("chart");
    expectConforms(schemaOf("chart"), chartDetail.data);
    const chartDetailData = chartDetail.data as {
        score: {
            achievements: number | null;
            rank: string | null;
            combo: string | null;
            sync: string | null;
            dxScore: number | null;
        } | null;
        stages: { rating: number; gain: number | null }[];
    };
    expect(chartDetailData.score).toMatchObject({
        achievements: targetRecord.achievements,
        rank: "SSS",
        combo: "FC",
        sync: "FS",
        dxScore: targetRecord.dxScore,
    });
    expect(chartDetailData.stages.length).toBeGreaterThan(0);
    for (const stage of chartDetailData.stages) {
        expect(stage.gain).toBe(getB50Gain(user0B50, targetChart, stage.rating));
    }

    const calcResult = success(
        runBundle(["calc", targetChartKey, "--achievements", "100.5", "--offline"], "deny", seed),
        `calc ${targetChartKey} --achievements 100.5`
    );
    expect(calcResult.command).toBe("calc");
    expectConforms(schemaOf("calc"), calcResult.data);
    const calcData = calcResult.data as { rating: number | null; gain: number | null };
    const targetConstant = constantOf(targetChart)!;
    const expectedCalcRating = calculateRating(100.5, targetConstant);
    expect(calcData.rating).toBe(expectedCalcRating);
    expect(calcData.gain).toBe(getB50Gain(user0B50, targetChart, expectedCalcRating));

    const chartsGain = success(
        runBundle(["charts", "--sort", "gain", "--limit", "10", "--offline"], "deny", seed),
        "charts --sort gain --limit 10"
    );
    expect(chartsGain.command).toBe("charts");
    expectConforms(schemaOf("charts"), chartsGain.data);
    const gainItems = (chartsGain.data as { items: { chartKey: string; gain: number | null }[] })
        .items;
    expect(gainItems).toHaveLength(10);
    for (const item of gainItems) {
        const itemChart = chartMap.get(item.chartKey)!;
        const itemConstant = constantOf(itemChart);
        const expectedGain =
            itemConstant === null
                ? null
                : getB50Gain(user0B50, itemChart, calculateRating(100.5, itemConstant));
        expect(item.gain).toBe(expectedGain);
    }
    for (let i = 1; i < gainItems.length; i++) {
        const prev = gainItems[i - 1].gain ?? -Infinity;
        const curr = gainItems[i].gain ?? -Infinity;
        expect(prev).toBeGreaterThanOrEqual(curr);
    }

    // The fixture's made-up ratings (about 100000 each) fill both sections of user 0 and leave no
    // new chart outside user 1's B15, so every gain of theirs is 0. A user without scores has an
    // empty B50, where every chart gains its whole rating at any stage: a copy of the seed gets
    // one, so a wrong gain or target shows.
    const blank = runBundle(["user", "add", "--remark", "空白"], "deny", seed);
    expect(success(blank, "user add 空白").command).toBe("user add");
    const inBlank = (args: string[]) =>
        success(
            runBundleInPlace(
                [...args, "--user", "2", "--offline"],
                "deny",
                blank.saltnetHome,
                blank.cwd
            ),
            `${args.join(" ")} --user 2`
        );
    const blankStages = (
        inBlank(["chart", targetChartKey]).data as {
            stages: { rating: number; gain: number | null }[];
        }
    ).stages;
    expect(blankStages.length).toBeGreaterThan(0);
    for (const stage of blankStages) expect(stage.gain).toBe(stage.rating);
    expect(blankStages.some(stage => stage.rating > 0)).toBe(true);

    const blankCalc = inBlank(["calc", targetChartKey, "--achievements", "100.5"]);
    expectConforms(schemaOf("calc"), blankCalc.data);
    expect(blankCalc.data).toMatchObject({ rating: expectedCalcRating, gain: expectedCalcRating });

    const blankGains = inBlank(["charts", "--sort", "gain", "--limit", "10"]);
    expectConforms(schemaOf("charts"), blankGains.data);
    const expectedTopGains = catalogCharts
        .filter(chart => !isUtageGrade(chart.info.grade) && constantOf(chart) !== null)
        .map(chart => calculateRating(100.5, constantOf(chart)!))
        .sort((a, b) => b - a)
        .slice(0, 10);
    expect(expectedTopGains[0]).toBeGreaterThan(0);
    expect(
        (blankGains.data as { items: { gain: number | null }[] }).items.map(item => item.gain)
    ).toEqual(expectedTopGains);

    const collectionShow = success(
        runBundle(["collection", "show", "plate:6148", "--all", "--offline"], "deny", seed),
        "collection show plate:6148 --all"
    );
    expect(collectionShow.command).toBe("collection show");
    expectConforms(schemaOf("collection show"), collectionShow.data);
    // Every record of user 0 is SSS with FC and FS: 覇者 (rank A) is done exactly on the charts
    // they have a record of, 真神 (AP) on none of them.
    const user0RecordKeys = new Set(
        Object.values(fixtureBackup.users[0].data.detailed ?? {}).map(
            record =>
                `${getSaltNetMusicIdForChartType(record.song_id, record.type)}-${record.level_index}`
        )
    );
    const showItems = (collectionShow.data as { items: { chartKey: string; done: unknown }[] })
        .items;
    expect(showItems.length).toBeGreaterThan(0);
    for (const item of showItems) {
        expect(item.done, item.chartKey).toBe(user0RecordKeys.has(item.chartKey));
    }
    expect(showItems.some(item => item.done === true)).toBe(true);
    const apPlate = success(
        runBundle(["collection", "show", "plate:6102", "--all", "--offline"], "deny", seed),
        "collection show plate:6102 --all"
    );
    expectConforms(schemaOf("collection show"), apPlate.data);
    const apItems = (apPlate.data as { items: { chartKey: string; done: unknown }[] }).items;
    expect(apItems.length).toBeGreaterThan(0);
    for (const item of apItems) expect(item.done, item.chartKey).toBe(false);

    const favCharts = success(
        runBundle(["charts", "--fav", "练习", "--offline"], "deny", seed),
        "charts --fav 练习"
    );
    expect(favCharts.command).toBe("charts");
    expectConforms(schemaOf("charts"), favCharts.data);
    const favItems = (favCharts.data as { items: { chartKey: string; musicId: number }[] }).items;
    expect(favItems.length).toBeGreaterThan(0);
    for (const item of favItems) {
        expect(item.musicId).toBe(146);
    }
    const expectedMusic146Keys = entries
        .filter(entry => entry.chart.music.id === 146)
        .map(entry => chartKeyOf(entry.chart))
        .sort();
    expect(favItems.map(item => item.chartKey).sort()).toEqual(expectedMusic146Keys);

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

    // Rows that `--fields` examples printed; some may print none (`history --since 7d` once the
    // fixture's events are older than that), but not all of them.
    let projectedRows = 0;
    for (const example of examples) {
        const args = splitCommandLine(example);
        const name = commandName(args);
        const line = `saltnet ${example}`;
        const isRefresh = name === "refresh";
        const runArgs = isRefresh ? args : [...args, "--offline"];
        let result = runBundle(runArgs, isRefresh ? "serve" : "deny", seed);
        const format = requestedFormat(args);
        if (result.status === 6) {
            const command = registry.find(name);
            expect(command?.spec.errors, line).toContain("CONFIRMATION_REQUIRED");
            expect(result.stderr, line).toBe("");
            const failed = JSON.parse(result.stdout) as {
                ok: boolean;
                error: { code: string; fix: string };
            };
            expect(failed.ok, line).toBe(false);
            expect(failed.error.code, line).toBe("CONFIRMATION_REQUIRED");
            expectConforms(envelopeSchema, failed);
            const fixArgs = splitCommandLine(failed.error.fix);
            expect(fixArgs.shift(), line).toBe("saltnet");
            result = runBundleInPlace(fixArgs, "deny", result.saltnetHome, result.cwd);
        }
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
            // `guide --skill` is the same guide after the skill's frontmatter.
            const frontmatter = args.includes("--skill")
                ? /^---\nname: saltnet\ndescription: "[^\n]*"\n---\n\n/.exec(result.stdout)
                : null;
            if (args.includes("--skill")) expect(frontmatter, line).not.toBeNull();
            expect(result.stdout.slice(frontmatter?.[0].length ?? 0), line).toBe(guide.stdout);
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
        const fields = requestedFields(args);
        if (fields) {
            // The published schema describes whole rows: the same command without `--fields` must
            // conform to it, and the projected rows must hold exactly the requested fields of its
            // rows, everything else unchanged.
            const whole = success(
                runBundle(withoutOption(runArgs, "--fields"), "deny", seed),
                `${line} without --fields`
            );
            expectConforms(schemaOf(name), whole.data);
            expect(withoutRows(envelope.data), line).toEqual(withoutRows(whole.data));
            const projectedLists = rowLists(envelope.data);
            const wholeLists = rowLists(whole.data);
            expect(
                projectedLists.map(rows => rows.length),
                line
            ).toEqual(wholeLists.map(rows => rows.length));
            projectedRows += projectedLists.flat().length;
            const topLevel = [...new Set(fields.map(field => field.split(".")[0]))].sort();
            projectedLists.forEach((rows, listIndex) => {
                rows.forEach((row, rowIndex) => {
                    expect(Object.keys(row as object).sort(), line).toEqual(topLevel);
                    for (const field of fields) {
                        expect(valueAt(row, field), `${line}: ${field}`).toEqual(
                            valueAt(wholeLists[listIndex][rowIndex], field)
                        );
                    }
                });
            });
            continue;
        }
        expectConforms(schemaOf(name), envelope.data);
    }
    expect(projectedRows).toBeGreaterThan(0);
});

/**
 * An agent's first commands run on a machine with nothing set up, and each failure there must tell
 * it what to do next with a command that runs as printed.
 */
it("runs every guide example on an empty data directory and fails only with published errors", () => {
    buildBundle();
    if (!envelopeSchema) readEnvelopeSchema();

    const guide = runBundle(["guide", "--offline"], "deny");
    expect(guide.status, "guide").toBe(0);
    expect(guide.stderr, "guide").toBe("");
    expect(guide.stdout.startsWith("# ")).toBe(true);
    const examples = guideExamples(guide.stdout);
    const expectedExamples = registry.commands.reduce(
        (count, command) => count + (command.spec.examples?.length ?? 0),
        0
    );
    expect(examples).toHaveLength(expectedExamples);

    let succeededCount = 0;
    const failureCodes = new Set<ErrorCode>();

    function checkOutcome(
        result: RunResult,
        args: readonly string[],
        line: string,
        mode: "serve" | "deny"
    ): { status: number; errorCode?: ErrorCode } {
        const name = commandName(args);
        const format = requestedFormat(args);

        if (result.status === 0) {
            if (name === "guide") {
                expect(result.stderr, line).toBe("");
                const frontmatter = args.includes("--skill")
                    ? /^---\nname: saltnet\ndescription: "[^\n]*"\n---\n\n/.exec(result.stdout)
                    : null;
                if (args.includes("--skill")) expect(frontmatter, line).not.toBeNull();
                expect(result.stdout.slice(frontmatter?.[0].length ?? 0), line).toBe(guide.stdout);
            } else if (format === "tsv" || format === "text") {
                expect(
                    result.stderr === "" ||
                        result.stderr
                            .split("\n")
                            .filter(Boolean)
                            .every(comment => comment.startsWith("# ")),
                    line
                ).toBe(true);
            } else {
                success(result, line);
            }
            return { status: 0 };
        }

        expect(result.stderr, line).toBe("");
        const failed = JSON.parse(result.stdout) as {
            v: number;
            ok: boolean;
            command: string | null;
            error: { code: ErrorCode; fix?: string; [key: string]: unknown };
        };
        expect(failed.v, line).toBe(1);
        expect(failed.ok, line).toBe(false);
        if (!envelopeSchema) throw new Error(`${line}: the envelope schema has not been read yet`);
        expectConforms(envelopeSchema, failed);

        const command = registry.find(name);
        expect(command, line).toBeDefined();
        const published = commandErrorCodes(command!.spec);
        expect(published, line).toContain(failed.error.code);
        expect(failed.error.code, line).not.toBe("INTERNAL");
        expect(result.status, line).toBe(exitCodeOf(failed.error.code));

        if (failed.error.fix !== undefined) {
            expect(failed.error.fix.startsWith("saltnet "), `${line} fix prefix`).toBe(true);
            const fixWords = splitCommandLine(failed.error.fix);
            expect(fixWords[0], `${line} fix saltnet`).toBe("saltnet");
            const fixArgs = fixWords.slice(1);
            const parsed = parseArgv(registry, fixArgs);
            expect(parsed.kind, `${line} fix runnable: ${failed.error.fix}`).toBe("run");

            if (failed.error.code === "CONFIRMATION_REQUIRED") {
                const fixResult = runBundleInPlace(fixArgs, mode, result.saltnetHome, result.cwd);
                checkOutcome(fixResult, fixArgs, failed.error.fix, mode);
            }
        }

        return { status: result.status!, errorCode: failed.error.code };
    }

    for (const example of examples) {
        const args = splitCommandLine(example);
        const name = commandName(args);
        const line = `saltnet ${example}`;
        const isRefresh = name === "refresh";
        const runArgs = isRefresh ? args : [...args, "--offline"];
        const mode = isRefresh ? "serve" : "deny";
        const result = runBundle(runArgs, mode);
        const outcome = checkOutcome(result, args, line, mode);
        if (outcome.status === 0) succeededCount++;
        if (outcome.errorCode) failureCodes.add(outcome.errorCode);
    }

    expect(succeededCount).toBeGreaterThan(0);
    // With no data, the commands that need the catalog say there is no cache and the commands
    // that need a user say there is no user.
    expect(failureCodes).toContain("OFFLINE_NO_CACHE");
    expect(failureCodes).toContain("NO_USER");

    const refused = existsSync(refusedLog) ? readFileSync(refusedLog, "utf8") : "";
    expect(refused).toBe("");
});
