/**
 * Turns what a command returned into the text for stdout (and, for tsv, stderr), in the format
 * that was asked for (design 4.2, 4.5).
 */
import type { CommandResult, CommandSpec } from "../commands/registry";
import type { PlainObject } from "./fields";
import type { OutputFormat } from "./format";
import { serializeEnvelope, successEnvelope } from "./envelope";
import { isPlainObject, selectFields } from "./fields";
import { columnsOf } from "./table";
import { renderText } from "./text";
import { renderTsv } from "./tsv";

export interface RenderInput {
    readonly command: string;
    readonly output: CommandSpec["output"];
    readonly result: CommandResult;
    readonly format: OutputFormat;
    readonly pretty: boolean;
    /** `--fields`, for commands that have it. */
    readonly fields?: readonly string[];
}

export interface RenderedOutput {
    readonly stdout: string;
    readonly stderr: string;
}

/** A list command returns `{items}` or, when grouped, `{groups: [{key, count, items}]}`. */
function asListData(command: string, data: unknown): PlainObject {
    if (!isPlainObject(data) || !(Array.isArray(data.items) || Array.isArray(data.groups))) {
        throw new Error(`命令 ${command} 声明结果是列表，却没有返回 items 或 groups`);
    }
    return data;
}

function groupsOf(data: PlainObject): PlainObject[] {
    return (data.groups as PlainObject[] | undefined) ?? [];
}

/** Applies `--fields` to the items, or to the items of every group. */
function withFields(data: PlainObject, fields: readonly string[]): PlainObject {
    if (Array.isArray(data.items)) return { ...data, items: selectFields(data.items, fields) };
    const groups = groupsOf(data);
    const all = groups.flatMap(group => group.items as unknown[]);
    const selected = selectFields(all, fields);
    let cursor = 0;
    return {
        ...data,
        groups: groups.map(group => {
            const count = (group.items as unknown[]).length;
            const items = selected.slice(cursor, cursor + count);
            cursor += count;
            return { ...group, items };
        }),
    };
}

/** The rows of a list; a grouped list becomes one table with the group's key in a column. */
function rowsOf(data: PlainObject): unknown[] {
    if (Array.isArray(data.items)) return data.items;
    return groupsOf(data).flatMap(group =>
        (group.items as unknown[]).map(item =>
            isPlainObject(item) ? { group: group.key, ...item } : item
        )
    );
}

function commentLines(label: string, value: unknown): string {
    return `# ${label} ${JSON.stringify(value)}\n`;
}

function renderTsvResult(
    data: PlainObject,
    result: CommandResult,
    fields: readonly string[] | undefined
): RenderedOutput {
    const rows = rowsOf(data);
    // With nothing to look at the header can only come from what was asked for.
    const columns = rows.length === 0 && fields ? [...fields] : columnsOf(rows);

    // stdout carries the table alone, so the rest of the result goes to stderr as comments.
    let stderr = "";
    if (result.meta && Object.keys(result.meta).length > 0) {
        stderr += commentLines("meta", result.meta);
    }
    for (const warning of result.warnings ?? []) stderr += commentLines("warning", warning);
    for (const [key, value] of Object.entries(data)) {
        if (key !== "items" && key !== "groups") stderr += commentLines(key, value);
    }
    return { stdout: renderTsv(rows, columns), stderr };
}

export function renderSuccess(input: RenderInput): RenderedOutput {
    const { command, output, result, format, pretty, fields } = input;

    if (output === "text") {
        if (typeof result.data !== "string") {
            throw new TypeError(`命令 ${command} 声明结果是文本，却返回了别的东西`);
        }
        return {
            stdout: result.data.endsWith("\n") ? result.data : `${result.data}\n`,
            stderr: "",
        };
    }

    const data = output === "list" ? asListData(command, result.data) : result.data;
    const shaped = output === "list" && fields ? withFields(data as PlainObject, fields) : data;

    if (format === "tsv") {
        return renderTsvResult(shaped as PlainObject, result, fields);
    }
    if (format === "text") {
        return {
            stdout: renderText({
                kind: output,
                data: shaped,
                meta: result.meta ?? {},
                warnings: result.warnings ?? [],
            }),
            stderr: "",
        };
    }
    const envelope = successEnvelope(command, {
        data: shaped,
        meta: result.meta,
        warnings: result.warnings,
    });
    return { stdout: serializeEnvelope(envelope, pretty), stderr: "" };
}
