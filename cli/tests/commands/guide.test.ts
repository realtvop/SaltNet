import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PUBLIC_VIEWS } from "../../src/catalog/views";
import { createRegistry } from "../../src/commands";
import { commandUsage, positionalPlaceholder } from "../../src/commands/describe";
import { parseArgv } from "../../src/commands/parse";
import {
    buildRegistry,
    commandOptionEntries,
    defineCommand,
    GLOBAL_OPTION_ENTRIES,
} from "../../src/commands/registry";
import { ERROR_CODES } from "../../src/errors";
import {
    GUIDE_GLOSSARY,
    GUIDE_INTRO,
    GUIDE_QUESTIONS,
    GUIDE_RULES,
    SKILL_DESCRIPTION,
    SKILL_NAME,
} from "../../src/guide/handwritten";
import { escapeTableCell, renderGuide } from "../../src/guide/markdown";
import { WARNING_CODES } from "../../src/output/warning";
import { splitCommandLine } from "../../src/util/shell";
import { commandIn } from "../commandRun";
import { COMMANDS_WITHOUT_EXAMPLES } from "../examples";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

describe("guide command", () => {
    it("prints deterministic Markdown with all generated sections", async () => {
        const first = await commandIn(makeHome(), "guide", []);
        const second = await commandIn(makeHome(), "guide", []);
        expect(first.code).toBe(0);
        expect(first.stdout.startsWith("# saltnet 使用指南\n")).toBe(true);
        expect(() => JSON.parse(first.stdout)).toThrow();
        expect(first.stdout).toContain("版本：`saltnet 9.9.9`");
        expect(second.stdout).toBe(first.stdout);

        const sections = [
            "## 先看这几条",
            "## 常见问题怎么查",
            "## 术语",
            "## 退出码",
            "## 命令",
            "## 全局选项",
            "## 错误码",
            "## 警告",
            "## 只读视图",
        ];
        let previous = -1;
        for (const section of sections) {
            const index = first.stdout.indexOf(section);
            expect(index, section).toBeGreaterThan(previous);
            previous = index;
        }

        for (const rule of GUIDE_RULES) expect(first.stdout).toContain(rule);
        GUIDE_RULES.forEach((rule, index) => expect(rule).toMatch(new RegExp(`^${index + 1}\\. `)));
        // What an agent must not get wrong: secrets only through stdin, no sync it was not asked
        // for, never confirming for the user.
        for (const phrase of ["只通过 stdin 传入", "不要主动同步", "不能替用户确认"]) {
            expect(GUIDE_RULES.join("\n")).toContain(phrase);
        }
        for (const question of GUIDE_QUESTIONS) expect(first.stdout).toContain(question);
        expect(first.stdout).toContain("| 说法 | 意思 | 在 saltnet 里 |\n| --- | --- | --- |\n");
        for (const row of GUIDE_GLOSSARY) {
            expect(first.stdout).toContain(`\n| ${row.map(escapeTableCell).join(" | ")} |\n`);
        }
    });

    it("prints the same guide as a Claude Code skill with --skill", async () => {
        const plain = await commandIn(makeHome(), "guide", []);
        const skill = await commandIn(makeHome(), "guide", ["--skill"]);
        expect(skill.code).toBe(0);
        const frontmatter = /^---\nname: ([^\n]*)\ndescription: ([^\n]*)\n---\n\n/.exec(
            skill.stdout
        );
        expect(frontmatter, skill.stdout.slice(0, 200)).not.toBeNull();
        expect(frontmatter![1]).toBe(SKILL_NAME);
        expect(JSON.parse(frontmatter![2]!)).toBe(SKILL_DESCRIPTION);
        expect(skill.stdout.slice(frontmatter![0].length)).toBe(plain.stdout);
        // What Claude Code accepts as a skill's name and description.
        expect(SKILL_NAME).toMatch(/^[a-z0-9-]{1,64}$/);
        expect(SKILL_DESCRIPTION.length).toBeLessThanOrEqual(1024);
    });

    it("names only commands and options that exist in the hand-written parts", () => {
        const registry = createRegistry();
        const firstWords = new Set(registry.commands.map(command => command.words[0]));
        const names = new Set(registry.commands.map(command => command.words.join(" ")));
        // The command a line starts with: the longest name whose words begin it.
        const commandOf = (words: readonly string[]) =>
            [...registry.commands]
                .sort((left, right) => right.words.length - left.words.length)
                .find(command => command.words.every((word, index) => words[index] === word));
        const texts = [
            ...GUIDE_INTRO,
            ...GUIDE_RULES,
            ...GUIDE_QUESTIONS,
            ...GUIDE_GLOSSARY.flat(),
        ];
        const parsed: string[] = [];
        const placeholders: string[] = [];
        for (const text of texts) {
            for (const [, span] of text.matchAll(/`([^`]+)`/g)) {
                if (span!.includes("…")) continue;
                const words = splitCommandLine(span!);
                const complete = words[0] === "saltnet";
                if (complete) words.shift();
                // Without `saltnet`, one word is a field or an option, unless it is a whole command,
                // and a command's name such as `collection show` names it without running it.
                if (!complete && (words.length < 2 || !firstWords.has(words[0]!))) continue;
                if (!complete && names.has(words.join(" "))) continue;
                if (span!.includes("<")) {
                    // `<谱面>` stands for something the agent fills in, so the line cannot run as
                    // written; its command and every option it names must still exist.
                    const command = commandOf(words);
                    expect(command, span).toBeDefined();
                    const flags = new Set(
                        [...commandOptionEntries(command!), ...GLOBAL_OPTION_ENTRIES].flatMap(
                            entry =>
                                entry.spec.kind === "boolean"
                                    ? [entry.flag, `no-${entry.flag}`]
                                    : [entry.flag]
                        )
                    );
                    for (const word of words.filter(word => word.startsWith("--"))) {
                        expect(flags.has(word.slice(2)), `${span}: ${word}`).toBe(true);
                    }
                    placeholders.push(span!);
                    continue;
                }
                const outcome = parseArgv(registry, words);
                const reason = outcome.kind === "error" ? outcome.error.message : outcome.kind;
                expect(reason, span).toBe("run");
                parsed.push(span!);
            }
        }
        expect(parsed).toEqual(
            expect.arrayContaining([
                "saltnet status",
                "charts --plate 熊極 --missing",
                "charts --group-by rank --limit 1 --fields chartKey",
                "sync --qr -",
                "b50 --mode fit",
            ])
        );
        expect(placeholders).toEqual(
            expect.arrayContaining([
                "chart <谱面> --with stages",
                "charts --fav <收藏夹> --diff <难度>",
                "user bind <用户> lxns --callback -",
            ])
        );
    });

    it("has a usage heading and executable example block for every command", async () => {
        const { stdout } = await commandIn(makeHome(), "guide", []);
        const registry = createRegistry();
        for (const command of registry.commands) {
            expect(stdout).toContain(`#### \`${commandUsage(command)}\``);
            if (COMMANDS_WITHOUT_EXAMPLES.has(command.spec.name)) {
                expect(command.spec.examples ?? [], command.spec.name).toHaveLength(0);
                continue;
            }
            expect(command.spec.examples?.length, command.spec.name).toBeGreaterThan(0);
            for (const example of command.spec.examples ?? []) {
                expect(stdout).toContain(`# ${example.description}\nsaltnet ${example.command}`);
            }
        }
        const fences = stdout.match(/```bash\n[\s\S]*?\n```/g) ?? [];
        const withoutExamples = registry.commands.filter(c =>
            COMMANDS_WITHOUT_EXAMPLES.has(c.spec.name)
        );
        // Every exempt name is a registered command, so the count below is exact.
        expect(withoutExamples).toHaveLength(COMMANDS_WITHOUT_EXAMPLES.size);
        expect(fences).toHaveLength(registry.commands.length - withoutExamples.length);
    });

    it("prints exact exit rows, every error and warning, and every view", async () => {
        const { stdout } = await commandIn(makeHome(), "guide", []);
        expect(stdout).toContain(
            "| 2 | 用法错误 | `USAGE`、`SQL_ERROR`、`INVALID_BACKUP`、`FILE_EXISTS` | 命令写错了：看 `error.message` 和 `error.candidates` 改正后再运行 |"
        );
        expect(stdout).toContain(
            "| 6 | 需要确认 | `CONFIRMATION_REQUIRED` | 把预览原样给用户看，用户明确同意后再带上确认码重新运行；不能替用户确认 |"
        );
        for (const code of ERROR_CODES) expect(stdout).toContain(`| \`${code}\` |`);
        for (const code of Object.keys(WARNING_CODES)) {
            expect(stdout).toContain(`| \`${code}\` |`);
        }
        for (const view of PUBLIC_VIEWS) expect(stdout).toContain(`- \`${view.name}\`：`);
    });

    it("includes the scores category once it has commands", async () => {
        const { stdout } = await commandIn(makeHome(), "guide", []);
        expect(stdout).toContain("### 成绩");
        expect(stdout).toContain("#### `saltnet b50 [选项]`");
        expect(stdout).toContain("#### `saltnet rating [选项]`");
        expect(stdout).toContain("### 用户、同步、账号");
    });

    it("formats a made-up command and escapes Markdown table cells", () => {
        const sample = defineCommand(
            {
                name: "sample",
                summary: "示例命令",
                category: "data",
                effect: "local",
                output: "object",
                positionals: [{ name: "thing", valueName: "东西", description: "要处理的东西" }],
                options: {
                    count: {
                        kind: "integer",
                        min: 1,
                        max: 3,
                        default: 2,
                        description: "数量",
                    },
                },
                examples: [{ command: "sample x --count 2", description: "处理一个东西" }],
            },
            () => ({ data: {} })
        );
        const text = renderGuide(buildRegistry({ commands: [sample] }), "1.0.0");
        expect(text).toContain("#### `saltnet sample <东西> [选项]`");
        expect(text).toContain(
            `- \`${positionalPlaceholder(sample.spec.positionals![0])}\`：要处理的东西`
        );
        expect(text).toContain("- `--count <整数>`：数量（范围：1 到 3；默认：2）");
        expect(text).toContain("# 处理一个东西\nsaltnet sample x --count 2");
        expect(text).toContain("副作用：本地，只改本机的数据或文件");
        expect(escapeTableCell("左|右")).toBe("左\\|右");
    });

    it("works with broken config, creates no fresh home, and rejects tsv", async () => {
        const fresh = makeHome();
        const result = await commandIn(fresh, "guide", []);
        expect(result.code).toBe(0);
        expect(existsSync(fresh.home)).toBe(false);

        const broken = makeHome();
        mkdirSync(broken.home, { recursive: true });
        writeFileSync(broken.config, "{");
        const brokenResult = await commandIn(broken, "guide", []);
        expect(brokenResult.code).toBe(0);

        const tsv = await commandIn(makeHome(), "guide", ["--format", "tsv"]);
        expect(tsv.code).toBe(2);
        expect(tsv.json.error.code).toBe("USAGE");
    });
});
