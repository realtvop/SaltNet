/**
 * Builders for the JSON Schemas that describe a command's `data` (design 4.7). A schema is plain
 * data, so `schema <command>` prints it as it is and the tests check real results against it with
 * a JSON Schema validator. Only keywords that every validator knows are used (`type`, `enum`,
 * `properties`, `required`, `additionalProperties`, `items`, `anyOf`, `description`).
 *
 * An object says everything it holds: a key that may be missing is named in `optional`, every
 * other key is required, and nothing else is allowed. A field a command starts to print without
 * being described here therefore fails a test, and so does one that stops being printed. Given the
 * interface of what is printed, `object<Interface>` also makes TypeScript insist that every key of
 * it is described.
 */
import type { JsonSchema } from "../commands/registry";

export function str(description: string): JsonSchema {
    return { type: "string", description };
}

export function int(description: string): JsonSchema {
    return { type: "integer", description };
}

export function num(description: string): JsonSchema {
    return { type: "number", description };
}

export function bool(description: string): JsonSchema {
    return { type: "boolean", description };
}

/** A string that is one of `values`; pass the values from where the command gets them. */
export function strEnum(values: readonly string[], description: string): JsonSchema {
    return { type: "string", enum: [...values], description };
}

/**
 * A string that is one of the keys of `meanings`, each explained in the description (a value that
 * speaks for itself has `""`). Typing `meanings` as `Record<Union, string>` makes TypeScript insist
 * that every member of the union the command prints is listed, and that nothing else is, so a value
 * the command can print never goes missing from the schema.
 */
export function strEnumOf<K extends string>(
    meanings: Readonly<Record<K, string>>,
    description: string
): JsonSchema {
    const values = Object.keys(meanings) as K[];
    const explained = values
        .map(value => (meanings[value] === "" ? value : `${value} ${meanings[value]}`))
        .join("；");
    return { type: "string", enum: values, description: `${description}：${explained}` };
}

/** Exactly `value`: for the field that tells the shapes of an `anyOf` apart. */
export function literal(value: string | number | boolean, description: string): JsonSchema {
    return { const: value, description };
}

/** Always `null`: a field whose value is not available yet. */
export function alwaysNull(description: string): JsonSchema {
    return { type: "null", description };
}

/** Any JSON value, for what a command passes through without knowing its shape. */
export function anything(description: string): JsonSchema {
    return { description };
}

export function list(items: JsonSchema, description: string): JsonSchema {
    return { type: "array", description, items };
}

/** An object whose keys are not known beforehand, every value of which is `values`. */
export function dictionary(values: JsonSchema, description: string): JsonSchema {
    return { type: "object", description, additionalProperties: values };
}

/** A value that is one of several shapes. */
export function anyOf(description: string, ...alternatives: readonly JsonSchema[]): JsonSchema {
    if (alternatives.length < 2) throw new Error("anyOf 至少要有两种写法");
    return { description, anyOf: [...alternatives] };
}

/**
 * The same as `schema`, or `null`. `description` replaces the original one when the null case needs
 * explaining.
 */
export function nullable(schema: JsonSchema, description?: string): JsonSchema {
    const described = description === undefined ? {} : { description };
    if (Array.isArray(schema.anyOf)) {
        return { ...schema, ...described, anyOf: [...schema.anyOf, { type: "null" }] };
    }
    const { type, enum: values } = schema;
    if (typeof type !== "string" && !Array.isArray(type)) {
        throw new TypeError("nullable 只能用在写了 type 或 anyOf 的 schema 上");
    }
    return {
        ...schema,
        ...described,
        type: [...(Array.isArray(type) ? type : [type]), "null"],
        ...(Array.isArray(values) ? { enum: [...values, null] } : {}),
    };
}

type Properties<T> = { readonly [K in keyof T]-?: JsonSchema };

export interface ObjectOptions<T> {
    readonly description?: string;
    /** The keys that may be missing; every other key is always there. */
    readonly optional?: readonly (keyof T & string)[];
}

/** An object with exactly these keys. */
export function object<T = Record<string, unknown>>(
    properties: Properties<T>,
    options: ObjectOptions<T> = {}
): JsonSchema {
    const optional = new Set<string>(options.optional ?? []);
    const required = Object.keys(properties).filter(key => !optional.has(key));
    return {
        type: "object",
        ...(options.description === undefined ? {} : { description: options.description }),
        properties,
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false,
    };
}

/**
 * `base` (an object made by `object` or `extend`) with more keys: what a command prints when it
 * adds fields to a row that other commands print as well. `T` is the interface of the whole result
 * and `Base` the one `base` describes, so TypeScript asks for exactly the keys `T` adds to it.
 */
export function extend<T extends Base, Base = unknown>(
    base: JsonSchema,
    properties: Properties<Omit<T, keyof Base>>,
    options: ObjectOptions<T> = {}
): JsonSchema {
    if (base.type !== "object" || typeof base.properties !== "object" || base.properties === null) {
        throw new TypeError("extend 只能扩展 object 做出来的 schema");
    }
    const baseProperties = base.properties as Record<string, unknown>;
    const baseRequired = (base.required as readonly string[] | undefined) ?? [];
    const duplicates = Object.keys(properties).filter(key => key in baseProperties);
    if (duplicates.length > 0) {
        throw new Error(`extend 不能重复写已有的字段：${duplicates.join("、")}`);
    }
    const optional = new Set<string>(options.optional ?? []);
    const required = [
        ...baseRequired,
        ...Object.keys(properties).filter(key => !optional.has(key)),
    ];
    const description = options.description ?? base.description;
    return {
        type: "object",
        ...(typeof description === "string" ? { description } : {}),
        properties: { ...baseProperties, ...properties },
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false,
    };
}
