/**
 * `--format text`: output for a person reading a terminal (design 4.2). Lists become aligned
 * tables, single objects become an indented outline. The layout is free to change; nothing should
 * parse it.
 */
import type { CliError } from "../errors";
import type { PlainObject } from "./fields";
import type { PageInfo } from "./paging";
import type { Warning } from "./warning";
import { displayWidth, padDisplay } from "../util/width";
import { isPlainObject } from "./fields";
import { cellOf, columnsOf } from "./table";

/** A longer cell is cut with an ellipsis so one long title cannot push the table off the screen. */
const MAX_CELL_WIDTH = 40;

function truncate(text: string, width: number): string {
    if (displayWidth(text) <= width) return text;
    let kept = "";
    let used = 0;
    for (const char of text) {
        const next = displayWidth(char);
        if (used + next > width - 1) break;
        kept += char;
        used += next;
    }
    return `${kept}…`;
}

function isScalar(value: unknown): boolean {
    return !Array.isArray(value) && !isPlainObject(value);
}

/** One value on one line; null is a dash. */
function inline(value: unknown): string {
    if (value === null || value === undefined) return "-";
    if (typeof value === "string") return value.replaceAll(/\s+/g, " ");
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value) && value.every(isScalar)) {
        return value.length === 0 ? "[]" : value.map(inline).join("、");
    }
    return JSON.stringify(value);
}

function renderTable(rows: readonly unknown[], columns: readonly string[]): string[] {
    if (rows.length === 0) {
        return columns.length === 0 ? ["（没有结果）"] : [columns.join("  "), "（没有结果）"];
    }
    const cells = rows.map(row =>
        columns.map(column => truncate(inline(cellOf(row, column)), MAX_CELL_WIDTH))
    );
    const widths = columns.map((column, index) =>
        cells.reduce(
            (widest, row) => Math.max(widest, displayWidth(row[index])),
            displayWidth(column)
        )
    );
    const line = (values: readonly string[]): string =>
        values
            .map((value, index) => padDisplay(value, widths[index]))
            .join("  ")
            .trimEnd();
    return [line(columns), ...cells.map(line)];
}

function statsLine(value: unknown): string | undefined {
    if (!isPlainObject(value)) return undefined;
    const names: Readonly<Record<string, string>> = {
        total: "总数",
        played: "游玩",
        sss: "SSS",
        sssPlus: "SSS+",
        fc: "FC",
        ap: "AP",
        fdx: "FDX",
    };
    const parts = Object.entries(names)
        .filter(([key]) => typeof value[key] === "number")
        .map(([key, label]) => `${label} ${value[key]}`);
    return parts.length === 0 ? undefined : `统计：${parts.join("，")}`;
}

function hasStructure(value: unknown): boolean {
    return (
        (isPlainObject(value) && Object.keys(value).length > 0) ||
        (Array.isArray(value) && !value.every(isScalar))
    );
}

/** An object as an outline: `key: value` lines, nested objects and lists of objects indented. */
function outline(object: PlainObject, indent: string): string[] {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(object)) {
        if (!hasStructure(value)) {
            lines.push(`${indent}${key}: ${inline(value)}`);
        } else if (isPlainObject(value)) {
            lines.push(`${indent}${key}:`, ...outline(value, `${indent}  `));
        } else {
            lines.push(`${indent}${key}:`);
            for (const element of value as unknown[]) {
                if (isPlainObject(element) && Object.keys(element).length > 0) {
                    const inner = outline(element, `${indent}    `);
                    lines.push(
                        `${indent}  - ${inner[0].slice(indent.length + 4)}`,
                        ...inner.slice(1)
                    );
                } else {
                    lines.push(`${indent}  - ${inline(element)}`);
                }
            }
        }
    }
    return lines;
}

function listBody(data: PlainObject, columns: readonly string[] | undefined): string[] {
    const lines: string[] = [];
    if (Array.isArray(data.items)) {
        const summary = statsLine(data.stats);
        if (summary) lines.push(summary);
        lines.push(...renderTable(data.items, columns ?? columnsOf(data.items)));
    }
    if (Array.isArray(data.groups)) {
        if (data.groups.length === 0 && columns) lines.push(...renderTable([], columns));
        for (const group of data.groups as PlainObject[]) {
            const items = Array.isArray(group.items) ? group.items : [];
            if (lines.length > 0) lines.push("");
            lines.push(`${inline(group.key)}（${inline(group.count ?? items.length)} 条）`);
            const summary = statsLine(group.stats);
            if (summary) lines.push(summary);
            lines.push(...renderTable(items, columns ?? columnsOf(items)));
        }
    }
    const rest: PlainObject = { ...data };
    delete rest.items;
    delete rest.groups;
    if (statsLine(data.stats)) delete rest.stats;
    if (Object.keys(rest).length > 0) lines.push("", ...outline(rest, ""));
    return lines;
}

function pageLine(page: PageInfo, shown: number): string {
    if (shown === 0 && page.offset > 0 && page.offset >= page.total) {
        return `共 ${page.total} 条；--offset ${page.offset} 已超过最后一条`;
    }
    const first = page.total === 0 ? 0 : page.offset + 1;
    const last = page.offset + shown;
    const next = page.nextOffset === null ? "" : `；下一页加 --offset ${page.nextOffset}`;
    return `第 ${first}–${last} 条，共 ${page.total} 条${next}`;
}

function isPageInfo(value: unknown): value is PageInfo {
    return (
        isPlainObject(value) && typeof value.total === "number" && typeof value.offset === "number"
    );
}

export interface TextInput {
    readonly kind: "object" | "list";
    readonly data: unknown;
    readonly columns?: readonly string[];
    readonly meta: Readonly<Record<string, unknown>>;
    readonly warnings: readonly Warning[];
}

/** The whole result as text, ending in a newline. */
export function renderText(input: TextInput): string {
    const { data, meta, warnings } = input;
    const lines: string[] = [];

    if (input.kind === "list" && isPlainObject(data)) lines.push(...listBody(data, input.columns));
    else if (isPlainObject(data)) lines.push(...outline(data, ""));
    else lines.push(inline(data));

    const { page, ...otherMeta } = meta;
    if (isPageInfo(page)) {
        const shown = isPlainObject(data) && Array.isArray(data.items) ? data.items.length : 0;
        lines.push("", pageLine(page, shown));
    }
    if (Object.keys(otherMeta).length > 0) lines.push("", ...outline(otherMeta, ""));
    for (const warning of warnings) {
        const fix = warning.fix ? `（建议运行 ${warning.fix}）` : "";
        lines.push(`警告 ${warning.code}：${warning.message}${fix}`);
    }
    return `${lines.join("\n")}\n`;
}

/** A destructive-operation preview for a person, with one line per top-level preview field. */
export function renderConfirmationError(error: CliError): string {
    const preview = error.extra?.preview;
    const lines = [`错误 ${error.code}：${error.message}`, "预览："];
    if (isPlainObject(preview)) {
        const entries = Object.entries(preview);
        if (entries.length === 0) lines.push("  （没有字段）");
        for (const [key, value] of entries) {
            const shown =
                Array.isArray(value) || isPlainObject(value)
                    ? JSON.stringify(value)
                    : inline(value);
            lines.push(`  ${key}: ${shown}`);
        }
    } else {
        lines.push("  （没有预览）");
    }
    if (error.fix) lines.push(`确认命令：${error.fix}`);
    return `${lines.join("\n")}\n`;
}
