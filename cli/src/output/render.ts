/**
 * Turns what a command returned into the text for stdout (and, for tsv, stderr), in the format
 * that was asked for (design 4.2, 4.5).
 */
import type { CommandResult, CommandSpec } from "../commands/registry";
import type { PlainObject } from "./fields";
import type { OutputFormat } from "./format";
import { serializeEnvelope, successEnvelope } from "./envelope";
import { isPlainObject, listItemSchemas, prepareFields, selectFields } from "./fields";
import { columnsOf } from "./table";
import { renderText } from "./text";
import { renderTsv } from "./tsv";

export interface RenderInput {
    readonly command: string;
    readonly output: CommandSpec["output"];
    readonly dataSchema?: CommandSpec["dataSchema"];
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
function withFields(data: PlainObject, paths: readonly (readonly string[])[]): PlainObject {
    if (Array.isArray(data.items)) return { ...data, items: selectFields(data.items, paths) };
    return {
        ...data,
        groups: groupsOf(data).map(group => ({
            ...group,
            items: selectFields(group.items as unknown[], paths),
        })),
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
    selectedColumns: readonly string[] | undefined
): RenderedOutput {
    const rows = rowsOf(data);
    const columns = selectedColumns ?? columnsOf(rows);

    // stdout carries the table alone, so the rest of the result goes to stderr as comments.
    let stderr = "";
    if (result.meta && Object.keys(result.meta).length > 0) {
        stderr += commentLines("meta", result.meta);
    }
    for (const warning of result.warnings ?? []) stderr += commentLines("warning", warning);
    for (const group of groupsOf(data)) {
        if (isPlainObject(group.stats)) {
            stderr += commentLines("stats", { group: group.key ?? null, ...group.stats });
        }
    }
    for (const [key, value] of Object.entries(data)) {
        if (key !== "items" && key !== "groups") stderr += commentLines(key, value);
    }
    return { stdout: renderTsv(rows, columns), stderr };
}

export function renderSuccess(input: RenderInput): RenderedOutput {
    const { command, output, dataSchema, result, format, pretty, fields } = input;

    if (output === "text") {
        if (typeof result.data !== "string") {
            throw new TypeError(`命令 ${command} 声明结果是文本，却返回了别的东西`);
        }
        return {
            stdout: result.data.endsWith("\n") ? result.data : `${result.data}\n`,
            stderr: "",
        };
    }

    const list = output === "list" ? asListData(command, result.data) : undefined;
    const grouped = Array.isArray(list?.groups);
    const dynamicColumns = result.meta?.columns;
    const selection =
        list && fields
            ? prepareFields(
                  listItemSchemas(dataSchema, grouped),
                  fields,
                  Array.isArray(dynamicColumns)
                      ? dynamicColumns.filter((key): key is string => typeof key === "string")
                      : []
              )
            : undefined;
    const shaped = list && selection ? withFields(list, selection.paths) : result.data;

    if (format === "tsv") {
        const columns =
            selection && (grouped ? ["group", ...selection.columns] : selection.columns);
        return renderTsvResult(shaped as PlainObject, result, columns);
    }
    if (format === "text") {
        return {
            stdout: renderText({
                kind: output,
                data: shaped,
                columns: selection?.columns,
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
