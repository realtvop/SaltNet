/**
 * The command registry: one declarative description per command (arguments, options, effect,
 * examples) from which the parser, `--help`, `schema` and `guide` are all generated, so the
 * documentation cannot disagree with the behavior (design 4.7).
 */
import type { FetchLike } from "@core/http";
import type { ErrorCode } from "../errors";
import type { Warning } from "../output/warning";
import type { ResolvedConfig } from "../runtime/config";
import type { Io } from "../runtime/io";
import type { RuntimePaths } from "../runtime/paths";
import type { Store } from "../store/store";

/** How far a command reaches (design 5.4). */
export type EffectLevel = "none" | "local" | "remote" | "account";

export const EFFECT_LABELS: Readonly<Record<EffectLevel, string>> = {
    none: "无，只读",
    local: "本地，只改本机的数据或文件",
    remote: "远端，会写入第三方服务",
    account: "账号，会登录或改动舞萌账号",
};

/** The headings `--help` groups commands under, in the order they are shown. */
export const COMMAND_CATEGORIES = {
    catalog: "曲目与谱面",
    scores: "成绩",
    collection: "收藏品",
    gameplay: "玩法数据",
    account: "用户、同步、账号",
    data: "收藏夹、数据管理、自描述",
} as const;

export type CommandCategory = keyof typeof COMMAND_CATEGORIES;

/** One accepted spelling of an enum option, with the others that mean the same thing. */
export interface EnumMember {
    /** The canonical value a command receives. */
    readonly value: string;
    /** Other ways to write it, matched ignoring case (`sssp` for `SSS+`). */
    readonly aliases?: readonly string[];
    readonly description?: string;
}

export type EnumValue = string | EnumMember;

export function enumMember(value: EnumValue): EnumMember {
    return typeof value === "string" ? { value } : value;
}

/** What each item of a comma-separated list is. */
export type ListItemSpec =
    | { readonly kind: "string" }
    | { readonly kind: "integer" }
    | { readonly kind: "enum"; readonly values: readonly EnumValue[] };

/** The item type of a range such as `13..14`. `string` leaves the ends for the command to read. */
export type RangeItemKind = "string" | "number" | "integer";

/** A range option's value. A missing end is `null`; a single value `x` is `{from: x, to: x}`. */
export interface RangeValue<T> {
    readonly from: T | null;
    readonly to: T | null;
}

interface OptionCommon {
    readonly description: string;
    /** The placeholder shown after the flag in `--help`; derived from the kind when omitted. */
    readonly valueName?: string;
}

export interface StringOption extends OptionCommon {
    readonly kind: "string";
    readonly required?: boolean;
    readonly default?: string;
}

/**
 * A secret (QR code, token, callback link). It is only ever written as `-`, which reads the
 * value from stdin, so it can never end up in shell history or a process list (design 4.1).
 */
export interface CredentialOption extends OptionCommon {
    readonly kind: "credential";
    readonly required?: boolean;
}

export interface IntegerOption extends OptionCommon {
    readonly kind: "integer";
    readonly min?: number;
    readonly max?: number;
    readonly required?: boolean;
    readonly default?: number;
}

export interface NumberOption extends OptionCommon {
    readonly kind: "number";
    readonly min?: number;
    readonly max?: number;
    readonly required?: boolean;
    readonly default?: number;
}

/** A switch: `--x` turns it on and `--no-x` turns it off. Absent, it takes its default (off). */
export interface BooleanOption extends OptionCommon {
    readonly kind: "boolean";
    readonly default?: boolean;
}

export interface EnumOption extends OptionCommon {
    readonly kind: "enum";
    readonly values: readonly EnumValue[];
    readonly required?: boolean;
    readonly default?: string;
}

/** Comma-separated values (`--diff mas,rem`); repeating the flag adds to the list. */
export interface ListOption extends OptionCommon {
    readonly kind: "list";
    readonly item: ListItemSpec;
    readonly required?: boolean;
    readonly default?: readonly (string | number)[];
}

/** `13..14`, `14..`, `..12+`, or a single value. */
export interface RangeOption extends OptionCommon {
    readonly kind: "range";
    readonly item: RangeItemKind;
    readonly required?: boolean;
}

export type OptionSpec =
    | StringOption
    | CredentialOption
    | IntegerOption
    | NumberOption
    | BooleanOption
    | EnumOption
    | ListOption
    | RangeOption;

/** Positional arguments only ever name an object (a song, a chart, a user…). */
export interface PositionalSpec {
    /** The key under which the command receives it. */
    readonly name: string;
    readonly description: string;
    /** The placeholder shown in `--help`, `<name>` when omitted. */
    readonly valueName?: string;
    readonly optional?: boolean;
    /** Takes every remaining argument; it has to be the last positional. */
    readonly variadic?: boolean;
}

export interface CommandExample {
    /** The command line without the leading `saltnet`. */
    readonly command: string;
    readonly description: string;
}

/** A JSON Schema document, used to describe `data` (design 4.7). */
export type JsonSchema = Readonly<Record<string, unknown>>;

export interface CommandSpec {
    /** One or two words: `charts`, `user bind`. Two-word commands form a group (`user`). */
    readonly name: string;
    /** One line, shown in the command list. */
    readonly summary: string;
    readonly description?: string;
    readonly category: CommandCategory;
    readonly effect: EffectLevel;
    /** What `data` looks like: one object, `{items}`, or plain text (`guide`). */
    readonly output: "object" | "list" | "text";
    readonly positionals?: readonly PositionalSpec[];
    /** Keyed by camelCase name; the flag is the kebab-case form (`groupBy` is `--group-by`). */
    readonly options?: Readonly<Record<string, OptionSpec>>;
    readonly examples?: readonly CommandExample[];
    /** Error codes beyond those any command can produce. */
    readonly errors?: readonly ErrorCode[];
    readonly dataSchema?: JsonSchema;
    /**
     * The command still runs when the settings have errors. Everything else refuses, so a typo in
     * `config.json` is reported once instead of breaking commands in strange ways; the commands
     * that show or repair the settings, and the ones that describe the CLI, have to work anyway.
     */
    readonly allowBadConfig?: boolean;
}

/** Options every command accepts. `--help`/`-h` is handled by the parser itself. */
export const GLOBAL_OPTIONS = {
    pretty: { kind: "boolean", description: "输出带缩进的 JSON，默认压缩成一行" },
    format: {
        kind: "enum",
        values: ["json", "tsv", "text"],
        description: "输出格式：json 给程序，tsv 只用于列表，text 给人看（不保证稳定）",
    },
    verbose: { kind: "boolean", description: "总是把日志写到 stderr；默认只在终端里显示" },
    offline: { kind: "boolean", description: "禁止联网：过期的缓存照常使用，没有缓存时报错" },
} as const satisfies Readonly<Record<string, OptionSpec>>;

type EnumName<V> = V extends string
    ? V
    : V extends { readonly value: infer N extends string }
      ? N
      : never;

type ItemValue<I> = I extends { readonly kind: "enum"; readonly values: readonly (infer V)[] }
    ? EnumName<V>
    : I extends { readonly kind: "integer" }
      ? number
      : string;

/** The type a command receives for one option, when the option is present. */
export type OptionValueType<O> = O extends { readonly kind: "boolean" }
    ? boolean
    : O extends { readonly kind: "integer" | "number" }
      ? number
      : O extends { readonly kind: "enum"; readonly values: readonly (infer V)[] }
        ? EnumName<V>
        : O extends { readonly kind: "list"; readonly item: infer I }
          ? readonly ItemValue<I>[]
          : O extends { readonly kind: "range"; readonly item: infer I }
            ? RangeValue<I extends "string" ? string : number>
            : O extends { readonly kind: "credential" }
              ? "-"
              : string;

/** Whether a command always gets a value: it is required, has a default, or is a switch. */
type AlwaysPresent<O> = O extends { readonly kind: "boolean" }
    ? true
    : O extends { readonly required: true }
      ? true
      : O extends { readonly default: infer D }
        ? undefined extends D
            ? false
            : true
        : false;

export type ParsedOptions<Os> = {
    readonly [K in keyof Os]: AlwaysPresent<Os[K]> extends true
        ? OptionValueType<Os[K]>
        : OptionValueType<Os[K]> | undefined;
};

export type ParsedPositionals<Ps extends readonly PositionalSpec[]> = {
    readonly [P in Ps[number] as P["name"]]: P extends { readonly variadic: true }
        ? readonly string[]
        : P extends { readonly optional: true }
          ? string | undefined
          : string;
};

export type GlobalOptions = ParsedOptions<typeof GLOBAL_OPTIONS>;

/** What a command receives, typed from its own spec. */
export interface CommandArgs<S extends CommandSpec> {
    readonly positionals: S extends {
        readonly positionals: infer Ps extends readonly PositionalSpec[];
    }
        ? ParsedPositionals<Ps>
        : Record<never, never>;
    readonly options: S extends { readonly options: infer Os }
        ? ParsedOptions<Os>
        : Record<never, never>;
    readonly global: GlobalOptions;
}

/** The services a command may use. It grows as the commands that need more arrive. */
export interface CommandContext {
    readonly io: Io;
    readonly registry: Registry;
    readonly version: string;
    /** Where the data directory and its files are; resolving them does not create anything. */
    readonly paths: RuntimePaths;
    /** The settings, already layered from the environment, `config.json` and the defaults. */
    readonly config: ResolvedConfig;
    /**
     * The database. It is opened (and the data directory created) on the first call and closed by
     * the runner when the command ends, so a command that never calls it leaves the disk alone.
     */
    readonly store: () => Store;
    /**
     * `fetch` for shared/core: it adds the User-Agent and a deadline (`network.timeoutMs` unless
     * `timeoutMs` says otherwise) and reports a failed connection as `NETWORK` and an unreadable
     * answer as `UPSTREAM_ERROR`. A status that is not a success is left to the caller.
     */
    readonly http: (options?: { timeoutMs?: number }) => FetchLike;
    /**
     * Progress and diagnostics, one line each. They go to stderr when a person is watching
     * (stderr is a terminal) or `--verbose` was given, and nowhere otherwise, so an agent's
     * context is not spent on them (design 4.2).
     */
    readonly log: (message: string) => void;
}

/** What a command returns; the runner wraps it into the output envelope (design 4.3). */
export interface CommandResult {
    readonly data: unknown;
    readonly meta?: Readonly<Record<string, unknown>>;
    readonly warnings?: readonly Warning[];
}

export type CommandHandler<S extends CommandSpec> = (
    args: CommandArgs<S>,
    ctx: CommandContext
) => Promise<CommandResult> | CommandResult;

/** The arguments as the parser produces them, before they are typed from a spec. */
export interface RawCommandArgs {
    readonly positionals: Readonly<Record<string, unknown>>;
    readonly options: Readonly<Record<string, unknown>>;
    readonly global: GlobalOptions;
}

export interface CommandDefinition {
    readonly spec: CommandSpec;
    /** `spec.name` split into words. */
    readonly words: readonly string[];
    readonly run: (
        args: RawCommandArgs,
        ctx: CommandContext
    ) => Promise<CommandResult> | CommandResult;
}

/**
 * Declares a command. `spec` is a literal that is kept as written, so the handler's `args` are
 * typed from it: an enum option arrives as the union of its values, a range as a `RangeValue`,
 * an option with a default as a plain value.
 */
export function defineCommand<const S extends CommandSpec>(
    spec: S,
    run: CommandHandler<S>
): CommandDefinition {
    // The registry stores commands without their spec types; `run` is only ever called with
    // arguments the parser built from the same spec, so the cast is the one place they meet.
    return { spec, words: spec.name.split(" "), run: run as unknown as CommandDefinition["run"] };
}

/** An option of a command, with the key it is read by and the flag it is written as. */
export interface OptionEntry {
    readonly key: string;
    /** The flag without its leading dashes: `group-by`. */
    readonly flag: string;
    readonly spec: OptionSpec;
}

/** `groupBy` is written `--group-by`. */
export function flagOf(key: string): string {
    return key.replaceAll(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}

function entriesOf(options: Readonly<Record<string, OptionSpec>> | undefined): OptionEntry[] {
    return Object.entries(options ?? {}).map(([key, spec]) => ({ key, flag: flagOf(key), spec }));
}

export const GLOBAL_OPTION_ENTRIES: readonly OptionEntry[] = entriesOf(GLOBAL_OPTIONS);

const entryCache = new WeakMap<CommandDefinition, readonly OptionEntry[]>();

/** The command's own options (not the global ones), in declaration order. */
export function commandOptionEntries(command: CommandDefinition): readonly OptionEntry[] {
    let entries = entryCache.get(command);
    if (!entries) {
        entries = entriesOf(command.spec.options);
        entryCache.set(command, entries);
    }
    return entries;
}

/** The commands that share a first word (`user list`, `user bind`…). */
export interface CommandGroup {
    readonly name: string;
    readonly summary: string;
    readonly commands: readonly CommandDefinition[];
}

export type Resolution =
    | { readonly kind: "command"; readonly command: CommandDefinition }
    | { readonly kind: "group"; readonly group: CommandGroup }
    | { readonly kind: "none" };

export interface Registry {
    readonly commands: readonly CommandDefinition[];
    readonly groups: readonly CommandGroup[];
    /** Looks up the words typed so far: one word may name a command or a group. */
    resolve: (words: readonly string[]) => Resolution;
    /** The command with this full name (`user bind`), if there is one. */
    find: (name: string) => CommandDefinition | undefined;
    /** Everything that can be typed first: leaf commands and group names. */
    topLevelNames: () => string[];
}

export interface RegistryInput {
    readonly commands: readonly CommandDefinition[];
    /** A one-line description for each group, keyed by its first word. */
    readonly groups?: Readonly<Record<string, string>>;
}

const WORD = /^[a-z][a-z0-9-]*$/;
const OPTION_KEY = /^[a-z][a-zA-Z0-9]*$/;
/** `noUpload` would be written `--no-upload`, which already means "turn `upload` off". */
const NEGATION_LOOKALIKE = /^no[A-Z]/;
const RESERVED_FLAGS = new Set(["help"]);

function fail(where: string, message: string): never {
    throw new Error(`command registry: ${where}: ${message}`);
}

function checkEnumValues(where: string, values: readonly EnumValue[]): void {
    if (values.length === 0) fail(where, "an enum needs at least one value");
    const seen = new Set<string>();
    for (const member of values.map(value => enumMember(value))) {
        for (const spelling of [member.value, ...(member.aliases ?? [])]) {
            const normalized = spelling.toLowerCase();
            if (normalized === "" || spelling !== spelling.trim()) {
                fail(where, `"${spelling}" is not a usable spelling`);
            }
            if (seen.has(normalized)) fail(where, `"${spelling}" is listed twice`);
            seen.add(normalized);
        }
    }
}

function enumHas(values: readonly EnumValue[], value: unknown): boolean {
    return values.some(member => enumMember(member).value === value);
}

function checkOption(where: string, key: string, spec: OptionSpec): void {
    const at = `${where} option ${key}`;
    if (!OPTION_KEY.test(key)) fail(at, "the key has to be camelCase");
    if (NEGATION_LOOKALIKE.test(key)) {
        fail(at, 'a key starting with "no" collides with the --no-… form of another switch');
    }
    if (spec.description.trim() === "") fail(at, "needs a description");

    switch (spec.kind) {
        case "enum":
            checkEnumValues(at, spec.values);
            if (spec.default !== undefined && !enumHas(spec.values, spec.default)) {
                fail(at, "the default is not one of the values");
            }
            break;
        case "list":
            if (spec.item.kind === "enum") checkEnumValues(at, spec.item.values);
            if (spec.default && spec.item.kind === "enum") {
                for (const value of spec.default) {
                    if (!enumHas(spec.item.values, value))
                        fail(at, "the default has a value outside the enum");
                }
            }
            break;
        case "integer":
        case "number":
            if (spec.min !== undefined && spec.max !== undefined && spec.min > spec.max) {
                fail(at, "min is greater than max");
            }
            for (const bound of [spec.min, spec.max, spec.default]) {
                if (bound !== undefined && !Number.isFinite(bound))
                    fail(at, "bounds must be finite");
            }
            if (spec.default !== undefined) {
                if (spec.min !== undefined && spec.default < spec.min)
                    fail(at, "the default is below min");
                if (spec.max !== undefined && spec.default > spec.max)
                    fail(at, "the default is above max");
                if (spec.kind === "integer" && !Number.isInteger(spec.default)) {
                    fail(at, "the default is not an integer");
                }
            }
            break;
        default:
            break;
    }
}

function checkPositionals(where: string, positionals: readonly PositionalSpec[]): void {
    const names = new Set<string>();
    let sawOptional = false;
    positionals.forEach((positional, index) => {
        const at = `${where} argument ${positional.name}`;
        if (!OPTION_KEY.test(positional.name)) fail(at, "the name has to be camelCase");
        if (names.has(positional.name)) fail(at, "the name is used twice");
        names.add(positional.name);
        if (positional.description.trim() === "") fail(at, "needs a description");
        if (positional.variadic && index !== positionals.length - 1) {
            fail(at, "only the last argument can take the rest");
        }
        if (sawOptional && !positional.optional)
            fail(at, "a required argument follows an optional one");
        if (positional.optional) sawOptional = true;
    });
}

function checkCommand(command: CommandDefinition): void {
    const { spec } = command;
    const where = spec.name;
    if (
        command.words.length < 1 ||
        command.words.length > 2 ||
        !command.words.every(word => WORD.test(word))
    ) {
        fail(where, "a name is one or two lowercase words");
    }
    if (spec.summary.trim() === "") fail(where, "needs a summary");

    checkPositionals(where, spec.positionals ?? []);

    const flags = new Set<string>([
        ...RESERVED_FLAGS,
        ...GLOBAL_OPTION_ENTRIES.map(entry => entry.flag),
    ]);
    for (const [key, option] of Object.entries(spec.options ?? {})) {
        checkOption(where, key, option);
        const flag = flagOf(key);
        if (flags.has(flag)) fail(`${where} option ${key}`, `--${flag} is already taken`);
        flags.add(flag);
    }
}

/** Checks the commands against each other and indexes them. A mistake here is a bug, so it throws. */
export function buildRegistry(input: RegistryInput): Registry {
    const commands = [...input.commands];
    const byName = new Map<string, CommandDefinition>();
    const members = new Map<string, CommandDefinition[]>();

    for (const command of commands) {
        checkCommand(command);
        if (byName.has(command.spec.name)) fail(command.spec.name, "is registered twice");
        byName.set(command.spec.name, command);
        if (command.words.length === 2) {
            const list = members.get(command.words[0]) ?? [];
            list.push(command);
            members.set(command.words[0], list);
        }
    }

    const groupSummaries = input.groups ?? {};
    for (const name of members.keys()) {
        if (byName.has(name)) fail(name, "is both a command and the first word of others");
        if (!groupSummaries[name]) fail(name, "is a group without a description");
    }
    for (const name of Object.keys(groupSummaries)) {
        if (!members.has(name)) fail(name, "describes a group that has no commands");
    }

    const groups: CommandGroup[] = [...members.entries()].map(([name, groupCommands]) => ({
        name,
        summary: groupSummaries[name],
        commands: groupCommands,
    }));
    const groupByName = new Map(groups.map(group => [group.name, group]));

    return {
        commands,
        groups,
        resolve(words) {
            if (words.length === 1) {
                const command = byName.get(words[0]);
                if (command) return { kind: "command", command };
                const group = groupByName.get(words[0]);
                if (group) return { kind: "group", group };
            } else if (words.length === 2) {
                const command = byName.get(`${words[0]} ${words[1]}`);
                if (command) return { kind: "command", command };
            }
            return { kind: "none" };
        },
        find: name => byName.get(name),
        topLevelNames: () => [...new Set(commands.map(command => command.words[0]))],
    };
}
