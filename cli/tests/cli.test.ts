import type { Store } from "../src/store/store";
import type { Harness } from "./harness";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listOptions } from "../src/commands/listOptions";
import { buildRegistry, defineCommand } from "../src/commands/registry";
import { CliError } from "../src/errors";
import { paginate } from "../src/output/paging";
import { COMMAND_GROUPS, demo, favAdd, needsTarget, userBind, userList } from "./commands/fixtures";
import { createHarness, run as runWith } from "./harness";
import { useTempHome } from "./tempHome";

const failing = defineCommand(
    {
        name: "fail",
        summary: "总是失败",
        category: "data",
        effect: "none",
        output: "object",
        positionals: [{ name: "kind", description: "失败的种类" }],
    },
    args => {
        switch (args.positionals.kind) {
            case "cli":
                throw new CliError("NOT_FOUND", "没找到", {
                    candidates: [{ ref: "1" }],
                    fix: "saltnet search x",
                });
            case "plain":
                throw new Error("boom");
            case "locked":
                throw new CliError("DB_LOCKED", "数据库被占用");
            case "partial":
                throw new CliError("UPSTREAM_ERROR", "上游出错", {
                    meta: { dataAsOf: { catalog: "2026-11-10T09:12:03+08:00" } },
                    warnings: [{ code: "STALE_METADATA", message: "用的是缓存" }],
                });
            default:
                return { data: null };
        }
    }
);

const reader = defineCommand(
    {
        name: "reader",
        summary: "读 stdin",
        category: "data",
        effect: "none",
        output: "object",
        options: { token: { kind: "credential", description: "凭据" } },
    },
    async (args, ctx) => ({
        data: { token: args.options.token === "-" ? (await ctx.io.readStdin()).trim() : null },
    })
);

const ROWS = [
    { chartKey: "834-4", title: "PANDORA PARADOXXX", score: { rank: "SSS", rating: 324 } },
    { chartKey: "131-3", title: "Link", score: null },
    { chartKey: "11-2", title: "熊華極", score: { rank: "S+", rating: 280 } },
];

/** Called by the commands below, so a test can tell whether one ran at all. */
const ran = vi.fn();

const rows = defineCommand(
    {
        name: "rows",
        summary: "列出几行",
        category: "catalog",
        effect: "none",
        output: "list",
        options: listOptions(2),
    },
    (args, ctx) => {
        ran();
        ctx.log("正在读取");
        const { items, page } = paginate(ROWS, args.options);
        return {
            data: { items },
            meta: { page },
            warnings: [{ code: "STALE_SCORES", message: "成绩旧了", fix: "saltnet sync" }],
        };
    }
);

const rowsFail = defineCommand(
    {
        name: "rows-fail",
        summary: "列表命令失败",
        category: "catalog",
        effect: "none",
        output: "list",
    },
    () => {
        throw new CliError("NOT_FOUND", "没有这些行");
    }
);

const info = defineCommand(
    { name: "info", summary: "一个对象", category: "data", effect: "none", output: "object" },
    () => {
        ran();
        return { data: { a: 1, nested: { b: [1, 2] } }, meta: { note: "x" } };
    }
);

const guide = defineCommand(
    { name: "guide", summary: "文本", category: "data", effect: "none", output: "text" },
    () => ({ data: "第一行\n第二行" })
);

const settings = defineCommand(
    {
        name: "settings",
        summary: "设置有错时也要能跑",
        category: "data",
        effect: "none",
        output: "object",
        allowBadConfig: true,
    },
    (_args, ctx) => ({ data: { problems: ctx.config.problems.length } })
);

const brokenList = defineCommand(
    {
        name: "broken-list",
        summary: "没返回列表",
        category: "data",
        effect: "none",
        output: "list",
    },
    () => ({ data: { rows: [] } })
);

/** The store the last database command opened, so a test can look at it after the command ends. */
let openedStore: Store | undefined;

const dbUse = defineCommand(
    { name: "db-use", summary: "用数据库", category: "data", effect: "local", output: "object" },
    (_args, ctx) => {
        const store = ctx.store();
        openedStore = store;
        store.db.exec("CREATE TABLE IF NOT EXISTS t (x INTEGER)");
        return { data: { again: ctx.store() === store, version: store.migration.to } };
    }
);

const dbFail = defineCommand(
    {
        name: "db-fail",
        summary: "用了数据库然后失败",
        category: "data",
        effect: "local",
        output: "object",
    },
    (_args, ctx) => {
        openedStore = ctx.store();
        throw new Error("boom");
    }
);

const dbBusy = defineCommand(
    {
        name: "db-busy",
        summary: "数据库被占用",
        category: "data",
        effect: "local",
        output: "object",
    },
    () => {
        throw Object.assign(new Error("database is locked"), {
            code: "ERR_SQLITE_ERROR",
            errcode: 5,
            errstr: "database is locked",
        });
    }
);

const registry = buildRegistry({
    commands: [
        demo,
        needsTarget,
        userList,
        userBind,
        favAdd,
        failing,
        reader,
        rows,
        rowsFail,
        info,
        guide,
        settings,
        brokenList,
        dbUse,
        dbFail,
        dbBusy,
    ],
    groups: COMMAND_GROUPS,
});

async function run(harness: Harness, ...argv: string[]): Promise<number> {
    return runWith(registry, harness, ...argv);
}

describe("version and help", () => {
    it("prints the version as plain text", async () => {
        const harness = createHarness();
        expect(await run(harness, "--version")).toBe(0);
        expect(harness.stdout()).toBe("9.9.9\n");
        expect(harness.stderr()).toBe("");
    });

    it("prints the command list for a bare invocation and for --help", async () => {
        for (const argv of [[], ["--help"], ["-h"]]) {
            const harness = createHarness();
            expect(await run(harness, ...argv)).toBe(0);
            expect(harness.stdout()).toContain("saltnet 9.9.9");
            expect(harness.stdout()).toContain("曲目与谱面");
            expect(() => JSON.parse(harness.stdout())).toThrow();
        }
    });

    it("prints the help of a command, not wrapped in an envelope", async () => {
        const harness = createHarness();
        expect(await run(harness, "demo", "--help")).toBe(0);
        expect(harness.stdout()).toContain("saltnet demo — 演示每种参数类型");
        expect(harness.stderr()).toBe("");
    });
});

describe("a successful command", () => {
    it("prints one compact envelope line and exits 0", async () => {
        const harness = createHarness();
        expect(await run(harness, "demo", "hello", "--limit", "3", "--diff", "mas")).toBe(0);

        const text = harness.stdout();
        expect(text.endsWith("\n")).toBe(true);
        expect(text.trimEnd().includes("\n")).toBe(false);

        const envelope = JSON.parse(text);
        expect(envelope).toMatchObject({
            v: 1,
            ok: true,
            command: "demo",
            meta: {},
            warnings: [],
            data: {
                positionals: { text: "hello" },
                options: { limit: 3, diff: ["MASTER"], sort: "default", asc: false },
                global: { pretty: false, offline: false },
            },
        });
        expect(Object.keys(envelope)).toEqual(["v", "ok", "command", "data", "meta", "warnings"]);
        expect(harness.stderr()).toBe("");
    });

    it("indents the envelope with --pretty", async () => {
        const harness = createHarness();
        await run(harness, "user", "list", "--pretty");
        expect(harness.stdout()).toBe(
            `${JSON.stringify(
                {
                    v: 1,
                    ok: true,
                    command: "user list",
                    data: { items: [] },
                    meta: {},
                    warnings: [],
                },
                null,
                4
            )}\n`
        );
    });

    it("reads stdin only when a credential option asks for it", async () => {
        const without = createHarness({ stdin: "secret\n" });
        await run(without, "reader");
        expect(without.readStdin).not.toHaveBeenCalled();
        expect(JSON.parse(without.stdout()).data).toEqual({ token: null });

        const withDash = createHarness({ stdin: "secret\n" });
        await run(withDash, "reader", "--token", "-");
        expect(withDash.readStdin).toHaveBeenCalledTimes(1);
        expect(JSON.parse(withDash.stdout()).data).toEqual({ token: "secret" });
    });
});

describe("a usage mistake", () => {
    it("prints a failure envelope, exits 2 and leaves stderr and stdin alone", async () => {
        const harness = createHarness({ stdin: "secret" });
        expect(await run(harness, "demo", "x", "--lmit", "5")).toBe(2);

        expect(JSON.parse(harness.stdout())).toEqual({
            v: 1,
            ok: false,
            command: "demo",
            error: {
                code: "USAGE",
                message: "未知选项「--lmit」",
                candidates: [{ ref: "--limit" }],
                fix: "saltnet demo --help",
                retryable: false,
            },
        });
        expect(harness.stderr()).toBe("");
        expect(harness.readStdin).not.toHaveBeenCalled();
    });

    it("names no command when the line did not get as far as one", async () => {
        const harness = createHarness();
        expect(await run(harness, "dmeo")).toBe(2);
        const envelope = JSON.parse(harness.stdout());
        expect(envelope.command).toBeNull();
        expect(envelope.error.code).toBe("USAGE");
        expect(envelope.error.candidates).toEqual([{ ref: "demo" }]);
    });

    it("honors --pretty even though the line was rejected", async () => {
        const harness = createHarness();
        await run(harness, "demo", "x", "--bogus", "--pretty");
        expect(harness.stdout()).toContain('\n    "ok": false');
    });

    it("rejects a credential written on the command line without printing it", async () => {
        const harness = createHarness();
        const secret = "SGWCMAID".concat("abcdef0123456789".repeat(5));
        expect(await run(harness, "reader", "--token", secret)).toBe(2);
        expect(harness.stdout()).not.toContain(secret);
        expect(harness.stderr()).not.toContain(secret);
        expect(harness.readStdin).not.toHaveBeenCalled();
    });
});

describe("a command that fails", () => {
    it("maps a CliError to its exit code and keeps its details", async () => {
        const harness = createHarness();
        expect(await run(harness, "fail", "cli")).toBe(3);
        expect(JSON.parse(harness.stdout())).toEqual({
            v: 1,
            ok: false,
            command: "fail",
            error: {
                code: "NOT_FOUND",
                message: "没找到",
                candidates: [{ ref: "1" }],
                fix: "saltnet search x",
                retryable: false,
            },
        });
    });

    it("marks errors worth retrying", async () => {
        const harness = createHarness();
        expect(await run(harness, "fail", "locked")).toBe(7);
        expect(JSON.parse(harness.stdout()).error).toMatchObject({
            code: "DB_LOCKED",
            retryable: true,
        });
    });

    it("keeps the meta and warnings a failure comes with", async () => {
        const harness = createHarness();
        expect(await run(harness, "fail", "partial")).toBe(5);
        const envelope = JSON.parse(harness.stdout());
        expect(Object.keys(envelope)).toEqual(["v", "ok", "command", "error", "meta", "warnings"]);
        expect(envelope.meta).toEqual({ dataAsOf: { catalog: "2026-11-10T09:12:03+08:00" } });
        expect(envelope.warnings).toEqual([{ code: "STALE_METADATA", message: "用的是缓存" }]);
    });

    it("reports anything else as an internal error without a stack trace on stdout", async () => {
        const harness = createHarness();
        expect(await run(harness, "fail", "plain")).toBe(1);
        const envelope = JSON.parse(harness.stdout());
        expect(envelope.error).toEqual({
            code: "INTERNAL",
            message: "内部错误：boom",
            retryable: false,
        });
        expect(harness.stdout()).not.toContain("at ");
        expect(harness.stderr()).toBe("");
    });

    it("writes the stack to stderr with --verbose", async () => {
        const harness = createHarness();
        expect(await run(harness, "fail", "plain", "--verbose")).toBe(1);
        expect(harness.stderr()).toContain("Error: boom");
        expect(JSON.parse(harness.stdout()).ok).toBe(false);
    });

    it("succeeds for the kind that does not fail", async () => {
        const harness = createHarness();
        expect(await run(harness, "fail", "fine")).toBe(0);
    });

    it("is an internal error when a list command does not return a list", async () => {
        const harness = createHarness();
        expect(await run(harness, "broken-list")).toBe(1);
        const { error } = JSON.parse(harness.stdout());
        expect(error.code).toBe("INTERNAL");
        expect(error.message).toContain("命令 broken-list");
    });
});

describe("a list command", () => {
    it("pages with --limit and --offset and reports where it is", async () => {
        const harness = createHarness();
        expect(await run(harness, "rows", "--limit", "1", "--offset", "1")).toBe(0);
        const envelope = JSON.parse(harness.stdout());
        expect(envelope.data.items.map((item: { chartKey: string }) => item.chartKey)).toEqual([
            "131-3",
        ]);
        expect(envelope.meta.page).toEqual({ total: 3, offset: 1, limit: 1, nextOffset: 2 });
        expect(envelope.warnings).toEqual([
            { code: "STALE_SCORES", message: "成绩旧了", fix: "saltnet sync" },
        ]);
    });

    it("uses the default limit of the command", async () => {
        const harness = createHarness();
        await run(harness, "rows");
        const envelope = JSON.parse(harness.stdout());
        expect(envelope.data.items).toHaveLength(2);
        expect(envelope.meta.page).toEqual({ total: 3, offset: 0, limit: 2, nextOffset: 2 });
    });

    it("keeps only the fields asked for", async () => {
        const harness = createHarness();
        await run(harness, "rows", "--fields", "chartKey,score.rank", "--limit", "3");
        expect(JSON.parse(harness.stdout()).data.items).toEqual([
            { chartKey: "834-4", score: { rank: "SSS" } },
            { chartKey: "131-3", score: { rank: null } },
            { chartKey: "11-2", score: { rank: "S+" } },
        ]);
    });

    it("rejects an unknown field with the closest names", async () => {
        const harness = createHarness();
        expect(await run(harness, "rows", "--fields", "titel")).toBe(2);
        const envelope = JSON.parse(harness.stdout());
        expect(envelope.error.code).toBe("USAGE");
        expect(envelope.error.candidates).toContainEqual({ ref: "title" });
    });

    it("writes tsv with the table on stdout and meta and warnings on stderr", async () => {
        const harness = createHarness();
        expect(await run(harness, "rows", "--format", "tsv", "--limit", "3")).toBe(0);
        expect(harness.stdout()).toBe(
            [
                "chartKey\ttitle\tscore.rank\tscore.rating",
                "834-4\tPANDORA PARADOXXX\tSSS\t324",
                "131-3\tLink\t\t",
                "11-2\t熊華極\tS+\t280",
                "",
            ].join("\n")
        );
        expect(harness.stderr()).toBe(
            [
                '# meta {"page":{"total":3,"offset":0,"limit":3,"nextOffset":null}}',
                '# warning {"code":"STALE_SCORES","message":"成绩旧了","fix":"saltnet sync"}',
                "",
            ].join("\n")
        );
    });

    it("writes tsv columns in the order of --fields", async () => {
        const harness = createHarness();
        await run(harness, "rows", "--format", "tsv", "--fields", "title,chartKey", "--limit", "1");
        expect(harness.stdout()).toBe("title\tchartKey\nPANDORA PARADOXXX\t834-4\n");
    });

    it("writes text for a person", async () => {
        const harness = createHarness();
        expect(await run(harness, "rows", "--format", "text", "--limit", "3")).toBe(0);
        const lines = harness.stdout().split("\n");
        expect(lines[0]).toBe("chartKey  title              score.rank  score.rating");
        expect(harness.stdout()).toContain("第 1–3 条，共 3 条");
        expect(harness.stdout()).toContain("警告 STALE_SCORES：成绩旧了（建议运行 saltnet sync）");
        expect(harness.stderr()).toBe("");
    });

    it("prints a failure as JSON even when tsv was asked for", async () => {
        const harness = createHarness();
        expect(await run(harness, "rows-fail", "--format", "tsv")).toBe(3);
        expect(JSON.parse(harness.stdout()).error.code).toBe("NOT_FOUND");
        expect(harness.stderr()).toBe("");
    });
});

describe("output formats", () => {
    it("refuses tsv for a command that does not return a list, without running it", async () => {
        ran.mockClear();
        const harness = createHarness();
        expect(await run(harness, "info", "--format", "tsv")).toBe(2);
        const envelope = JSON.parse(harness.stdout());
        expect(envelope.error.code).toBe("USAGE");
        expect(envelope.error.message).toContain("命令 info 的结果不是列表");
        expect(ran).not.toHaveBeenCalled();
    });

    it("writes an object as text", async () => {
        const harness = createHarness();
        expect(await run(harness, "info", "--format", "text")).toBe(0);
        expect(harness.stdout()).toBe("a: 1\nnested:\n  b: 1、2\n\nnote: x\n");
    });

    it("prints a text command's text as it is, without an envelope", async () => {
        const harness = createHarness();
        expect(await run(harness, "guide")).toBe(0);
        expect(harness.stdout()).toBe("第一行\n第二行\n");
        expect(harness.stderr()).toBe("");
    });

    it("gives a program JSON even if the configured format is text", async () => {
        const harness = createHarness({ env: { SALTNET_OUTPUT_FORMAT: "text" } });
        await run(harness, "info");
        expect(JSON.parse(harness.stdout()).ok).toBe(true);
    });

    it("gives a person at a terminal the configured format", async () => {
        const harness = createHarness({
            stdoutIsTTY: true,
            env: { SALTNET_OUTPUT_FORMAT: "text" },
        });
        await run(harness, "info");
        expect(harness.stdout()).toBe("a: 1\nnested:\n  b: 1、2\n\nnote: x\n");
    });

    it("lets --format override the configured format at a terminal", async () => {
        const harness = createHarness({
            stdoutIsTTY: true,
            env: { SALTNET_OUTPUT_FORMAT: "text" },
        });
        await run(harness, "info", "--format", "json");
        expect(JSON.parse(harness.stdout()).ok).toBe(true);
    });

    it("gives a terminal JSON when nothing is configured", async () => {
        const harness = createHarness({ stdoutIsTTY: true });
        await run(harness, "info");
        expect(JSON.parse(harness.stdout()).ok).toBe(true);
    });
});

describe("logging", () => {
    it("says nothing on stderr when an agent runs the command", async () => {
        const harness = createHarness();
        await run(harness, "rows");
        expect(harness.stderr()).toBe("");
    });

    it("writes log lines to a terminal", async () => {
        const harness = createHarness({ stderrIsTTY: true });
        await run(harness, "rows");
        expect(harness.stderr()).toBe("正在读取\n");
    });

    it("writes log lines with --verbose even when stderr is not a terminal", async () => {
        const harness = createHarness();
        await run(harness, "rows", "--verbose");
        expect(harness.stderr()).toBe("正在读取\n");
        expect(JSON.parse(harness.stdout()).ok).toBe(true);
    });
});

describe("settings with errors", () => {
    const homes: string[] = [];

    afterEach(() => {
        for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
    });

    /** A throwaway data directory whose `config.json` has the given content. */
    function homeWith(config: string): string {
        const home = mkdtempSync(path.join(tmpdir(), "saltnet-cli-test-"));
        homes.push(home);
        writeFileSync(path.join(home, "config.json"), config);
        return home;
    }

    it("stops a command before it runs and says which setting is wrong", async () => {
        ran.mockClear();
        const harness = createHarness({ env: { SALTNET_SCORES_STALE_DAYS: "soon" } });
        expect(await run(harness, "rows")).toBe(2);
        const { error } = JSON.parse(harness.stdout());
        expect(error.code).toBe("USAGE");
        expect(error.message).toContain("配置有错误，命令没有运行");
        expect(error.message).toContain("SALTNET_SCORES_STALE_DAYS");
        expect(error.fix).toBe("saltnet config list");
        expect(error.problems).toEqual([
            {
                source: "env",
                key: "scores.staleDays",
                message: expect.stringContaining("SALTNET_SCORES_STALE_DAYS"),
            },
        ]);
        expect(ran).not.toHaveBeenCalled();
    });

    it("stops for a config.json that is not valid JSON", async () => {
        const harness = createHarness({ env: { SALTNET_HOME: homeWith("{ nope") } });
        expect(await run(harness, "info")).toBe(2);
        const { error } = JSON.parse(harness.stdout());
        expect(error.message).toContain("config.json 不是合法的 JSON");
        expect(error.problems).toEqual([
            { source: "file", key: "", message: "config.json 不是合法的 JSON" },
        ]);
    });

    it("stops for a value in config.json that is out of range", async () => {
        const harness = createHarness({
            env: { SALTNET_HOME: homeWith('{"metadata": {"maxAgeHours": -5}}') },
        });
        expect(await run(harness, "info")).toBe(2);
        expect(JSON.parse(harness.stdout()).error.message).toContain("metadata.maxAgeHours");
    });

    it("lets a command that declares allowBadConfig run anyway", async () => {
        const harness = createHarness({ env: { SALTNET_HOME: homeWith("{ nope") } });
        expect(await run(harness, "settings")).toBe(0);
        expect(JSON.parse(harness.stdout()).data).toEqual({ problems: 1 });
    });

    it("does not look at the settings for help or the version", async () => {
        for (const argv of [["--help"], ["rows", "--help"], ["--version"]]) {
            const harness = createHarness({ env: { SALTNET_HOME: homeWith("{ nope") } });
            expect(await run(harness, ...argv)).toBe(0);
        }
    });

    it("only warns about a setting it does not know", async () => {
        const harness = createHarness({ env: { SALTNET_HOME: homeWith('{"whatever": 1}') } });
        expect(await run(harness, "info")).toBe(0);
    });
});

describe("the database", () => {
    const makeHome = useTempHome();

    it("is not opened, and nothing is created on disk, by a command that does not ask for it", async () => {
        const { home } = makeHome();
        const harness = createHarness({ env: { SALTNET_HOME: home } });

        expect(await run(harness, "info")).toBe(0);
        expect(await run(harness, "rows")).toBe(0);
        expect(await run(harness, "--help")).toBe(0);

        expect(existsSync(home)).toBe(false);
    });

    it("is opened on first use, once, and closed when the command ends", async () => {
        const paths = makeHome();
        const harness = createHarness({ env: { SALTNET_HOME: paths.home } });

        expect(await run(harness, "db-use")).toBe(0);

        const { data } = JSON.parse(harness.stdout());
        expect(data.again).toBe(true);
        expect(data.version).toBeGreaterThan(0);
        expect(existsSync(paths.database)).toBe(true);
        expect(() => openedStore?.db.exec("SELECT 1")).toThrow(/not open/);
    });

    it("keeps what a command wrote for the next one", async () => {
        const paths = makeHome();
        const first = createHarness({ env: { SALTNET_HOME: paths.home } });
        await run(first, "db-use");
        const second = createHarness({ env: { SALTNET_HOME: paths.home } });
        await run(second, "db-use");

        expect(JSON.parse(second.stdout()).data.version).toBe(
            JSON.parse(first.stdout()).data.version
        );
        expect(second.stderr()).toBe("");
    });

    it("is closed even when the command fails", async () => {
        const paths = makeHome();
        const harness = createHarness({ env: { SALTNET_HOME: paths.home } });

        expect(await run(harness, "db-fail")).toBe(1);

        expect(JSON.parse(harness.stdout()).error.code).toBe("INTERNAL");
        expect(() => openedStore?.db.exec("SELECT 1")).toThrow(/not open/);
    });

    it("reports a busy database as DB_LOCKED, not as an internal error", async () => {
        const harness = createHarness();

        expect(await run(harness, "db-busy")).toBe(7);

        expect(JSON.parse(harness.stdout()).error).toMatchObject({
            code: "DB_LOCKED",
            retryable: true,
        });
    });

    it("explains a data directory that cannot be used instead of crashing", async () => {
        // A file where the data directory should be.
        const blocked = path.join(path.dirname(makeHome().home), "blocked");
        writeFileSync(blocked, "");
        const harness = createHarness({ env: { SALTNET_HOME: blocked } });

        expect(await run(harness, "db-use")).toBe(1);

        const { error } = JSON.parse(harness.stdout());
        expect(error.code).toBe("INTERNAL");
        expect(error.message).toContain("不是目录");
        expect(error.message).toContain("SALTNET_HOME");
    });
});
