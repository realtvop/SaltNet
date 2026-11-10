/** Turning a list of objects into rows and columns, for the `tsv` and `text` formats. */
import { getPath, isPlainObject } from "./fields";

interface KeyNode {
    readonly children: Map<string, KeyNode>;
}

/**
 * The columns of a list of objects: every leaf key, nested objects written as `score.rank`, in
 * the order they are first met. An object that is null in one row and filled in another (a score)
 * contributes its inner keys, and the null rows get empty cells.
 */
export function columnsOf(rows: readonly unknown[]): string[] {
    const root: KeyNode = { children: new Map() };
    const visit = (value: unknown, node: KeyNode): void => {
        if (!isPlainObject(value)) return;
        for (const [key, child] of Object.entries(value)) {
            let next = node.children.get(key);
            if (!next) {
                next = { children: new Map() };
                node.children.set(key, next);
            }
            visit(child, next);
        }
    };
    for (const row of rows) visit(row, root);

    const columns: string[] = [];
    const walk = (node: KeyNode, prefix: string): void => {
        for (const [key, child] of node.children) {
            const path = prefix === "" ? key : `${prefix}.${key}`;
            if (child.children.size === 0) columns.push(path);
            else walk(child, path);
        }
    };
    walk(root, "");
    return columns;
}

/** The value of a column in a row, null when the row has none. */
export function cellOf(row: unknown, column: string): unknown {
    return getPath(row, column.split("."));
}
