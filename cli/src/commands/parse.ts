/**
 * Reads a command line against the registry. It never throws for a bad command line: the result
 * says what to do (run, show help, print the version) or carries the `USAGE` error together with
 * the options understood so far, so even a failure can honor `--pretty`.
 */
import type { CliError, ErrorCandidate } from "../errors";
import type {
    CommandDefinition,
    CommandGroup,
    GlobalOptions,
    OptionEntry,
    PositionalSpec,
    RawCommandArgs,
    Registry,
} from "./registry";
import { usageError } from "../errors";
import { closestMatches } from "../util/closest";
import { commandOptionEntries, GLOBAL_OPTION_ENTRIES } from "./registry";
import { convertBoolean, convertOption, echo, ValueError } from "./values";

export type HelpTarget =
    | { readonly kind: "root" }
    | { readonly kind: "group"; readonly group: CommandGroup }
    | { readonly kind: "command"; readonly command: CommandDefinition };

export type ParseOutcome =
    | { readonly kind: "version" }
    | { readonly kind: "help"; readonly target: HelpTarget }
    | { readonly kind: "run"; readonly command: CommandDefinition; readonly args: RawCommandArgs }
    | {
          readonly kind: "error";
          readonly error: CliError;
          /** The command, when the words got that far. */
          readonly command?: CommandDefinition;
          readonly global: GlobalOptions;
      };

/** Negative numbers are values, not options: there are no short options but `-h`. */
const NEGATIVE_NUMBER = /^-\d/;

/** Whether a token can be the value of the option before it, rather than another option. */
function isValueToken(token: string | undefined): token is string {
    return (
        token !== undefined &&
        (!token.startsWith("-") || token === "-" || NEGATIVE_NUMBER.test(token))
    );
}

interface FoundOption {
    readonly entry: OptionEntry;
    readonly scope: "command" | "global";
    /** Written as `--no-x`. */
    readonly negated: boolean;
}

function defaultOf(entry: OptionEntry): unknown {
    const { spec } = entry;
    if (spec.kind === "boolean") return spec.default ?? false;
    return "default" in spec ? spec.default : undefined;
}

function label(positional: PositionalSpec): string {
    return `<${positional.valueName ?? positional.name}>`;
}

class Scanner {
    private readonly registry: Registry;
    private readonly argv: readonly string[];
    private readonly words: string[] = [];
    private readonly positionals: string[] = [];
    private readonly commandValues = new Map<string, unknown>();
    private readonly globalValues = new Map<string, unknown>();
    private command: CommandDefinition | undefined;
    private group: CommandGroup | undefined;
    private problem: CliError | undefined;
    /** The command words did not resolve, so nothing after them can be read as arguments. */
    private fatal = false;
    private help = false;
    private version = false;
    /** After `--` everything is a positional argument. */
    private terminated = false;

    constructor(registry: Registry, argv: readonly string[]) {
        this.registry = registry;
        this.argv = argv;
    }

    scan(): ParseOutcome {
        for (let index = 0; index < this.argv.length; index++) {
            index = this.consume(index);
        }
        return this.finish();
    }

    /** Handles the token at `index` and returns the index of the last token it used. */
    private consume(index: number): number {
        const token = this.argv[index];
        if (this.terminated) {
            this.addWord(token);
            return index;
        }
        if (token === "--") {
            this.terminated = true;
            return index;
        }
        if (token === "-h" || token === "--help") {
            this.help = true;
            return index;
        }
        if (token.startsWith("--")) return this.consumeOption(index);
        if (token.length > 1 && token.startsWith("-") && !NEGATIVE_NUMBER.test(token)) {
            this.report(
                `不支持短选项${echo(token)}；选项都写成 --kebab-case，只有 -h 可以代替 --help`
            );
            return index;
        }
        this.addWord(token);
        return index;
    }

    /** A word before the command is complete names it; a word after it is an argument. */
    private addWord(token: string): void {
        if (this.command) {
            this.positionals.push(token);
            return;
        }
        if (this.fatal) return;

        this.words.push(token);
        const resolution = this.registry.resolve(this.words);
        if (resolution.kind === "command") {
            this.command = resolution.command;
        } else if (resolution.kind === "group") {
            this.group = resolution.group;
        } else {
            this.fatal = true;
            this.reportUnresolvedCommand();
        }
    }

    private reportUnresolvedCommand(): void {
        const word = this.words[this.words.length - 1];
        const { group } = this;
        if (!group) {
            const candidates = closestMatches(word, this.registry.topLevelNames()).map(ref => ({
                ref,
            }));
            this.report(`未知命令${echo(word)}`, candidates);
            return;
        }
        const subs = group.commands.map(command => command.words[1]);
        const candidates = closestMatches(word, subs).map(sub => ({ ref: `${group.name} ${sub}` }));
        this.report(
            `「${group.name}」没有子命令${echo(word)}；可用：${subs.join("、")}`,
            candidates
        );
    }

    private consumeOption(index: number): number {
        const token = this.argv[index];
        const equals = token.indexOf("=");
        const name = equals < 0 ? token.slice(2) : token.slice(2, equals);
        const inline = equals < 0 ? undefined : token.slice(equals + 1);

        // `--version` prints the CLI's version only before a command; after one it may be that
        // command's own option (`charts --version 熊`).
        if (name === "version" && !this.command && !this.group) {
            if (inline === undefined) this.version = true;
            else this.report("--version 不带值");
            return index;
        }

        const found = this.lookup(name);
        if (!found) {
            if (!this.fatal) this.reportUnknownOption(name);
            return index;
        }

        const { entry, scope, negated } = found;
        const { flag } = entry;
        let consumed = index;
        let value: unknown;
        try {
            if (entry.spec.kind === "boolean") {
                if (negated) {
                    if (inline !== undefined) throw new ValueError(`--no-${flag} 不带值`);
                    value = false;
                } else {
                    value = inline === undefined ? true : convertBoolean(flag, inline);
                }
            } else {
                if (negated) throw new ValueError(`选项 --${flag} 不是开关，不能写成 --no-${flag}`);
                let raw = inline;
                if (raw === undefined) {
                    const next = this.argv[index + 1];
                    if (!isValueToken(next)) throw new ValueError(`选项 --${flag} 缺少值`);
                    raw = next;
                    consumed = index + 1;
                }
                value = convertOption(entry, raw);
            }
        } catch (error) {
            if (!(error instanceof ValueError)) throw error;
            this.report(error.message, error.candidates);
            return consumed;
        }

        this.store(scope === "global" ? this.globalValues : this.commandValues, entry, value);
        return consumed;
    }

    private store(values: Map<string, unknown>, entry: OptionEntry, value: unknown): void {
        if (entry.spec.kind === "list") {
            const earlier = (values.get(entry.key) ?? []) as (string | number)[];
            values.set(entry.key, [...new Set([...earlier, ...(value as (string | number)[])])]);
        } else if (values.has(entry.key)) {
            this.report(`选项 --${entry.flag} 写了多次`);
        } else {
            values.set(entry.key, value);
        }
    }

    private findEntry(flag: string): Pick<FoundOption, "entry" | "scope"> | undefined {
        const own = this.command
            ? commandOptionEntries(this.command).find(entry => entry.flag === flag)
            : undefined;
        if (own) return { entry: own, scope: "command" };
        const global = GLOBAL_OPTION_ENTRIES.find(entry => entry.flag === flag);
        return global ? { entry: global, scope: "global" } : undefined;
    }

    private lookup(name: string): FoundOption | undefined {
        const direct = this.findEntry(name);
        if (direct) return { ...direct, negated: false };
        if (name.startsWith("no-")) {
            const base = this.findEntry(name.slice(3));
            if (base) return { ...base, negated: true };
        }
        return undefined;
    }

    private reportUnknownOption(name: string): void {
        const shown = echo(`--${name}`);
        if (!this.command) {
            const globals = GLOBAL_OPTION_ENTRIES.map(entry => `--${entry.flag}`).join("、");
            this.report(
                `未知选项${shown}：命令名之前只能写全局选项（${globals}），其他选项要写在命令名之后`
            );
            return;
        }
        const flags = [...commandOptionEntries(this.command), ...GLOBAL_OPTION_ENTRIES].map(
            entry => entry.flag
        );
        const candidates = closestMatches(name, flags).map(flag => ({ ref: `--${flag}` }));
        this.report(`未知选项${shown}`, candidates);
    }

    /** Remembers the first problem; later ones are usually fallout. */
    private report(message: string, candidates?: readonly ErrorCandidate[]): void {
        if (this.problem) return;
        this.problem = usageError(message, {
            candidates: candidates?.length ? candidates : undefined,
            fix: this.fixCommand(),
        });
    }

    private fixCommand(): string {
        if (this.command) return `saltnet ${this.command.spec.name} --help`;
        if (this.group) return `saltnet ${this.group.name} --help`;
        return "saltnet --help";
    }

    private globals(): GlobalOptions {
        return this.fill(GLOBAL_OPTION_ENTRIES, this.globalValues) as unknown as GlobalOptions;
    }

    /** Every declared option gets a key: its value, its default, or undefined. */
    private fill(
        entries: readonly OptionEntry[],
        values: Map<string, unknown>
    ): Record<string, unknown> {
        const filled: Record<string, unknown> = {};
        for (const entry of entries) {
            filled[entry.key] = values.has(entry.key) ? values.get(entry.key) : defaultOf(entry);
            const { spec } = entry;
            if ("required" in spec && spec.required && filled[entry.key] === undefined) {
                this.report(`缺少必填选项 --${entry.flag}`);
            }
        }
        return filled;
    }

    private assignPositionals(specs: readonly PositionalSpec[]): Record<string, unknown> {
        const assigned: Record<string, unknown> = {};
        let used = 0;
        for (const spec of specs) {
            if (spec.variadic) {
                const rest = this.positionals.slice(used);
                used = this.positionals.length;
                if (rest.length === 0 && !spec.optional) this.report(`缺少参数 ${label(spec)}`);
                assigned[spec.name] = rest;
                continue;
            }
            const value = this.positionals[used];
            if (value === undefined) {
                if (!spec.optional) this.report(`缺少参数 ${label(spec)}`);
                assigned[spec.name] = undefined;
            } else {
                assigned[spec.name] = value;
                used++;
            }
        }
        if (used < this.positionals.length) {
            this.report(
                specs.length === 0
                    ? "这个命令不接受位置参数"
                    : `多余的位置参数：这个命令最多接受 ${specs.length} 个`
            );
        }
        return assigned;
    }

    private failure(): ParseOutcome {
        return {
            kind: "error",
            error: this.problem ?? usageError("命令行无法解析"),
            command: this.command,
            global: this.globals(),
        };
    }

    private finish(): ParseOutcome {
        // Help wins over any other mistake on the line, but not over an unknown command: there
        // is nothing to show help for.
        if (this.help && !this.fatal) {
            if (this.command)
                return { kind: "help", target: { kind: "command", command: this.command } };
            if (this.group) return { kind: "help", target: { kind: "group", group: this.group } };
            return { kind: "help", target: { kind: "root" } };
        }
        if (this.version && !this.command && !this.group) return { kind: "version" };
        if (this.problem) return this.failure();

        const { command, group } = this;
        if (!command) {
            if (group) {
                const subs = group.commands.map(sub => sub.words[1]);
                this.report(
                    `「${group.name}」需要子命令：${subs.join("、")}`,
                    subs.map(sub => ({ ref: `${group.name} ${sub}` }))
                );
                return this.failure();
            }
            // A bare `saltnet` shows the command list.
            return { kind: "help", target: { kind: "root" } };
        }

        const positionals = this.assignPositionals(command.spec.positionals ?? []);
        const options = this.fill(commandOptionEntries(command), this.commandValues);
        if (this.problem) return this.failure();
        return { kind: "run", command, args: { positionals, options, global: this.globals() } };
    }
}

export function parseArgv(registry: Registry, argv: readonly string[]): ParseOutcome {
    return new Scanner(registry, argv).scan();
}
