import { beforeEach, describe, expect, it } from "vitest";
import { CONFIRM_OPTIONS, confirmationCode, requireConfirmation } from "../../src/commands/confirm";
import { buildRegistry, defineCommand } from "../../src/commands/registry";
import { CliError } from "../../src/errors";
import { configEnvName } from "../../src/runtime/config";
import { splitCommandLine } from "../../src/util/shell";
import { createHarness, run } from "../harness";

const fixedSubject = {
    operation: "user.remove",
    target: "user:42",
    state: { scores: 3, user: { name: "玩家", uid: "u-42" } },
} as const;

function rejected(given: string | undefined, state: { readonly revision: number }): CliError {
    try {
        requireConfirmation(given, {
            operation: "demo.remove",
            target: "entry:a",
            state,
            preview: { name: "a", revision: state.revision },
            summary: "将删除 a",
            confirmArgs: ["demo", "remove", "a"],
        });
    } catch (error) {
        return error as CliError;
    }
    throw new Error("confirmation unexpectedly passed");
}

describe("confirmationCode", () => {
    it("is a pinned eight-character Crockford base32 code", () => {
        expect(confirmationCode(fixedSubject)).toBe("AWE3MRET");
        expect(confirmationCode(fixedSubject)).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    });

    it("is stable and canonicalizes object keys at every depth", () => {
        expect(confirmationCode(fixedSubject)).toBe(confirmationCode(fixedSubject));
        expect(
            confirmationCode({
                operation: "user.remove",
                target: "user:42",
                state: { user: { uid: "u-42", name: "玩家" }, scores: 3 },
            })
        ).toBe(confirmationCode(fixedSubject));
    });

    it("changes with the operation, target, nested state, or array order", () => {
        const base = confirmationCode({
            operation: "remove",
            target: "a",
            state: { nested: { value: 1 }, order: ["a", "b"] },
        });
        const variants = [
            {
                operation: "replace",
                target: "a",
                state: { nested: { value: 1 }, order: ["a", "b"] },
            },
            {
                operation: "remove",
                target: "b",
                state: { nested: { value: 1 }, order: ["a", "b"] },
            },
            {
                operation: "remove",
                target: "a",
                state: { nested: { value: 2 }, order: ["a", "b"] },
            },
            {
                operation: "remove",
                target: "a",
                state: { nested: { value: 1 }, order: ["b", "a"] },
            },
        ] as const;
        for (const variant of variants) expect(confirmationCode(variant)).not.toBe(base);
    });

    it("ignores undefined object properties like JSON.stringify", () => {
        expect(
            confirmationCode({
                operation: "x",
                target: "y",
                state: { kept: 1, omitted: undefined },
            })
        ).toBe(confirmationCode({ operation: "x", target: "y", state: { kept: 1 } }));
    });

    it.each([
        ["NaN", Number.NaN],
        ["positive infinity", Number.POSITIVE_INFINITY],
        ["negative infinity", Number.NEGATIVE_INFINITY],
        ["bigint", 1n],
        ["function", () => undefined],
        ["symbol", Symbol("x")],
        ["undefined state", undefined],
        ["undefined array member", [undefined]],
        ["Date", new Date("2026-01-01T00:00:00Z")],
        ["Map", new Map()],
        ["class instance", new (class Value {})()],
    ])("rejects non-JSON value: %s", (_label, state) => {
        expect(() =>
            confirmationCode({ operation: "x", target: "y", state: state as never })
        ).toThrow();
    });

    it("rejects circular objects", () => {
        const state: Record<string, unknown> = {};
        state.self = state;
        expect(() =>
            confirmationCode({ operation: "x", target: "y", state: state as never })
        ).toThrow();
    });

    it("accepts null-prototype objects and an object reached twice", () => {
        const bare = Object.assign(Object.create(null) as Record<string, number>, { a: 1 });
        expect(confirmationCode({ operation: "x", target: "y", state: bare })).toBe(
            confirmationCode({ operation: "x", target: "y", state: { a: 1 } })
        );
        const shared = { a: 1 };
        expect(
            confirmationCode({
                operation: "x",
                target: "y",
                state: { left: shared, right: [shared] },
            })
        ).toBe(
            confirmationCode({
                operation: "x",
                target: "y",
                state: { left: { a: 1 }, right: [{ a: 1 }] },
            })
        );
    });

    it("tells a lone surrogate from the replacement character", () => {
        expect(confirmationCode({ operation: "x", target: "y", state: "\uD800" })).not.toBe(
            confirmationCode({ operation: "x", target: "y", state: "\uFFFD" })
        );
    });
});

describe("requireConfirmation", () => {
    it("accepts lower case with surrounding whitespace", () => {
        const code = confirmationCode({
            operation: "demo.remove",
            target: "entry:a",
            state: { revision: 1 },
        });
        expect(() =>
            requireConfirmation(`  ${code.toLowerCase()}  `, {
                operation: "demo.remove",
                target: "entry:a",
                state: { revision: 1 },
                preview: { name: "a" },
                summary: "将删除 a",
                confirmArgs: ["demo", "remove", "a"],
            })
        ).not.toThrow();
    });

    it("distinguishes a missing code from wrong, stale, and empty codes", () => {
        expect(rejected(undefined, { revision: 1 }).extra).toMatchObject({ codeRejected: false });
        expect(rejected("WRONG", { revision: 1 }).extra).toMatchObject({ codeRejected: true });
        expect(rejected("", { revision: 1 }).extra).toMatchObject({ codeRejected: true });

        const old = confirmationCode({
            operation: "demo.remove",
            target: "entry:a",
            state: { revision: 1 },
        });
        const error = rejected(old, { revision: 2 });
        expect(error.extra).toMatchObject({ codeRejected: true });
        expect(error.message).toContain("错误或已经过期");
        expect(JSON.stringify(error)).not.toContain(old);
    });

    it("puts --yes before an argument terminator", () => {
        let error: CliError | undefined;
        try {
            requireConfirmation(undefined, {
                operation: "demo.remove",
                target: "entry:-a",
                state: {},
                preview: {},
                summary: "将删除 -a",
                confirmArgs: ["demo", "remove", "--", "-a"],
            });
        } catch (caught) {
            error = caught as CliError;
        }
        const code = String(error?.extra?.confirmationCode);
        expect(error?.fix).toBe(`saltnet demo remove --yes ${code} -- -a`);
    });
});

describe("confirmation command end to end", () => {
    let entries: string[];

    beforeEach(() => {
        entries = ["alpha", "beta"];
    });

    function registry() {
        const remove = defineCommand(
            {
                name: "demo remove",
                summary: "删除一个条目",
                category: "data",
                effect: "local",
                output: "object",
                positionals: [{ name: "name", description: "条目名称" }],
                options: { ...CONFIRM_OPTIONS },
                errors: ["CONFIRMATION_REQUIRED"],
            },
            args => {
                const { name } = args.positionals;
                requireConfirmation(args.options.yes, {
                    operation: "demo.remove",
                    target: `entry:${name}`,
                    state: { entries: [...entries] },
                    preview: { name, entries: [...entries] },
                    summary: `将删除条目「${name}」`,
                    // A real command writes `--` before a reference that starts with a dash.
                    confirmArgs: name.startsWith("-")
                        ? ["demo", "remove", "--", name]
                        : ["demo", "remove", name],
                });
                entries.splice(entries.indexOf(name), 1);
                return { data: { removed: name } };
            }
        );
        const bind = defineCommand(
            {
                name: "demo bind",
                summary: "解析后绑定一个条目",
                category: "data",
                effect: "local",
                output: "object",
                positionals: [{ name: "name", description: "条目名称" }],
                options: {
                    source: { kind: "string", description: "待解析来源" },
                    id: { kind: "string", description: "已解析标识" },
                    ...CONFIRM_OPTIONS,
                },
                errors: ["CONFIRMATION_REQUIRED"],
            },
            args => {
                const id = args.options.id ?? `resolved:${args.options.source}`;
                requireConfirmation(args.options.yes, {
                    operation: "demo.bind",
                    target: `entry:${args.positionals.name}`,
                    state: { id },
                    preview: { name: args.positionals.name, id },
                    summary: `将绑定条目「${args.positionals.name}」`,
                    confirmArgs: ["demo", "bind", args.positionals.name, "--id", id],
                });
                return { data: { bound: args.positionals.name, id } };
            }
        );
        const missing = defineCommand(
            {
                name: "demo missing",
                summary: "总是找不到条目",
                category: "data",
                effect: "none",
                output: "object",
                errors: ["NOT_FOUND"],
            },
            () => {
                throw new CliError("NOT_FOUND", "没有这个条目");
            }
        );
        return buildRegistry({
            commands: [remove, bind, missing],
            groups: { demo: "演示确认" },
        });
    }

    async function invokeWith(options: Parameters<typeof createHarness>[0], ...argv: string[]) {
        const harness = createHarness(options);
        const code = await run(registry(), harness, ...argv);
        return { code, stdout: harness.stdout(), harness };
    }

    async function invoke(...argv: string[]) {
        return invokeWith({}, ...argv);
    }

    it("previews, round-trips the fix, and mutates only after confirmation", async () => {
        const preview = await invoke("demo", "remove", "alpha");
        expect(preview.code).toBe(6);
        const envelope = JSON.parse(preview.stdout);
        expect(envelope).toMatchObject({
            ok: false,
            error: {
                code: "CONFIRMATION_REQUIRED",
                preview: { name: "alpha", entries: ["alpha", "beta"] },
                codeRejected: false,
                retryable: false,
            },
        });
        expect(envelope.error.confirmationCode).toHaveLength(8);
        expect(envelope.error.fix).toBe(
            `saltnet demo remove alpha --yes ${envelope.error.confirmationCode}`
        );
        expect(entries).toEqual(["alpha", "beta"]);
        expect(preview.harness.readStdin).not.toHaveBeenCalled();

        const confirmed = await invoke(...splitCommandLine(envelope.error.fix).slice(1));
        expect(confirmed.code).toBe(0);
        expect(entries).toEqual(["beta"]);
    });

    it("rejects wrong and stale codes with a fresh preview and no mutation", async () => {
        const wrong = await invoke("demo", "remove", "alpha", "--yes", "00000000");
        expect(wrong.code).toBe(6);
        expect(JSON.parse(wrong.stdout).error).toMatchObject({
            preview: { entries: ["alpha", "beta"] },
            codeRejected: true,
        });
        expect(entries).toEqual(["alpha", "beta"]);

        const first = JSON.parse((await invoke("demo", "remove", "alpha")).stdout).error;
        entries.push("gamma");
        const stale = await invoke(...splitCommandLine(first.fix).slice(1));
        const fresh = JSON.parse(stale.stdout).error;
        expect(stale.code).toBe(6);
        expect(fresh).toMatchObject({
            preview: { entries: ["alpha", "beta", "gamma"] },
            codeRejected: true,
        });
        expect(fresh.confirmationCode).not.toBe(first.confirmationCode);
        expect(entries).toEqual(["alpha", "beta", "gamma"]);
    });

    it("keeps spaces, quotes, and Chinese text intact through the fix", async () => {
        const name = `中 文 'single' "double"`;
        entries = [name];
        const error = JSON.parse((await invoke("demo", "remove", name)).stdout).error;
        expect(splitCommandLine(error.fix)).toEqual([
            "saltnet",
            "demo",
            "remove",
            name,
            "--yes",
            error.confirmationCode,
        ]);
        expect((await invoke(...splitCommandLine(error.fix).slice(1))).code).toBe(0);
        expect(entries).toEqual([]);
    });

    it("can replace preview arguments with stable confirming arguments", async () => {
        const preview = await invoke("demo", "bind", "alpha", "--source", "qr-value");
        const error = JSON.parse(preview.stdout).error;
        expect(error.fix).toBe(
            `saltnet demo bind alpha --id resolved:qr-value --yes ${error.confirmationCode}`
        );
        const confirmed = await invoke(...splitCommandLine(error.fix).slice(1));
        expect(confirmed.code).toBe(0);
        expect(JSON.parse(confirmed.stdout).data).toEqual({
            bound: "alpha",
            id: "resolved:qr-value",
        });
    });

    it("treats an empty code as a rejected one, not as a usage error", async () => {
        const result = await invoke("demo", "remove", "alpha", "--yes", "");
        expect(result.code).toBe(6);
        expect(JSON.parse(result.stdout).error).toMatchObject({
            code: "CONFIRMATION_REQUIRED",
            codeRejected: true,
        });
        expect(entries).toEqual(["alpha", "beta"]);
    });

    it("confirms a reference that starts with a dash through the argument terminator", async () => {
        entries = ["-alpha", "beta"];
        const error = JSON.parse((await invoke("demo", "remove", "--", "-alpha")).stdout).error;
        expect(error.fix).toBe(`saltnet demo remove --yes ${error.confirmationCode} -- -alpha`);
        expect((await invoke(...splitCommandLine(error.fix).slice(1))).code).toBe(0);
        expect(entries).toEqual(["beta"]);
    });

    it("keeps every other failure in JSON under --format text", async () => {
        const result = await invoke("demo", "missing", "--format", "text");
        expect(result.code).toBe(3);
        expect(JSON.parse(result.stdout).error).toMatchObject({ code: "NOT_FOUND" });
    });

    it("prints the text preview in a terminal set to text, and JSON when piped", async () => {
        const env = { [configEnvName("output.format")]: "text" };
        const terminal = await invokeWith({ stdoutIsTTY: true, env }, "demo", "remove", "alpha");
        expect(terminal.code).toBe(6);
        expect(terminal.stdout).toContain("错误 CONFIRMATION_REQUIRED：");
        const piped = await invokeWith({ stdoutIsTTY: false, env }, "demo", "remove", "alpha");
        expect(piped.code).toBe(6);
        expect(JSON.parse(piped.stdout).error.code).toBe("CONFIRMATION_REQUIRED");
    });

    it("prints the preview and confirming command in text format", async () => {
        const result = await invoke("demo", "remove", "alpha", "--format", "text");
        expect(result.code).toBe(6);
        expect(result.stdout).toContain("错误 CONFIRMATION_REQUIRED：");
        expect(result.stdout).toContain("  name: alpha\n");
        expect(result.stdout).toContain('  entries: ["alpha","beta"]\n');
        expect(result.stdout).toMatch(/确认命令：saltnet demo remove alpha --yes [0-9A-Z]{8}\n$/);
    });
});
