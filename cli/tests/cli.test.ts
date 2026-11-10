import type { Io } from "../src/runtime/io";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli";
import { buildRegistry, defineCommand } from "../src/commands/registry";
import { CliError } from "../src/errors";
import { COMMAND_GROUPS, demo, favAdd, needsTarget, userBind, userList } from "./commands/fixtures";

interface Harness {
    io: Io;
    stdout: () => string;
    stderr: () => string;
    readStdin: ReturnType<typeof vi.fn>;
}

function createHarness(options: { stdin?: string; stdoutIsTTY?: boolean } = {}): Harness {
    const out: string[] = [];
    const err: string[] = [];
    const readStdin = vi.fn(async () => options.stdin ?? "");
    const io: Io = {
        stdout: { write: text => void out.push(text), isTTY: options.stdoutIsTTY ?? false },
        stderr: { write: text => void err.push(text), isTTY: false },
        env: {},
        cwd: "/work",
        readStdin,
        now: () => new Date("2026-11-11T00:00:00Z"),
    };
    return { io, stdout: () => out.join(""), stderr: () => err.join(""), readStdin };
}

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

const registry = buildRegistry({
    commands: [demo, needsTarget, userList, userBind, favAdd, failing, reader],
    groups: COMMAND_GROUPS,
});

async function run(harness: Harness, ...argv: string[]): Promise<number> {
    return runCli(argv, { io: harness.io, registry, version: "9.9.9" });
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
});
