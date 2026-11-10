import type { ParseOutcome } from "../../src/commands/parse";
import { describe, expect, it } from "vitest";
import { renderHelp } from "../../src/commands/help";
import { DEFAULT_LIMIT, listOptions, MAX_LIMIT } from "../../src/commands/listOptions";
import { parseArgv } from "../../src/commands/parse";
import { buildRegistry, defineCommand } from "../../src/commands/registry";

const charts = defineCommand(
    {
        name: "charts",
        summary: "列出谱面",
        category: "catalog",
        effect: "none",
        output: "list",
        options: listOptions(),
    },
    () => ({ data: { items: [] } })
);

const search = defineCommand(
    {
        name: "search",
        summary: "搜索曲目",
        category: "catalog",
        effect: "none",
        output: "list",
        options: { ...listOptions(10), exact: { kind: "boolean", description: "只要完全匹配" } },
    },
    () => ({ data: { items: [] } })
);

const registry = buildRegistry({ commands: [charts, search], groups: {} });

function parse(...argv: string[]): ParseOutcome {
    return parseArgv(registry, argv);
}

function accepted(...argv: string[]) {
    const outcome = parse(...argv);
    if (outcome.kind !== "run") {
        const detail = outcome.kind === "error" ? outcome.error.message : "";
        throw new Error(`expected "${argv.join(" ")}" to run, got ${outcome.kind} ${detail}`);
    }
    return outcome.args.options;
}

function rejected(...argv: string[]): string {
    const outcome = parse(...argv);
    if (outcome.kind !== "error") {
        throw new Error(`expected "${argv.join(" ")}" to be rejected, got ${outcome.kind}`);
    }
    expect(outcome.error.code).toBe("USAGE");
    return outcome.error.message;
}

describe("listOptions", () => {
    it("pages 50 at a time unless the command picks another size", () => {
        expect(DEFAULT_LIMIT).toBe(50);
        expect(accepted("charts")).toEqual({ limit: 50, offset: 0, fields: undefined });
        expect(accepted("search")).toMatchObject({ limit: 10, offset: 0 });
    });

    it("reads --limit and --offset as whole numbers", () => {
        expect(accepted("charts", "--limit", "5", "--offset", "20")).toMatchObject({
            limit: 5,
            offset: 20,
        });
        expect(accepted("charts", "--limit", String(MAX_LIMIT))).toMatchObject({
            limit: MAX_LIMIT,
        });
    });

    it("rejects a limit that is zero, too big or not a whole number", () => {
        expect(rejected("charts", "--limit", "0")).toContain("--limit");
        expect(rejected("charts", "--limit", String(MAX_LIMIT + 1))).toContain("--limit");
        expect(rejected("charts", "--limit", "2.5")).toContain("--limit");
        expect(rejected("charts", "--limit", "many")).toContain("--limit");
    });

    it("rejects a negative offset", () => {
        expect(rejected("charts", "--offset=-1")).toContain("--offset");
    });

    it("reads --fields as a list of field names", () => {
        expect(accepted("charts", "--fields", "chartKey,score.rank").fields).toEqual([
            "chartKey",
            "score.rank",
        ]);
        expect(accepted("charts", "--fields=title").fields).toEqual(["title"]);
    });

    it("can be combined with the options of the command", () => {
        expect(accepted("search", "--exact", "--limit", "3")).toMatchObject({
            exact: true,
            limit: 3,
        });
    });

    it("is documented in the help of the command", () => {
        const help = renderHelp(registry, { kind: "command", command: charts }, "9.9.9");
        expect(help).toContain("--limit");
        expect(help).toContain("最多返回几条");
        expect(help).toContain("--offset");
        expect(help).toContain("--fields <字段,字段>");
        expect(help).toContain("范围：1 到 10000；默认：50");

        const searchHelp = renderHelp(registry, { kind: "command", command: search }, "9.9.9");
        expect(searchHelp).toContain("范围：1 到 10000；默认：10");
    });
});
