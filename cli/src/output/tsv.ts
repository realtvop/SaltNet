/**
 * Tab-separated output for list commands (design 4.2): a header line of column names, then one
 * line per item. Nothing in a cell can break the layout: a backslash, tab, newline or carriage
 * return is written as `\\`, `\t`, `\n` or `\r`. Nulls are empty cells, arrays and objects that
 * were not flattened into columns are compact JSON.
 */
import { cellOf } from "./table";

function escape(text: string): string {
    return text
        .replaceAll("\\", "\\\\")
        .replaceAll("\t", "\\t")
        .replaceAll("\n", "\\n")
        .replaceAll("\r", "\\r");
}

function textOf(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value);
}

export function renderTsv(rows: readonly unknown[], columns: readonly string[]): string {
    if (columns.length === 0) return "";
    const lines = [columns.map(escape).join("\t")];
    for (const row of rows) {
        lines.push(columns.map(column => escape(textOf(cellOf(row, column)))).join("\t"));
    }
    return `${lines.join("\n")}\n`;
}
