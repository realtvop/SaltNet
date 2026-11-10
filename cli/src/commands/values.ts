/**
 * Turns the text of an option into the value the option's kind stands for. Anything wrong is
 * reported as a `ValueError`; the parser decides how to present it.
 */
import type { ErrorCandidate } from "../errors";
import type { EnumValue, ListItemSpec, OptionEntry, RangeItemKind, RangeValue } from "./registry";
import { closestMatches } from "../util/closest";
import { enumMember } from "./registry";

/** A value that does not fit its option. The message never contains a credential. */
export class ValueError extends Error {
    readonly candidates?: readonly ErrorCandidate[];

    constructor(message: string, candidates?: readonly ErrorCandidate[]) {
        super(message);
        this.name = "ValueError";
        this.candidates = candidates;
    }
}

/** Short, plain words only: a longer or odder value could be a pasted secret, so it is not echoed. */
const ECHOABLE = /^[\p{L}\p{N}_.:+-]{1,40}$/u;

/** The value in 「」 for an error message, or nothing when it should not be repeated. */
export function echo(raw: string): string {
    return ECHOABLE.test(raw) ? `「${raw}」` : "";
}

const INTEGER = /^-?\d+$/;
const DECIMAL = /^-?\d+(?:\.\d+)?$/;

/** All the spellings an enum accepts, canonical value first. */
function spellings(values: readonly EnumValue[]): { canonical: string; spelling: string }[] {
    return values.flatMap(value => {
        const member = enumMember(value);
        return [member.value, ...(member.aliases ?? [])].map(spelling => ({
            canonical: member.value,
            spelling,
        }));
    });
}

/** The canonical value an enum member is written as, ignoring case, or undefined. */
export function matchEnum(values: readonly EnumValue[], raw: string): string | undefined {
    const wanted = raw.trim().toLowerCase();
    return spellings(values).find(entry => entry.spelling.toLowerCase() === wanted)?.canonical;
}

export function enumCanonicalValues(values: readonly EnumValue[]): string[] {
    return values.map(value => enumMember(value).value);
}

function convertEnum(flag: string, values: readonly EnumValue[], raw: string): string {
    const matched = matchEnum(values, raw);
    if (matched !== undefined) return matched;

    const all = spellings(values);
    const nearest = closestMatches(
        raw.trim(),
        all.map(entry => entry.spelling)
    ).map(spelling => all.find(entry => entry.spelling === spelling)!.canonical);
    const candidates = [...new Set(nearest)].map(ref => ({ ref }));
    throw new ValueError(
        `选项 --${flag} 的值${echo(raw)}不在可选范围内；可选值：${enumCanonicalValues(values).join("、")}`,
        candidates
    );
}

function convertInteger(flag: string, raw: string): number {
    if (!INTEGER.test(raw)) throw new ValueError(`选项 --${flag} 需要整数${echo(raw)}`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value)) throw new ValueError(`选项 --${flag} 的整数太大`);
    return value;
}

function convertDecimal(flag: string, raw: string): number {
    if (!DECIMAL.test(raw)) throw new ValueError(`选项 --${flag} 需要数字${echo(raw)}`);
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new ValueError(`选项 --${flag} 的数字太大`);
    return value;
}

function checkBounds(
    flag: string,
    value: number,
    min: number | undefined,
    max: number | undefined
): number {
    if (min !== undefined && max !== undefined && (value < min || value > max)) {
        throw new ValueError(`选项 --${flag} 的值要在 ${min} 到 ${max} 之间`);
    }
    if (min !== undefined && value < min)
        throw new ValueError(`选项 --${flag} 的值不能小于 ${min}`);
    if (max !== undefined && value > max)
        throw new ValueError(`选项 --${flag} 的值不能大于 ${max}`);
    return value;
}

function convertListItem(flag: string, item: ListItemSpec, raw: string): string | number {
    switch (item.kind) {
        case "enum":
            return convertEnum(flag, item.values, raw);
        case "integer":
            return convertInteger(flag, raw);
        case "string":
            return raw;
    }
}

function convertList(flag: string, item: ListItemSpec, raw: string): (string | number)[] {
    const parts = raw.split(",").map(part => part.trim());
    if (parts.includes("")) {
        throw new ValueError(`选项 --${flag} 的列表里有空项；多个值用逗号隔开，例如 a,b`);
    }
    return [...new Set(parts.map(part => convertListItem(flag, item, part)))];
}

function convertRangeEnd(flag: string, kind: RangeItemKind, text: string): string | number | null {
    if (text === "") return null;
    switch (kind) {
        case "string":
            return text;
        case "integer":
            return convertInteger(flag, text);
        case "number":
            return convertDecimal(flag, text);
    }
}

function convertRange(flag: string, kind: RangeItemKind, raw: string): RangeValue<string | number> {
    const split = raw.indexOf("..");
    const left = (split < 0 ? raw : raw.slice(0, split)).trim();
    const right = (split < 0 ? raw : raw.slice(split + 2)).trim();
    if (left === "" && right === "") {
        throw new ValueError(`选项 --${flag} 的区间至少要写一端，例如 13..14、14.. 或 ..12`);
    }

    const from = convertRangeEnd(flag, kind, left);
    const to = convertRangeEnd(flag, kind, right);
    if (typeof from === "number" && typeof to === "number" && from > to) {
        throw new ValueError(`选项 --${flag} 的区间下限大于上限`);
    }
    return { from, to };
}

/** Converts one option's text. `-` for a credential is the only thing it accepts. */
export function convertOption(entry: OptionEntry, raw: string): unknown {
    const { flag, spec } = entry;
    switch (spec.kind) {
        case "string":
            if (raw === "") throw new ValueError(`选项 --${flag} 的值不能为空`);
            return raw;
        case "credential":
            if (raw !== "-") {
                throw new ValueError(
                    `选项 --${flag} 只接受 -，表示从 stdin 读取；凭据不能写在命令行里`
                );
            }
            return raw;
        case "integer":
            return checkBounds(flag, convertInteger(flag, raw), spec.min, spec.max);
        case "number":
            return checkBounds(flag, convertDecimal(flag, raw), spec.min, spec.max);
        case "enum":
            return convertEnum(flag, spec.values, raw);
        case "list":
            return convertList(flag, spec.item, raw);
        case "range":
            return convertRange(flag, spec.item, raw);
        case "boolean":
            return convertBoolean(flag, raw);
    }
}

/** Only for `--x=true` and `--x=false`; plain `--x` and `--no-x` never get here. */
export function convertBoolean(flag: string, raw: string): boolean {
    const value = raw.trim().toLowerCase();
    if (value === "true") return true;
    if (value === "false") return false;
    throw new ValueError(
        `选项 --${flag} 是开关，只接受 true 或 false；也可以直接写 --${flag} 或 --no-${flag}`
    );
}
