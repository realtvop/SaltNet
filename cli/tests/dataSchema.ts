/**
 * Checks values against the JSON Schemas the CLI publishes. The validator is the real thing (Ajv),
 * in its strict mode, so a schema with a misspelled keyword or one that is not valid JSON Schema
 * fails here instead of being published.
 */
import type { JsonSchema } from "../src/commands/registry";
import Ajv from "ajv";
import { expect } from "vitest";

const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });

/** What is wrong with `value`, one line each, with the path to it; empty when it conforms. */
export function schemaErrors(schema: JsonSchema, value: unknown): string[] {
    const validate = ajv.compile(schema);
    if (validate(value)) return [];
    return (validate.errors ?? []).map(error => {
        const where = error.instancePath === "" ? "(root)" : error.instancePath;
        return `${where} ${error.message ?? "不符合"} ${JSON.stringify(error.params)}`;
    });
}

/** Fails, listing what is wrong, unless `value` conforms to `schema`. */
export function expectConforms(schema: JsonSchema, value: unknown): void {
    expect(schemaErrors(schema, value)).toEqual([]);
}

/** Fails unless `schema` is a valid JSON Schema document (compiling it would throw otherwise). */
export function expectValidSchema(schema: JsonSchema): void {
    expect(ajv.validateSchema(schema)).toBe(true);
    expect(() => ajv.compile(schema)).not.toThrow();
}
