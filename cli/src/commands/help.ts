/**
 * `--help`: plain text for people, generated from the registry. Agents are pointed to `schema`
 * and `guide` instead (design 4.1); help is the one output that is not wrapped in the envelope.
 */
import type { HelpTarget } from "./parse";
import type {
    CommandCategory,
    CommandDefinition,
    CommandGroup,
    EnumValue,
    OptionEntry,
    PositionalSpec,
    Registry,
} from "./registry";
import { displayWidth, padDisplay } from "../util/width";
import {
    COMMAND_CATEGORIES,
    commandOptionEntries,
    EFFECT_LABELS,
    enumMember,
    GLOBAL_OPTION_ENTRIES,
} from "./registry";

/** A label wider than this pushes its description onto the next line. */
const MAX_LABEL_WIDTH = 30;
const INDENT = "  ";

type Row = readonly [label: string, text: string];

/** The width of the label column for these rows, at most `MAX_LABEL_WIDTH`. */
function columnWidth(rows: readonly Row[]): number {
    return Math.min(MAX_LABEL_WIDTH, Math.max(0, ...rows.map(([label]) => displayWidth(label))));
}

/** Rows as two aligned columns; pass `width` to align several tables with each other. */
function renderRows(rows: readonly Row[], width = columnWidth(rows)): string[] {
    return rows.flatMap(([label, text]) => {
        if (text === "") return [`${INDENT}${label}`];
        if (displayWidth(label) > width) {
            return [`${INDENT}${label}`, `${INDENT}${" ".repeat(width + 2)}${text}`];
        }
        return [`${INDENT}${padDisplay(label, width)}  ${text}`];
    });
}

function section(title: string, lines: readonly string[]): string[] {
    return lines.length === 0 ? [] : [title, ...lines, ""];
}

/** `<谱面>`, `[门]`, `<曲目...>`: what the argument looks like in a usage line. */
function placeholderOf(positional: PositionalSpec): string {
    const name = `${positional.valueName ?? positional.name}${positional.variadic ? "..." : ""}`;
    return positional.optional ? `[${name}]` : `<${name}>`;
}

function usageOf(positionals: readonly PositionalSpec[]): string {
    return positionals.map(placeholderOf).join(" ");
}

/** The longest enum written inline as `<a|b|c>`; longer ones list their values in the notes. */
const MAX_INLINE_ENUM = 24;

function inlineEnum(values: readonly EnumValue[]): string | undefined {
    const joined = values.map(value => enumMember(value).value).join("|");
    return joined.length <= MAX_INLINE_ENUM ? joined : undefined;
}

function listedValues(values: readonly EnumValue[]): string {
    return values.map(value => enumMember(value).value).join("、");
}

/** The words after a flag: `<整数>`, `<default|constant>`. */
function valueNameOf(entry: OptionEntry): string {
    const { spec } = entry;
    if (spec.valueName) return `<${spec.valueName}>`;
    switch (spec.kind) {
        case "string":
            return "<文本>";
        case "credential":
            return "-";
        case "integer":
            return "<整数>";
        case "number":
            return "<数字>";
        case "enum": {
            const inline = inlineEnum(spec.values);
            return inline ? `<${inline}>` : "<值>";
        }
        case "list":
            return spec.item.kind === "enum" ? "<值,值>" : "<值,值,…>";
        case "range":
            return "<起..止>";
        case "boolean":
            return "";
    }
}

function flagLabel(entry: OptionEntry): string {
    if (entry.spec.kind === "boolean") {
        return entry.spec.default ? `--[no-]${entry.flag}` : `--${entry.flag}`;
    }
    return `--${entry.flag} ${valueNameOf(entry)}`;
}

function notesOf(entry: OptionEntry): string {
    const { spec } = entry;
    const notes: string[] = [];
    if ("required" in spec && spec.required) notes.push("必填");
    if (spec.kind === "enum" && !inlineEnum(spec.values))
        notes.push(`可选：${listedValues(spec.values)}`);
    if (spec.kind === "list" && spec.item.kind === "enum") {
        notes.push(`可选：${listedValues(spec.item.values)}`);
    }
    if (spec.kind === "integer" || spec.kind === "number") {
        if (spec.min !== undefined && spec.max !== undefined) {
            notes.push(`范围：${spec.min} 到 ${spec.max}`);
        } else if (spec.min !== undefined) {
            notes.push(`最小：${spec.min}`);
        } else if (spec.max !== undefined) {
            notes.push(`最大：${spec.max}`);
        }
    }
    if (spec.kind === "boolean") {
        if (spec.default) notes.push("默认开启");
    } else if ("default" in spec && spec.default !== undefined) {
        const shown = Array.isArray(spec.default) ? spec.default.join(",") : String(spec.default);
        notes.push(`默认：${shown}`);
    }
    return notes.length === 0 ? "" : `（${notes.join("；")}）`;
}

function optionRows(entries: readonly OptionEntry[]): Row[] {
    return entries.map(entry => [flagLabel(entry), `${entry.spec.description}${notesOf(entry)}`]);
}

function globalOptionLines(): string[] {
    return renderRows([["-h, --help", "显示帮助"], ...optionRows(GLOBAL_OPTION_ENTRIES)]);
}

function commandRow(command: CommandDefinition): Row {
    const usage = usageOf(command.spec.positionals ?? []);
    return [
        usage === "" ? command.spec.name : `${command.spec.name} ${usage}`,
        command.spec.summary,
    ];
}

function renderRootHelp(registry: Registry, version: string): string {
    const lines: string[] = [
        `saltnet ${version}`,
        "舞萌 DX（国服）的曲库、成绩和账号命令行工具，输出默认是给程序读的 JSON。",
        "",
        "用法：",
        `${INDENT}saltnet <命令> [参数] [选项]`,
        "",
    ];

    const categories = Object.keys(COMMAND_CATEGORIES) as CommandCategory[];
    const done = new Set<string>();
    const byCategory = categories.map(category => {
        const rows: Row[] = [];
        for (const command of registry.commands) {
            if (command.spec.category !== category) continue;
            const [first] = command.words;
            if (command.words.length === 1) {
                rows.push(commandRow(command));
            } else if (!done.has(first)) {
                done.add(first);
                const group = registry.groups.find(candidate => candidate.name === first)!;
                const subs = group.commands.map(sub => sub.words[1]).join("、");
                rows.push([first, `${group.summary}（${subs}）`]);
            }
        }
        return { category, rows };
    });
    // One column for the whole list, so the descriptions line up across the headings.
    const width = columnWidth(byCategory.flatMap(entry => entry.rows));
    for (const { category, rows } of byCategory) {
        lines.push(...section(COMMAND_CATEGORIES[category], renderRows(rows, width)));
    }
    if (registry.commands.length === 0) lines.push("（还没有可用的命令）", "");

    lines.push(...section("全局选项：", globalOptionLines()));

    const more: Row[] = [["saltnet <命令> --help", "某个命令的用法"]];
    if (registry.find("schema"))
        more.push(["saltnet schema [命令]", "机器可读的命令说明，agent 请用这个"]);
    if (registry.find("guide")) more.push(["saltnet guide", "给 agent 的使用指南"]);
    lines.push(...section("更多：", renderRows(more)));

    return `${lines.join("\n").trimEnd()}\n`;
}

function renderGroupHelp(group: CommandGroup): string {
    const lines: string[] = [
        `saltnet ${group.name} — ${group.summary}`,
        "",
        "用法：",
        `${INDENT}saltnet ${group.name} <子命令> [参数] [选项]`,
        "",
        ...section(
            "子命令：",
            renderRows(
                group.commands.map(command => {
                    const [label, summary] = commandRow(command);
                    return [label.slice(group.name.length + 1), summary] as const;
                })
            )
        ),
        ...section("全局选项：", globalOptionLines()),
    ];
    lines.push(`用 saltnet ${group.name} <子命令> --help 查看子命令的用法。`);
    return `${lines.join("\n").trimEnd()}\n`;
}

function renderCommandHelp(command: CommandDefinition): string {
    const { spec } = command;
    const positionals = spec.positionals ?? [];
    const usage = usageOf(positionals);
    const hasOptions = commandOptionEntries(command).length > 0;

    const lines: string[] = [
        `saltnet ${spec.name} — ${spec.summary}`,
        "",
        "用法：",
        `${INDENT}saltnet ${spec.name}${usage === "" ? "" : ` ${usage}`}${hasOptions ? " [选项]" : ""}`,
        "",
    ];
    if (spec.description) lines.push(spec.description.trim(), "");

    lines.push(
        ...section(
            "参数：",
            renderRows(
                positionals.map(positional => [placeholderOf(positional), positional.description])
            )
        ),
        ...section("选项：", renderRows(optionRows(commandOptionEntries(command))))
    );

    const examples = (spec.examples ?? []).flatMap(example => [
        `${INDENT}saltnet ${example.command}`,
        `${INDENT}${INDENT}${example.description}`,
    ]);
    lines.push(
        ...section("示例：", examples),
        `副作用：${EFFECT_LABELS[spec.effect]}`,
        "",
        ...section("全局选项：", globalOptionLines())
    );
    return `${lines.join("\n").trimEnd()}\n`;
}

/** The help text for what was asked about, ending in a newline. */
export function renderHelp(registry: Registry, target: HelpTarget, version: string): string {
    switch (target.kind) {
        case "root":
            return renderRootHelp(registry, version);
        case "group":
            return renderGroupHelp(target.group);
        case "command":
            return renderCommandHelp(target.command);
    }
}
