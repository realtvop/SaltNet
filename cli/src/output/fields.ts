/**
 * `--fields a,b.c`: keep only some fields of each item (design 4.5). A dot goes one level into an
 * object. A name that no item has is a usage error, so a typo cannot quietly become an empty
 * column or a missing key.
 */
import { usageError } from "../errors";
import { closestMatches } from "../util/closest";
import { echo } from "../util/echo";

export type PlainObject = Record<string, unknown>;

export function isPlainObject(value: unknown): value is PlainObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The value at a path of keys. A missing step, or a null on the way, gives null. */
export function getPath(value: unknown, segments: readonly string[]): unknown {
    let current = value;
    for (const segment of segments) {
        if (!isPlainObject(current) || !Object.hasOwn(current, segment)) return null;
        current = current[segment];
    }
    return current ?? null;
}

/** Every dotted path that occurs in the items, nested ones included, for suggestions. */
function allPaths(items: readonly unknown[]): string[] {
    const found = new Set<string>();
    const visit = (value: unknown, prefix: string): void => {
        if (!isPlainObject(value)) return;
        for (const [key, child] of Object.entries(value)) {
            const path = prefix === "" ? key : `${prefix}.${key}`;
            found.add(path);
            visit(child, path);
        }
    };
    for (const item of items) visit(item, "");
    return [...found];
}

function checkSyntax(path: string): void {
    const segments = path.split(".");
    if (segments.includes("") || segments.includes("__proto__")) {
        throw usageError(
            `--fields 里的字段名${echo(path)}写法不对；嵌套的字段用点号连接，例如 score.rank`
        );
    }
}

/**
 * A path is accepted when some item has it. Where every item has a null (a chart nobody played
 * has `score: null`), there is nothing to compare the deeper names with, so they are accepted too.
 * A step into a string, number or list is never valid.
 */
function checkExists(items: readonly unknown[], path: string, segments: readonly string[]): void {
    let nodes: unknown[] = [...items];
    for (const segment of segments) {
        const present = nodes.filter(node => node !== null && node !== undefined);
        if (present.length === 0) return;
        const objects = present.filter(isPlainObject);
        if (!objects.some(object => Object.hasOwn(object, segment))) {
            const candidates = closestMatches(path, allPaths(items)).map(ref => ({ ref }));
            throw usageError(`--fields 里有不存在的字段${echo(path)}`, { candidates });
        }
        nodes = objects.map(object => object[segment]);
    }
}

/** The requested paths without repeats, and without those a shorter requested path already covers. */
function minimal(paths: readonly string[]): string[] {
    const unique = [...new Set(paths)];
    return unique.filter(
        path => !unique.some(other => other !== path && path.startsWith(`${other}.`))
    );
}

function assign(target: PlainObject, segments: readonly string[], value: unknown): void {
    let node = target;
    for (const segment of segments.slice(0, -1)) {
        const existing = node[segment];
        if (isPlainObject(existing)) {
            node = existing;
        } else {
            const next: PlainObject = {};
            node[segment] = next;
            node = next;
        }
    }
    node[segments.at(-1)!] = value;
}

/**
 * The items with only the requested fields, in the requested order. Nesting is kept: `score.rank`
 * gives `{score: {rank}}`, and `rank` is null when the item has no score.
 */
export function selectFields(items: readonly unknown[], requested: readonly string[]): unknown[] {
    for (const path of requested) checkSyntax(path);
    const split = minimal(requested).map(path => {
        const segments = path.split(".");
        checkExists(items, path, segments);
        return segments;
    });
    return items.map(item => {
        if (!isPlainObject(item)) return item;
        const selected: PlainObject = {};
        for (const segments of split) assign(selected, segments, getPath(item, segments));
        return selected;
    });
}
