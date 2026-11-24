/**
 * The Markdown `saltnet guide` prints (design 6.1): the hand-written parts of `handwritten.ts`
 * (rules, questions, glossary) followed by sections generated from the same registry and tables the
 * parser and `schema` use, so the guide cannot disagree with the behavior. `guide --skill` prints
 * the same text as a Claude Code skill. The output depends only on the registry and the version, so
 * the same build always prints the same text.
 */
import type { CommandCategory, Registry } from "../commands/registry";
import type { ErrorCode } from "../errors";
import { PUBLIC_VIEWS, VIEWS_VERSION } from "../catalog/views";
import {
    commandUsage,
    optionLabel,
    optionNotes,
    positionalPlaceholder,
} from "../commands/describe";
import {
    COMMAND_CATEGORIES,
    commandOptionEntries,
    EFFECT_LABELS,
    GLOBAL_OPTION_ENTRIES,
} from "../commands/registry";
import {
    ERROR_CODES,
    ERROR_DESCRIPTIONS,
    EXIT_CODE_MEANINGS,
    exitCodeOf,
    isRetryableByDefault,
} from "../errors";
import { WARNING_CODES } from "../output/warning";
import {
    EXIT_CODE_ADVICE,
    GUIDE_GLOSSARY,
    GUIDE_INTRO,
    GUIDE_QUESTIONS,
    GUIDE_RULES,
    GUIDE_TITLE,
    SKILL_DESCRIPTION,
    SKILL_NAME,
} from "./handwritten";

export function escapeTableCell(text: string): string {
    return text.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function errorCodesForExit(exitCode: number): readonly ErrorCode[] {
    return ERROR_CODES.filter(code => exitCodeOf(code) === exitCode);
}

function codeList(codes: readonly string[]): string {
    return codes.length === 0 ? "—" : codes.map(code => `\`${code}\``).join("、");
}

function pushSection(lines: string[], title: string, content: readonly string[]): void {
    lines.push(`## ${title}`, "", ...content, "");
}

function commandLines(command: Registry["commands"][number]): string[] {
    const { spec } = command;
    const lines = [`#### \`${commandUsage(command)}\``, "", spec.summary, ""];
    if (spec.description) lines.push(spec.description.trim(), "");

    const positionals = spec.positionals ?? [];
    if (positionals.length > 0) {
        lines.push("参数：", "");
        for (const positional of positionals) {
            lines.push(`- \`${positionalPlaceholder(positional)}\`：${positional.description}`);
        }
        lines.push("");
    }

    const options = commandOptionEntries(command);
    if (options.length > 0) {
        lines.push("选项：", "");
        for (const entry of options) {
            lines.push(
                `- \`${optionLabel(entry)}\`：${entry.spec.description}${optionNotes(entry)}`
            );
        }
        lines.push("");
    }

    const examples = spec.examples ?? [];
    if (examples.length > 0) {
        lines.push("示例：", "", "```bash");
        for (const example of examples) {
            lines.push(`# ${example.description}`, `saltnet ${example.command}`);
        }
        lines.push("```", "");
    }

    lines.push(`副作用：${EFFECT_LABELS[spec.effect]}`, "");
    return lines;
}

function needsLabel(needs: readonly string[]): string {
    if (needs.length === 0) return "不需要下载";
    return needs.map(need => (need === "catalog" ? "曲库" : "收藏品")).join("、");
}

/** Builds the complete agent guide, ending in one newline. */
export function renderGuide(registry: Registry, version: string): string {
    const lines: string[] = [
        `# ${GUIDE_TITLE}`,
        "",
        `版本：\`saltnet ${version}\``,
        "",
        ...GUIDE_INTRO,
        "",
    ];

    pushSection(lines, "先看这几条", GUIDE_RULES);
    pushSection(lines, "常见问题怎么查", GUIDE_QUESTIONS);

    const glossaryRows = [
        "| 说法 | 意思 | 在 saltnet 里 |",
        "| --- | --- | --- |",
        ...GUIDE_GLOSSARY.map(row => `| ${row.map(escapeTableCell).join(" | ")} |`),
    ];
    pushSection(lines, "术语", glossaryRows);

    const exitRows = [
        "| 退出码 | 含义 | 错误码 | 怎么办 |",
        "| ---: | --- | --- | --- |",
        ...Array.from({ length: 8 }, (_, exitCode) => {
            const advice = exitCode === 0 ? "—" : EXIT_CODE_ADVICE[exitCode];
            return `| ${exitCode} | ${escapeTableCell(EXIT_CODE_MEANINGS[exitCode])} | ${escapeTableCell(codeList(errorCodesForExit(exitCode)))} | ${escapeTableCell(advice)} |`;
        }),
    ];
    pushSection(lines, "退出码", exitRows);

    lines.push("## 命令", "");
    for (const category of Object.keys(COMMAND_CATEGORIES) as CommandCategory[]) {
        const commands = registry.commands.filter(command => command.spec.category === category);
        if (commands.length === 0) continue;
        lines.push(`### ${COMMAND_CATEGORIES[category]}`, "");
        for (const command of commands) lines.push(...commandLines(command));
    }

    const globalOptions = GLOBAL_OPTION_ENTRIES.map(
        entry => `- \`${optionLabel(entry)}\`：${entry.spec.description}${optionNotes(entry)}`
    );
    pushSection(lines, "全局选项", globalOptions);

    const errorRows = [
        "| 错误码 | 退出码 | 默认可重试 | 说明 |",
        "| --- | ---: | --- | --- |",
        ...ERROR_CODES.map(
            code =>
                `| \`${code}\` | ${exitCodeOf(code)} | ${isRetryableByDefault(code) ? "是" : "否"} | ${escapeTableCell(ERROR_DESCRIPTIONS[code])} |`
        ),
    ];
    pushSection(lines, "错误码", errorRows);

    const warningRows = [
        "| 警告 | 说明 |",
        "| --- | --- |",
        ...Object.entries(WARNING_CODES).map(
            ([code, description]) => `| \`${code}\` | ${escapeTableCell(description)} |`
        ),
    ];
    pushSection(lines, "警告", warningRows);

    const viewLines = [
        `\`saltnet sql\` 只能读取下面这些只读视图；当前视图版本是 ${VIEWS_VERSION}，列定义用 \`saltnet schema --views\` 查看。`,
        "",
        ...PUBLIC_VIEWS.map(
            view => `- \`${view.name}\`：${view.summary}；需要：${needsLabel(view.needs)}`
        ),
    ];
    pushSection(lines, "只读视图", viewLines);

    return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * The guide as a Claude Code skill (`guide --skill`): YAML frontmatter with the name and the
 * description that tells an agent when to use it, then the same text `guide` prints. Saved as
 * `~/.claude/skills/saltnet/SKILL.md` it is ready to use. A JSON string is also a YAML string.
 */
export function renderSkill(registry: Registry, version: string): string {
    const frontmatter = [
        "---",
        `name: ${SKILL_NAME}`,
        `description: ${JSON.stringify(SKILL_DESCRIPTION)}`,
        "---",
    ];
    return `${frontmatter.join("\n")}\n\n${renderGuide(registry, version)}`;
}
