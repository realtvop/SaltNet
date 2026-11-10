import { describe, expect, it } from "vitest";
import { createRegistry } from "../../src/commands";
import { renderHelp } from "../../src/commands/help";
import { buildRegistry, defineCommand } from "../../src/commands/registry";
import { displayWidth } from "../../src/util/width";
import { createTestRegistry, demo, favAdd, userList } from "./fixtures";

const registry = createTestRegistry();

/** The lines of a help text, without the newline that ends it. */
function lines(text: string): string[] {
    expect(text.endsWith("\n")).toBe(true);
    return text.slice(0, -1).split("\n");
}

function help(...words: string[]): string {
    const resolution = registry.resolve(words);
    if (resolution.kind === "command") {
        return renderHelp(registry, { kind: "command", command: resolution.command }, "9.9.9");
    }
    if (resolution.kind === "group") {
        return renderHelp(registry, { kind: "group", group: resolution.group }, "9.9.9");
    }
    return renderHelp(registry, { kind: "root" }, "9.9.9");
}

describe("root help", () => {
    it("lists the commands under their headings, with groups folded into one line", () => {
        expect(lines(help())).toEqual([
            "saltnet 9.9.9",
            "舞萌 DX（国服）的曲库、成绩和账号命令行工具，输出默认是给程序读的 JSON。",
            "",
            "用法：",
            "  saltnet <命令> [参数] [选项]",
            "",
            "曲目与谱面",
            "  demo <文本> [difficulty]  演示每种参数类型",
            "",
            "用户、同步、账号",
            "  user                      管理用户（list、bind）",
            "",
            "收藏夹、数据管理、自描述",
            "  needs                     有必填选项的命令",
            "  fav                       管理收藏夹（add）",
            "",
            "全局选项：",
            "  -h, --help                显示帮助",
            "  --pretty                  输出带缩进的 JSON，默认压缩成一行",
            "  --format <json|tsv|text>  输出格式：json 给程序，tsv 只用于列表，text 给人看（不保证稳定）",
            "  --verbose                 总是把日志写到 stderr；默认只在终端里显示",
            "  --offline                 禁止联网：过期的缓存照常使用，没有缓存时报错",
            "",
            "更多：",
            "  saltnet <命令> --help  某个命令的用法",
        ]);
    });

    it("points to schema and guide only when they exist", () => {
        const plain = help();
        expect(plain).not.toContain("saltnet schema");
        expect(plain).not.toContain("saltnet guide");

        const extra = (name: string) =>
            defineCommand(
                { name, summary: "x", category: "data", effect: "none", output: "object" },
                () => ({ data: null })
            );
        const full = buildRegistry({ commands: [extra("schema"), extra("guide")] });
        const text = renderHelp(full, { kind: "root" }, "1.0.0");
        expect(text).toContain("saltnet schema [命令]");
        expect(text).toContain("给 agent 的使用指南");
    });

    it("says so while there are no commands", () => {
        expect(renderHelp(createRegistry(), { kind: "root" }, "0.1.0")).toContain(
            "（还没有可用的命令）"
        );
    });
});

describe("group help", () => {
    it("lists the subcommands with their arguments", () => {
        expect(lines(help("user"))).toEqual([
            "saltnet user — 管理用户",
            "",
            "用法：",
            "  saltnet user <子命令> [参数] [选项]",
            "",
            "子命令：",
            "  list                列出用户",
            "  bind <用户> <来源>  绑定数据来源",
            "",
            "全局选项：",
            "  -h, --help                显示帮助",
            "  --pretty                  输出带缩进的 JSON，默认压缩成一行",
            "  --format <json|tsv|text>  输出格式：json 给程序，tsv 只用于列表，text 给人看（不保证稳定）",
            "  --verbose                 总是把日志写到 stderr；默认只在终端里显示",
            "  --offline                 禁止联网：过期的缓存照常使用，没有缓存时报错",
            "",
            "用 saltnet user <子命令> --help 查看子命令的用法。",
        ]);
    });
});

describe("command help", () => {
    it("describes arguments, options, examples and the effect", () => {
        const text = help("demo");
        expect(lines(text)).toEqual([
            "saltnet demo — 演示每种参数类型",
            "",
            "用法：",
            "  saltnet demo <文本> [difficulty] [选项]",
            "",
            "把收到的参数原样返回，用来测试解析器。",
            "第二段说明。",
            "",
            "参数：",
            "  <文本>        要处理的文本",
            "  [difficulty]  难度",
            "",
            "选项：",
            "  --limit <整数>                 每页条数（范围：1 到 500；默认：50）",
            "  --offset <整数>                跳过的条数（最小：0；默认：0）",
            "  --sort <值>                    排序方式（可选：default、constant、achievements；默认：default）",
            "  --rank <SSS+|SSS|S+>           评级",
            "  --diff <值,值>                 难度（可选：MASTER、Re:MASTER）",
            "  --tags <值,值,…>               标签",
            "  --level <起..止>               等级",
            "  --constant <起..止>            定数",
            "  --ratio <数字>                 一个数字（范围：-10 到 10）",
            "  --asc                          升序",
            "  --[no-]upload                  上传结果（默认开启）",
            "  --qr -                         二维码，从 stdin 读取",
            "  --name <文本>                  名称",
            "  --version <文本>               版本名",
            "  --group-by <constant|version>  分组",
            "",
            "示例：",
            "  saltnet demo hello --limit 3",
            "    取前三条",
            "  saltnet demo 'two words' --diff mas,rem",
            "    带空格的文本",
            "",
            "副作用：无，只读",
            "",
            "全局选项：",
            "  -h, --help                显示帮助",
            "  --pretty                  输出带缩进的 JSON，默认压缩成一行",
            "  --format <json|tsv|text>  输出格式：json 给程序，tsv 只用于列表，text 给人看（不保证稳定）",
            "  --verbose                 总是把日志写到 stderr；默认只在终端里显示",
            "  --offline                 禁止联网：过期的缓存照常使用，没有缓存时报错",
        ]);
    });

    it("writes a long enum as <值> and lists its values in the note", () => {
        expect(help("demo")).toContain("--sort <值>");
        expect(help("demo")).toContain("可选：default、constant、achievements");
        expect(help("demo")).toContain("--rank <SSS+|SSS|S+>");
    });

    it("leaves out the sections a command has nothing for", () => {
        const text = help("user", "list");
        expect(text).not.toContain("参数：");
        expect(text).not.toContain("选项：\n  --");
        expect(text).not.toContain("示例：");
        expect(text).toContain("  saltnet user list\n");
        expect(text).toContain("全局选项：");
    });

    it("shows variadic and optional arguments the usual way", () => {
        expect(help("fav", "add")).toContain("saltnet fav add <收藏夹> <曲目...>");
        expect(renderHelp(registry, { kind: "command", command: favAdd }, "1")).toContain(
            "  <曲目...>  曲目引用\n"
        );
        const optionalRest = defineCommand(
            {
                name: "rest",
                summary: "x",
                category: "data",
                effect: "none",
                output: "object",
                positionals: [{ name: "items", description: "x", variadic: true, optional: true }],
            },
            () => ({ data: null })
        );
        const text = renderHelp(
            buildRegistry({ commands: [optionalRest] }),
            { kind: "command", command: optionalRest },
            "1"
        );
        expect(text).toContain("saltnet rest [items...]");
        expect(text).toContain("  [items...]  x\n");
    });

    it("names the effect level", () => {
        expect(help("user", "bind")).toContain("副作用：账号，会登录或改动舞萌账号");
        expect(help("needs")).toContain("副作用：本地，只改本机的数据或文件");
        expect(help("needs")).toContain("--target <文本>  目标（必填）");
    });

    it("keeps columns aligned around Chinese text", () => {
        const rows = lines(help("demo"));
        const column = (label: string, text: string) => {
            const row = rows.find(candidate => candidate.startsWith(`  ${label}`));
            expect(row).toBeDefined();
            return displayWidth(row!.slice(0, row!.indexOf(text)));
        };
        // `<文本>` is four characters but six columns wide; both descriptions start together.
        expect(column("<文本>", "要处理的文本")).toBe(column("[difficulty]", "难度"));
        expect(column("--qr", "二维码")).toBe(column("--limit", "每页条数"));
    });

    it("renders every real command without throwing", () => {
        for (const command of createRegistry().commands) {
            expect(() =>
                renderHelp(createRegistry(), { kind: "command", command }, "1")
            ).not.toThrow();
        }
        expect(demo.spec.name).toBe("demo");
        expect(userList.spec.name).toBe("user list");
    });
});
