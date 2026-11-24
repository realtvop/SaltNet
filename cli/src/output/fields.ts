/**
 * `--fields a,b.c`: keep only some fields of each item (design 4.5). A dot goes one level into an
 * object. The declared row fields decide which paths are valid and which columns they expand to,
 * even when the current page has no rows.
 */
import type { JsonSchema } from "../commands/registry";
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

function alternatives(schema: JsonSchema): JsonSchema[] {
    if (!Array.isArray(schema.anyOf)) return [schema];
    return schema.anyOf.filter(isPlainObject).flatMap(alternatives);
}

/** Merge the properties of the possible shapes in declaration order. */
function propertiesOf(schemas: readonly JsonSchema[]): Map<string, JsonSchema[]> {
    const properties = new Map<string, JsonSchema[]>();
    for (const schema of new Set(schemas.flatMap(alternatives))) {
        if (!isPlainObject(schema.properties)) continue;
        for (const [key, child] of Object.entries(schema.properties)) {
            if (!isPlainObject(child)) continue;
            const existing = properties.get(key);
            if (existing) existing.push(child);
            else properties.set(key, [child]);
        }
    }
    return properties;
}

function arrayItemsOf(schemas: readonly JsonSchema[], key: string): JsonSchema[] {
    return (propertiesOf(schemas).get(key) ?? [])
        .flatMap(alternatives)
        .flatMap(schema => (isPlainObject(schema.items) ? [schema.items] : []));
}

export function listItemSchemas(schema: JsonSchema | undefined, grouped: boolean): JsonSchema[] {
    if (!schema) return [];
    const containers = grouped ? arrayItemsOf([schema], "groups") : [schema];
    return arrayItemsOf(containers, "items");
}

function checkSyntax(path: string): void {
    const segments = path.split(".");
    if (segments.includes("") || segments.includes("__proto__")) {
        throw usageError(
            `--fields 里的字段名${echo(path)}写法不对；嵌套的字段用点号连接，例如 score.rank`
        );
    }
}

/** Every valid path and the table columns below it. Arrays remain single cells. */
function fieldColumns(
    schemas: readonly JsonSchema[],
    dynamicKeys: readonly string[]
): Map<string, readonly string[]> {
    const paths = new Map<string, readonly string[]>();
    const visit = (properties: Map<string, JsonSchema[]>, prefix: string): string[] => {
        return [...properties].flatMap(([key, children]) => {
            const path = `${prefix}${key}`;
            paths.set(path, []);
            const leaves = visit(propertiesOf(children), `${path}.`);
            const columns = leaves.length === 0 ? [path] : leaves;
            paths.set(path, columns);
            return columns;
        });
    };

    const properties = propertiesOf(schemas);
    // SQL rows have query-defined column names. The query reports those names even without rows.
    const dictionary = schemas
        .flatMap(alternatives)
        .find(schema => isPlainObject(schema.additionalProperties));
    if (dictionary) {
        for (const key of dynamicKeys) {
            if (!key.includes(".") && !properties.has(key)) properties.set(key, []);
        }
    }
    visit(properties, "");
    return paths;
}

/** Validate every requested path before projecting rows or sending an image request. */
export function prepareFields(
    schemas: readonly JsonSchema[],
    requested: readonly string[],
    dynamicKeys: readonly string[] = []
): { paths: string[][]; columns: string[] } {
    const byPath = fieldColumns(schemas, dynamicKeys);
    const columns = new Set<string>();
    for (const path of requested) {
        checkSyntax(path);
        const leaves = byPath.get(path);
        if (!leaves) {
            const candidates = closestMatches(path, [...byPath.keys()]).map(ref => ({ ref }));
            throw usageError(`--fields 里有不存在的字段${echo(path)}`, { candidates });
        }
        for (const leaf of leaves) columns.add(leaf);
    }
    return {
        paths: minimal(requested).map(path => path.split(".")),
        columns: [...columns],
    };
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
export function selectFields(
    items: readonly unknown[],
    paths: readonly (readonly string[])[]
): unknown[] {
    return items.map(item => {
        if (!isPlainObject(item)) return item;
        const selected: PlainObject = {};
        for (const segments of paths) assign(selected, segments, getPath(item, segments));
        return selected;
    });
}
