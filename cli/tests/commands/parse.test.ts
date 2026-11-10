import type { ParseOutcome } from "../../src/commands/parse";
import { describe, expect, it } from "vitest";
import { parseArgv } from "../../src/commands/parse";
import { failureEnvelope } from "../../src/output/envelope";
import { createTestRegistry } from "./fixtures";

const registry = createTestRegistry();

function parse(...argv: string[]): ParseOutcome {
    return parseArgv(registry, argv);
}

/** The arguments of a command line that is expected to be accepted. */
function accepted(...argv: string[]) {
    const outcome = parse(...argv);
    if (outcome.kind !== "run") {
        const detail = outcome.kind === "error" ? outcome.error.message : "";
        throw new Error(`expected "${argv.join(" ")}" to run, got ${outcome.kind} ${detail}`);
    }
    return { command: outcome.command.spec.name, ...outcome.args };
}

/** The error of a command line that is expected to be rejected as a usage mistake. */
function rejected(...argv: string[]) {
    const outcome = parse(...argv);
    if (outcome.kind !== "error") {
        throw new Error(`expected "${argv.join(" ")}" to be rejected, got ${outcome.kind}`);
    }
    expect(outcome.error.code).toBe("USAGE");
    expect(outcome.error.exitCode).toBe(2);
    return { ...outcome, message: outcome.error.message, candidates: outcome.error.candidates };
}

/** Everything the failure would print, message included (an Error's message is not enumerable). */
function printed(error: Parameters<typeof failureEnvelope>[1]): string {
    return JSON.stringify(failureEnvelope(null, error));
}

describe("finding the command", () => {
    it("matches a one-word command and fills in what was left out", () => {
        const parsed = accepted("demo", "hello");
        expect(parsed.command).toBe("demo");
        expect(parsed.positionals).toEqual({ text: "hello", difficulty: undefined });
        expect(parsed.options).toEqual({
            limit: 50,
            offset: 0,
            sort: "default",
            rank: undefined,
            diff: undefined,
            tags: undefined,
            level: undefined,
            constant: undefined,
            ratio: undefined,
            asc: false,
            upload: true,
            qr: undefined,
            name: undefined,
            version: undefined,
            groupBy: undefined,
        });
        expect(parsed.global).toEqual({
            pretty: false,
            format: undefined,
            verbose: false,
            offline: false,
        });
    });

    it("matches a command inside a group", () => {
        expect(accepted("user", "list").command).toBe("user list");
        const bind = accepted("user", "bind", "0", "lxns");
        expect(bind.command).toBe("user bind");
        expect(bind.positionals).toEqual({ user: "0", source: "lxns" });
    });

    it("rejects an unknown command and suggests the nearest ones", () => {
        const result = rejected("dmeo", "hello");
        expect(result.message).toBe("未知命令「dmeo」");
        expect(result.candidates).toEqual([{ ref: "demo" }]);
        expect(result.error.fix).toBe("saltnet --help");
        expect(result.command).toBeUndefined();
    });

    it("does not repeat a command word that looks like a secret", () => {
        const secret = "SGWCMAID".concat("0123456789ABCDEF".repeat(5));
        const result = rejected(secret);
        expect(result.message).toBe("未知命令");
        expect(printed(result.error)).not.toContain(secret);
    });

    it("rejects a group without a subcommand and lists the choices", () => {
        const result = rejected("user");
        expect(result.message).toContain("需要子命令：list、bind");
        expect(result.candidates).toEqual([{ ref: "user list" }, { ref: "user bind" }]);
        expect(result.error.fix).toBe("saltnet user --help");
    });

    it("rejects an unknown subcommand and suggests the nearest one", () => {
        const result = rejected("user", "bnd");
        expect(result.message).toContain("「user」没有子命令「bnd」");
        expect(result.candidates).toEqual([{ ref: "user bind" }]);
    });

    it("shows the command list for a bare invocation", () => {
        expect(parse()).toEqual({ kind: "help", target: { kind: "root" } });
    });
});

describe("positional arguments", () => {
    it("takes optional ones when given", () => {
        expect(accepted("demo", "hello", "mas").positionals).toEqual({
            text: "hello",
            difficulty: "mas",
        });
    });

    it("collects the rest into a variadic argument", () => {
        expect(accepted("fav", "add", "练习", "834", "11451-3", "link").positionals).toEqual({
            folder: "练习",
            songs: ["834", "11451-3", "link"],
        });
    });

    it("rejects a missing argument by name", () => {
        expect(rejected("demo").message).toBe("缺少参数 <文本>");
        expect(rejected("user", "bind", "0").message).toBe("缺少参数 <来源>");
        expect(rejected("fav", "add", "练习").message).toBe("缺少参数 <曲目>");
    });

    it("rejects extra arguments without repeating them", () => {
        const result = rejected("demo", "a", "b", "TOKEN-LOOKING-VALUE");
        expect(result.message).toBe("多余的位置参数：这个命令最多接受 2 个");
        expect(printed(result.error)).not.toContain("TOKEN-LOOKING-VALUE");
        expect(rejected("user", "list", "0").message).toBe("这个命令不接受位置参数");
    });

    it("treats everything after -- as arguments", () => {
        const parsed = accepted("demo", "--", "--weird", "-x");
        expect(parsed.positionals).toEqual({ text: "--weird", difficulty: "-x" });
        // The words after -- still start with the command when none was named yet.
        expect(accepted("--", "demo", "x").command).toBe("demo");
    });

    it("treats a negative number and a lone dash as arguments", () => {
        expect(accepted("demo", "-5", "-").positionals).toEqual({ text: "-5", difficulty: "-" });
    });
});

describe("option syntax", () => {
    it("takes a value after the flag or after =", () => {
        const parsed = accepted("demo", "x", "--limit", "10", "--sort=constant", "--name=a=b");
        expect(parsed.options).toMatchObject({ limit: 10, sort: "constant", name: "a=b" });
    });

    it("accepts options before, between and after the arguments", () => {
        const parsed = accepted("demo", "--limit", "3", "hello", "--asc", "mas");
        expect(parsed.positionals).toEqual({ text: "hello", difficulty: "mas" });
        expect(parsed.options).toMatchObject({ limit: 3, asc: true });
    });

    it("lets a command option be named version without confusing it with --version", () => {
        expect(accepted("demo", "x", "--version", "熊").options.version).toBe("熊");
        expect(parse("--version")).toEqual({ kind: "version" });
    });

    it("rejects an unknown option and suggests the nearest ones", () => {
        const result = rejected("demo", "x", "--lmit", "5");
        expect(result.message).toBe("未知选项「--lmit」");
        expect(result.candidates).toEqual([{ ref: "--limit" }]);
        expect(result.error.fix).toBe("saltnet demo --help");
        expect(result.command?.spec.name).toBe("demo");
    });

    it("suggests a flag by its start", () => {
        expect(rejected("demo", "x", "--group").candidates).toEqual([{ ref: "--group-by" }]);
    });

    it("rejects an unknown option with nothing close to suggest", () => {
        const result = rejected("demo", "x", "--zzzzzzzz");
        expect(result.message).toBe("未知选项「--zzzzzzzz」");
        expect(result.candidates).toBeUndefined();
    });

    it("rejects a command option written before the command", () => {
        const result = rejected("--limit", "5", "demo", "x");
        expect(result.message).toContain("命令名之前只能写全局选项");
        expect(result.message).toContain("--pretty");
    });

    it("rejects short options other than -h", () => {
        expect(rejected("demo", "x", "-l", "5").message).toContain("不支持短选项");
    });

    it("rejects an option written twice, but merges a list", () => {
        expect(rejected("demo", "x", "--limit", "5", "--limit", "6").message).toBe(
            "选项 --limit 写了多次"
        );
        expect(accepted("demo", "x", "--diff", "mas", "--diff", "rem").options.diff).toEqual([
            "MASTER",
            "Re:MASTER",
        ]);
    });

    it("rejects a flag with nothing after it", () => {
        expect(rejected("demo", "x", "--limit").message).toBe("选项 --limit 缺少值");
        expect(rejected("demo", "x", "--name", "--asc").message).toBe("选项 --name 缺少值");
        expect(rejected("demo", "x", "--name", "-x").message).toBe("选项 --name 缺少值");
    });

    it("does not take a flag's value for the next option or for the terminator", () => {
        expect(rejected("demo", "x", "--name", "--").message).toBe("选项 --name 缺少值");
    });

    it("accepts a value that begins with a dash after =", () => {
        expect(accepted("demo", "x", "--name=-x").options.name).toBe("-x");
        expect(accepted("demo", "x", "--name", "-").options.name).toBe("-");
    });

    it("reports the bad value before the argument that is missing because of it", () => {
        // `abc` is consumed with its flag, so `<文本>` is missing too; the first problem wins.
        expect(rejected("demo", "--limit", "abc").message).toBe("选项 --limit 需要整数「abc」");
    });
});

describe("switches", () => {
    it("turns a switch on with the flag and off with --no-", () => {
        expect(accepted("demo", "x", "--asc").options.asc).toBe(true);
        expect(accepted("demo", "x", "--no-upload").options.upload).toBe(false);
        expect(accepted("demo", "x", "--upload").options.upload).toBe(true);
    });

    it("also takes true and false after =", () => {
        expect(accepted("demo", "x", "--asc=true").options.asc).toBe(true);
        expect(accepted("demo", "x", "--upload=FALSE").options.upload).toBe(false);
        expect(rejected("demo", "x", "--asc=maybe").message).toContain("只接受 true 或 false");
    });

    it("rejects --no- for something that is not a switch, and a value after it", () => {
        expect(rejected("demo", "x", "--no-limit").message).toBe(
            "选项 --limit 不是开关，不能写成 --no-limit"
        );
        expect(rejected("demo", "x", "--no-asc=true").message).toBe("--no-asc 不带值");
        expect(rejected("demo", "x", "--no-bogus").message).toBe("未知选项「--no-bogus」");
    });

    it("rejects contradicting switches", () => {
        expect(rejected("demo", "x", "--asc", "--no-asc").message).toBe("选项 --asc 写了多次");
    });

    it("does not let a switch take the next word as its value", () => {
        const parsed = accepted("demo", "--asc", "hello");
        expect(parsed.options.asc).toBe(true);
        expect(parsed.positionals.text).toBe("hello");
    });
});

describe("enum options", () => {
    it("matches ignoring case and maps aliases to the canonical value", () => {
        expect(accepted("demo", "x", "--sort", "ACH").options.sort).toBe("achievements");
        expect(accepted("demo", "x", "--sort", "CONSTANT").options.sort).toBe("constant");
        expect(accepted("demo", "x", "--rank", "sssp").options.rank).toBe("SSS+");
        expect(accepted("demo", "x", "--rank", "SSS+").options.rank).toBe("SSS+");
        expect(accepted("demo", "x", "--rank", "s+").options.rank).toBe("S+");
        expect(accepted("demo", "x", "--group-by", "version").options.groupBy).toBe("version");
    });

    it("lists the choices and suggests the nearest for an unknown value", () => {
        const result = rejected("demo", "x", "--sort", "constnt");
        expect(result.message).toBe(
            "选项 --sort 的值「constnt」不在可选范围内；可选值：default、constant、achievements"
        );
        expect(result.candidates).toEqual([{ ref: "constant" }]);
    });

    it("suggests the canonical value for a near alias", () => {
        expect(rejected("demo", "x", "--rank", "sss++").candidates).toEqual([
            { ref: "SSS+" },
            { ref: "SSS" },
        ]);
    });

    it("rejects an unknown global format", () => {
        const result = rejected("demo", "x", "--format", "yaml");
        expect(result.message).toContain("可选值：json、tsv、text");
    });
});

describe("list options", () => {
    it("splits on commas and converts each item", () => {
        expect(accepted("demo", "x", "--diff", "mas,REM").options.diff).toEqual([
            "MASTER",
            "Re:MASTER",
        ]);
        expect(accepted("demo", "x", "--diff", "3, 4").options.diff).toEqual([
            "MASTER",
            "Re:MASTER",
        ]);
        expect(accepted("demo", "x", "--tags", "a,b,c").options.tags).toEqual(["a", "b", "c"]);
    });

    it("removes duplicates and keeps the order", () => {
        expect(accepted("demo", "x", "--diff", "rem,mas,4").options.diff).toEqual([
            "Re:MASTER",
            "MASTER",
        ]);
    });

    it("rejects an empty item and an unknown item", () => {
        expect(rejected("demo", "x", "--diff", "mas,,rem").message).toContain("列表里有空项");
        expect(rejected("demo", "x", "--diff", "mas,").message).toContain("列表里有空项");
        expect(rejected("demo", "x", "--diff", "mas,zzz").message).toContain("不在可选范围内");
    });
});

describe("range options", () => {
    it("reads a single value as both ends", () => {
        expect(accepted("demo", "x", "--level", "13+").options.level).toEqual({
            from: "13+",
            to: "13+",
        });
    });

    it("reads two ends, and one open end", () => {
        expect(accepted("demo", "x", "--level", "13..14").options.level).toEqual({
            from: "13",
            to: "14",
        });
        expect(accepted("demo", "x", "--level", "14..").options.level).toEqual({
            from: "14",
            to: null,
        });
        expect(accepted("demo", "x", "--level", "..12+").options.level).toEqual({
            from: null,
            to: "12+",
        });
    });

    it("reads a decimal range without mistaking the dot for the separator", () => {
        expect(accepted("demo", "x", "--constant", "13.5..14.0").options.constant).toEqual({
            from: 13.5,
            to: 14,
        });
        expect(accepted("demo", "x", "--constant", "13.5..").options.constant).toEqual({
            from: 13.5,
            to: null,
        });
        expect(accepted("demo", "x", "--constant", "14.2").options.constant).toEqual({
            from: 14.2,
            to: 14.2,
        });
    });

    it("rejects an empty range, a reversed one and a non-number end", () => {
        expect(rejected("demo", "x", "--level", "..").message).toContain("至少要写一端");
        expect(rejected("demo", "x", "--constant", "14..13").message).toContain("下限大于上限");
        expect(rejected("demo", "x", "--constant", "a..b").message).toContain("需要数字");
        expect(rejected("demo", "x", "--constant", "13...14").message).toContain("需要数字");
    });
});

describe("number options", () => {
    it("checks the bounds of an integer", () => {
        expect(accepted("demo", "x", "--limit", "500").options.limit).toBe(500);
        expect(rejected("demo", "x", "--limit", "0").message).toBe(
            "选项 --limit 的值要在 1 到 500 之间"
        );
        expect(rejected("demo", "x", "--limit", "501").message).toContain("1 到 500");
        expect(rejected("demo", "x", "--offset", "-1").message).toBe(
            "选项 --offset 的值不能小于 0"
        );
    });

    it("rejects text and decimals where an integer is expected", () => {
        expect(rejected("demo", "x", "--limit", "abc").message).toBe(
            "选项 --limit 需要整数「abc」"
        );
        expect(rejected("demo", "x", "--limit", "1.5").message).toBe(
            "选项 --limit 需要整数「1.5」"
        );
        expect(rejected("demo", "x", "--limit", "1e3").message).toContain("需要整数");
        expect(rejected("demo", "x", "--limit", "99999999999999999999").message).toContain("太大");
    });

    it("takes a negative number as a value, not as an option", () => {
        expect(accepted("demo", "x", "--ratio", "-1.5").options.ratio).toBe(-1.5);
        expect(accepted("demo", "x", "--ratio=-3").options.ratio).toBe(-3);
        expect(rejected("demo", "x", "--ratio", "11").message).toContain("-10 到 10");
    });
});

describe("string options", () => {
    it("accepts text, including Chinese", () => {
        expect(accepted("demo", "x", "--name", "熊極").options.name).toBe("熊極");
    });

    it("rejects an empty value", () => {
        expect(rejected("demo", "x", "--name=").message).toBe("选项 --name 的值不能为空");
        expect(rejected("demo", "x", "--name", "").message).toBe("选项 --name 的值不能为空");
    });

    it("requires an option marked required", () => {
        expect(accepted("needs", "--target", "a").options).toEqual({ target: "a" });
        expect(rejected("needs").message).toBe("缺少必填选项 --target");
    });
});

describe("credential options", () => {
    it("accepts only a dash, which means stdin", () => {
        expect(accepted("demo", "x", "--qr", "-").options.qr).toBe("-");
        expect(accepted("user", "bind", "0", "df-token", "--token", "-").options).toEqual({
            token: "-",
        });
    });

    it("rejects the secret itself and never repeats it", () => {
        const secret = "SGWCMAID".concat("9f8e7d6c5b4a39281706".repeat(4));
        for (const argv of [
            ["demo", "x", "--qr", secret],
            ["demo", "x", `--qr=${secret}`],
            ["demo", "x", "--qr", `https://example.test/cb?code=${secret}`],
        ]) {
            const result = rejected(...argv);
            expect(result.message).toBe(
                "选项 --qr 只接受 -，表示从 stdin 读取；凭据不能写在命令行里"
            );
            expect(printed(result.error)).not.toContain(secret);
        }
    });

    it("does not let a secret land among the arguments after a rejected flag", () => {
        const secret = "7f3a9c1e5b2d8a4f6c0e9b1d3a5f7c2e".repeat(4);
        const result = rejected("user", "bind", "0", "df-token", "--token", secret);
        expect(printed(result.error)).not.toContain(secret);
        expect(result.message).toContain("--token");
    });
});

describe("global options", () => {
    it("accepts them before the command, after it, or between its words", () => {
        expect(accepted("--pretty", "demo", "x").global.pretty).toBe(true);
        expect(accepted("demo", "x", "--pretty").global.pretty).toBe(true);
        expect(accepted("user", "--pretty", "list").global.pretty).toBe(true);
    });

    it("reads each of them", () => {
        const parsed = accepted("--format", "tsv", "demo", "x", "--verbose", "--offline");
        expect(parsed.global).toEqual({
            pretty: false,
            format: "tsv",
            verbose: true,
            offline: true,
        });
        expect(accepted("demo", "x", "--format=text").global.format).toBe("text");
        expect(accepted("demo", "x", "--no-pretty").global.pretty).toBe(false);
    });

    it("still applies the ones it understood when the line is rejected", () => {
        const result = rejected("demo", "x", "--bogus", "--pretty", "--verbose");
        expect(result.global.pretty).toBe(true);
        expect(result.global.verbose).toBe(true);
        expect(result.command?.spec.name).toBe("demo");
    });

    it("applies them even when the command is unknown", () => {
        expect(rejected("nope", "--pretty").global.pretty).toBe(true);
    });
});

describe("help and version", () => {
    it("shows help for the command, the group or the root", () => {
        const demoHelp = parse("demo", "--help");
        expect(demoHelp.kind).toBe("help");
        if (demoHelp.kind === "help" && demoHelp.target.kind === "command") {
            expect(demoHelp.target.command.spec.name).toBe("demo");
        } else {
            expect.unreachable("expected help for a command");
        }
        expect(parse("user", "--help")).toMatchObject({ kind: "help", target: { kind: "group" } });
        expect(parse("--help")).toEqual({ kind: "help", target: { kind: "root" } });
        expect(parse("-h")).toEqual({ kind: "help", target: { kind: "root" } });
        expect(parse("user", "list", "-h")).toMatchObject({
            kind: "help",
            target: { kind: "command" },
        });
    });

    it("prefers help over any other mistake on the line", () => {
        expect(parse("demo", "--bogus", "--limit", "abc", "--help").kind).toBe("help");
        expect(parse("demo", "--help", "--bogus").kind).toBe("help");
        expect(parse("needs", "--help").kind).toBe("help");
    });

    it("does not show help for a command that does not exist", () => {
        expect(rejected("bogus", "--help").message).toBe("未知命令「bogus」");
        expect(rejected("user", "bogus", "--help").message).toContain("没有子命令");
        expect(rejected("user", "--help", "bogus").message).toContain("没有子命令");
    });

    it("prints the version only before a command", () => {
        expect(parse("--version")).toEqual({ kind: "version" });
        // After a command it is that command's own option, and `needs` has none.
        expect(rejected("needs", "--version").message).toBe("未知选项「--version」");
        expect(rejected("demo", "x", "--version").message).toBe("选项 --version 缺少值");
        expect(rejected("--version=1").message).toBe("--version 不带值");
    });
});
