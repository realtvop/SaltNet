/** Machine-readable descriptions shared by `schema`, `guide`, and `--help`. */
import type { ErrorCode } from "../errors";
import type {
    CommandDefinition,
    CommandSpec,
    EnumValue,
    OptionEntry,
    PositionalSpec,
} from "./registry";
import { ERROR_CODES, ERROR_DESCRIPTIONS, exitCodeOf, isRetryableByDefault } from "../errors";
import { commandOptionEntries, enumMember } from "./registry";

export interface DescribedEnumValue {
    readonly value: string;
    readonly aliases: readonly string[];
    readonly description: string | null;
}

export interface DescribedOptionItem {
    readonly type: "string" | "integer" | "number" | "enum";
    readonly values: readonly DescribedEnumValue[] | null;
}

export interface DescribedOption {
    readonly flag: string;
    readonly type: OptionEntry["spec"]["kind"];
    readonly description: string;
    readonly valueName: string | null;
    readonly required: boolean;
    readonly default: string | number | boolean | readonly (string | number)[] | null;
    readonly values: readonly DescribedEnumValue[] | null;
    readonly item: DescribedOptionItem | null;
    readonly min: number | null;
    readonly max: number | null;
}

function describeValues(values: readonly EnumValue[]): DescribedEnumValue[] {
    return values.map(value => {
        const member = enumMember(value);
        return {
            value: member.value,
            aliases: [...(member.aliases ?? [])],
            description: member.description ?? null,
        };
    });
}

export function describeOption(entry: OptionEntry): DescribedOption {
    const { spec } = entry;
    const defaultValue =
        spec.kind === "boolean"
            ? (spec.default ?? false)
            : "default" in spec && spec.default !== undefined
              ? Array.isArray(spec.default)
                  ? [...spec.default]
                  : spec.default
              : null;
    const item: DescribedOptionItem | null =
        spec.kind === "list"
            ? {
                  type: spec.item.kind,
                  values: spec.item.kind === "enum" ? describeValues(spec.item.values) : null,
              }
            : spec.kind === "range"
              ? { type: spec.item, values: null }
              : null;

    return {
        flag: `--${entry.flag}`,
        type: spec.kind,
        description: spec.description,
        valueName: spec.valueName ?? null,
        required: "required" in spec && spec.required === true,
        default: defaultValue,
        values: spec.kind === "enum" ? describeValues(spec.values) : null,
        item,
        min: spec.kind === "integer" || spec.kind === "number" ? (spec.min ?? null) : null,
        max: spec.kind === "integer" || spec.kind === "number" ? (spec.max ?? null) : null,
    };
}

export interface DescribedPositional {
    readonly name: string;
    readonly valueName: string | null;
    readonly description: string;
    readonly required: boolean;
    readonly variadic: boolean;
}

export function describePositional(spec: PositionalSpec): DescribedPositional {
    return {
        name: spec.name,
        valueName: spec.valueName ?? null,
        description: spec.description,
        required: spec.optional !== true,
        variadic: spec.variadic === true,
    };
}

/** `<谱面>`, `[门]`, `<曲目...>`: what the argument looks like in prose and usage lines. */
export function positionalPlaceholder(spec: PositionalSpec): string {
    const name = `${spec.valueName ?? spec.name}${spec.variadic ? "..." : ""}`;
    return spec.optional ? `[${name}]` : `<${name}>`;
}

/** The command's full usage line, without indentation. */
export function commandUsage(command: CommandDefinition): string {
    const positionals = (command.spec.positionals ?? []).map(positionalPlaceholder);
    const options = commandOptionEntries(command).length > 0 ? ["[选项]"] : [];
    return ["saltnet", command.spec.name, ...positionals, ...options].join(" ");
}

/** Codes a command can report, in the stable public order. */
export function commandErrorCodes(spec: CommandSpec): readonly ErrorCode[] {
    const codes = new Set<ErrorCode>(["INTERNAL", "USAGE", ...(spec.errors ?? [])]);
    return ERROR_CODES.filter(code => codes.has(code));
}

export function describeError(code: ErrorCode) {
    return {
        code,
        exitCode: exitCodeOf(code),
        retryable: isRetryableByDefault(code),
        description: ERROR_DESCRIPTIONS[code],
    };
}

/** The longest enum written inline as `<a|b|c>`; longer ones list values in a note. */
const MAX_INLINE_ENUM = 24;

function inlineEnum(values: readonly EnumValue[]): string | undefined {
    const joined = values.map(value => enumMember(value).value).join("|");
    return joined.length <= MAX_INLINE_ENUM ? joined : undefined;
}

function listedValues(values: readonly EnumValue[]): string {
    return values.map(value => enumMember(value).value).join("、");
}

/** The value placeholder following an option flag. */
export function optionValueLabel(entry: OptionEntry): string {
    const { spec } = entry;
    if (spec.valueName) return `<${spec.valueName}>`;
    switch (spec.kind) {
        case "string":
            return "<文本>";
        case "credential":
            return "-";
        case "integer":
            return "<整数>";
        case "number":
            return "<数字>";
        case "enum": {
            const inline = inlineEnum(spec.values);
            return inline ? `<${inline}>` : "<值>";
        }
        case "list":
            return spec.item.kind === "enum" ? "<值,值>" : "<值,值,…>";
        case "range":
            return "<起..止>";
        case "boolean":
            return "";
    }
}

/** The flag and its value placeholder, exactly as help and guide show it. */
export function optionLabel(entry: OptionEntry): string {
    if (entry.spec.kind === "boolean") {
        return entry.spec.default ? `--[no-]${entry.flag}` : `--${entry.flag}`;
    }
    return `--${entry.flag} ${optionValueLabel(entry)}`;
}

/** Required/default/value/bounds notes appended to an option description. */
export function optionNotes(entry: OptionEntry): string {
    const { spec } = entry;
    const notes: string[] = [];
    if ("required" in spec && spec.required) notes.push("必填");
    if (spec.kind === "enum" && !inlineEnum(spec.values)) {
        notes.push(`可选：${listedValues(spec.values)}`);
    }
    if (spec.kind === "list" && spec.item.kind === "enum") {
        notes.push(`可选：${listedValues(spec.item.values)}`);
    }
    if (spec.kind === "integer" || spec.kind === "number") {
        if (spec.min !== undefined && spec.max !== undefined) {
            notes.push(`范围：${spec.min} 到 ${spec.max}`);
        } else if (spec.min !== undefined) {
            notes.push(`最小：${spec.min}`);
        } else if (spec.max !== undefined) {
            notes.push(`最大：${spec.max}`);
        }
    }
    if (spec.kind === "boolean") {
        if (spec.default) notes.push("默认开启");
    } else if ("default" in spec && spec.default !== undefined) {
        const shown = Array.isArray(spec.default) ? spec.default.join(",") : String(spec.default);
        notes.push(`默认：${shown}`);
    }
    return notes.length === 0 ? "" : `（${notes.join("；")}）`;
}
