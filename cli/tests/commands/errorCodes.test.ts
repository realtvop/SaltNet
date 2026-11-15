import type { RuntimePaths } from "../../src/runtime/paths";
import type { StoreOptions } from "../../src/store/store";
import type { Route } from "../mockHttp";
import { describe, expect, it, vi } from "vitest";
import { METADATA_LOCK } from "../../src/catalog/refresh";
import { createRegistry } from "../../src/commands";
import { commandErrorCodes } from "../../src/commands/describe";
import { acquireLock } from "../../src/store/locks";
import { openStore } from "../../src/store/store";
import { splitCommandLine } from "../../src/util/shell";
import { commandIn, LXNS_URL, META_URL, NOW, routes } from "../commandRun";
import { createHarness, run } from "../harness";
import { mockFetch, textResponse } from "../mockHttp";
import { useTempHome } from "../tempHome";

vi.mock("../../src/store/store", async importOriginal => {
    const actual = await importOriginal<typeof import("../../src/store/store")>();
    return {
        ...actual,
        openStore: (paths: RuntimePaths, options: StoreOptions = {}) =>
            actual.openStore(paths, {
                ...options,
                busyTimeoutMs: options.busyTimeoutMs ?? 25,
            }),
    };
});

const makeHome = useTempHome();
const registry = createRegistry();

interface RunResult {
    readonly code: number;
    readonly json?: { readonly error?: { readonly code?: string } };
}

async function runLine(
    paths: RuntimePaths,
    line: string,
    options: { readonly offline?: boolean; readonly network?: Record<string, Route> }
): Promise<RunResult> {
    const harness = createHarness({
        env: {
            SALTNET_HOME: paths.home,
            SALTNET_SALTMETA_URL: META_URL,
            SALTNET_LXNS_BASE_URL: LXNS_URL,
        },
        fetch: mockFetch(options.network ?? {}),
    });
    const argv = splitCommandLine(line);
    if (options.offline) argv.push("--offline");
    const code = await run(registry, harness, ...argv);
    let json: RunResult["json"];
    try {
        json = JSON.parse(harness.stdout()) as RunResult["json"];
    } catch {
        // Text and TSV successes are intentionally not JSON.
    }
    return { code, json };
}

function serverErrors(): Record<string, Route> {
    return Object.fromEntries(
        Object.keys(routes()).map(url => [url, textResponse("upstream", 500)])
    );
}

async function withMetadataLock(line: string): Promise<RunResult> {
    const home = makeHome();
    const holder = openStore(home);
    const acquisition = acquireLock(holder, METADATA_LOCK, {
        ttlMs: 60_000,
        now: () => NOW.getTime(),
    });
    expect(acquisition.acquired).toBe(true);
    try {
        return await runLine(home, line, { network: routes() });
    } finally {
        holder.close();
    }
}

async function withBusyDatabase(line: string): Promise<RunResult> {
    const home = makeHome();
    const seeded = await commandIn(home, "refresh", []);
    expect(seeded.code).toBe(0);

    const holder = openStore(home);
    holder.db.exec("BEGIN IMMEDIATE");
    try {
        return await runLine(home, line, { network: routes() });
    } finally {
        holder.db.exec("ROLLBACK");
        holder.close();
    }
}

/** The write lock is held while the database still needs migrating, as right after an upgrade. */
async function withBusyUnmigratedDatabase(line: string): Promise<RunResult> {
    const home = makeHome();
    const holder = openStore(home, { migrations: [] });
    holder.db.exec("BEGIN IMMEDIATE");
    try {
        return await runLine(home, line, { network: routes() });
    } finally {
        holder.db.exec("ROLLBACK");
        holder.close();
    }
}

describe("published command error codes", () => {
    it("cover failures from every example in offline, network, upstream, fixture, and lock states", async () => {
        for (const command of registry.commands) {
            const examples = command.spec.examples ?? [];
            expect(examples.length, `${command.spec.name} needs an example`).toBeGreaterThan(0);
            const allowed = commandErrorCodes(command.spec);

            for (const example of examples) {
                const line = example.command;
                const situations = [
                    {
                        name: "offline",
                        run: () => runLine(makeHome(), line, { offline: true }),
                    },
                    {
                        name: "network",
                        run: () => runLine(makeHome(), line, {}),
                    },
                    {
                        name: "upstream",
                        run: () => runLine(makeHome(), line, { network: serverErrors() }),
                    },
                    {
                        name: "fixtures",
                        run: async () => {
                            const home = makeHome();
                            const seeded = await commandIn(home, "refresh", []);
                            expect(seeded.code).toBe(0);
                            return runLine(home, line, { network: routes() });
                        },
                    },
                    {
                        name: "metadata lock held",
                        run: () => withMetadataLock(line),
                    },
                    {
                        name: "database busy",
                        run: () => withBusyDatabase(line),
                    },
                    {
                        name: "database busy before migrating",
                        run: () => withBusyUnmigratedDatabase(line),
                    },
                ];

                for (const situation of situations) {
                    const result = await situation.run();
                    if (result.code === 0) continue;
                    const actual = result.json?.error?.code;
                    expect(
                        allowed.includes(actual as never),
                        `${line} (${situation.name}) failed with ${actual}; allowed: ${allowed.join(", ")}`
                    ).toBe(true);
                }
            }
        }
    });

    it("actually reaches the offline, network, and lock errors", async () => {
        const offline = await runLine(makeHome(), "charts --level 13+ --diff mas", {
            offline: true,
        });
        expect(offline.json?.error?.code).toBe("OFFLINE_NO_CACHE");

        const network = await runLine(makeHome(), "charts --level 13+ --diff mas", {});
        expect(network.json?.error?.code).toBe("NETWORK");

        const metadataLock = await withMetadataLock("refresh");
        expect(metadataLock.json?.error?.code).toBe("SYNC_IN_PROGRESS");

        const databaseBusy = await withBusyDatabase("refresh");
        expect(databaseBusy.json?.error?.code).toBe("DB_LOCKED");

        const migrating = await withBusyUnmigratedDatabase("status");
        expect(migrating.json?.error?.code).toBe("DB_LOCKED");
    });
});
