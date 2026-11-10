import type { CommandSpec, RangeValue } from "../../src/commands/registry";
import { describe, expect, expectTypeOf, it } from "vitest";
import { COMMANDS, createRegistry } from "../../src/commands";
import { parseArgv } from "../../src/commands/parse";
import {
    buildRegistry,
    commandOptionEntries,
    defineCommand,
    flagOf,
    GLOBAL_OPTION_ENTRIES,
} from "../../src/commands/registry";
import { splitCommandLine } from "../../src/util/shell";
import { COMMAND_GROUPS, createTestRegistry, demo, favAdd, userList } from "./fixtures";

const base = {
    name: "t",
    summary: "测试命令",
    category: "catalog",
    effect: "none",
    output: "object",
} as const satisfies CommandSpec;

function commandWith(extra: Partial<CommandSpec>) {
    return defineCommand({ ...base, ...extra } as CommandSpec, () => ({ data: null }));
}

function registryError(extra: Partial<CommandSpec>): string {
    try {
        buildRegistry({ commands: [commandWith(extra)] });
    } catch (error) {
        return (error as Error).message;
    }
    return "";
}

describe("flags", () => {
    it("writes a camelCase key in kebab-case", () => {
        expect(flagOf("groupBy")).toBe("group-by");
        expect(flagOf("limit")).toBe("limit");
        expect(flagOf("top50")).toBe("top50");
        expect(flagOf("keepLxnsToken")).toBe("keep-lxns-token");
    });

    it("lists a command's options in declaration order", () => {
        expect(commandOptionEntries(demo).map(entry => entry.flag)).toEqual([
            "limit",
            "offset",
            "sort",
            "rank",
            "diff",
            "tags",
            "level",
            "constant",
            "ratio",
            "asc",
            "upload",
            "qr",
            "name",
            "version",
            "group-by",
        ]);
        expect(commandOptionEntries(userList)).toEqual([]);
        expect(GLOBAL_OPTION_ENTRIES.map(entry => entry.flag)).toEqual([
            "pretty",
            "format",
            "verbose",
            "offline",
        ]);
    });
});

describe("registry lookup", () => {
    const registry = createTestRegistry();

    it("resolves one word to a command or a group, and two words to a command", () => {
        expect(registry.resolve(["demo"])).toMatchObject({ kind: "command" });
        expect(registry.resolve(["user"])).toMatchObject({
            kind: "group",
            group: { name: "user" },
        });
        expect(registry.resolve(["user", "bind"])).toMatchObject({ kind: "command" });
        expect(registry.resolve(["user", "nope"])).toEqual({ kind: "none" });
        expect(registry.resolve(["nope"])).toEqual({ kind: "none" });
        expect(registry.resolve(["demo", "x"])).toEqual({ kind: "none" });
        expect(registry.resolve([])).toEqual({ kind: "none" });
    });

    it("finds a command by its full name", () => {
        expect(registry.find("user bind")?.spec.name).toBe("user bind");
        expect(registry.find("user")).toBeUndefined();
    });

    it("lists what can be typed first, each name once", () => {
        expect(registry.topLevelNames()).toEqual(["demo", "needs", "user", "fav"]);
    });

    it("groups the subcommands and keeps their order", () => {
        const user = registry.groups.find(group => group.name === "user");
        expect(user?.summary).toBe("管理用户");
        expect(user?.commands.map(command => command.spec.name)).toEqual([
            "user list",
            "user bind",
        ]);
    });
});

describe("registry validation", () => {
    it("accepts the fixtures and the real command list", () => {
        expect(() => createTestRegistry()).not.toThrow();
        expect(() => createRegistry()).not.toThrow();
    });

    it("rejects a command registered twice", () => {
        expect(() => buildRegistry({ commands: [commandWith({}), commandWith({})] })).toThrow(
            "t: is registered twice"
        );
    });

    it("rejects names that are not one or two lowercase words", () => {
        for (const name of ["Demo", "a b c", "", "two  spaces", "x_y", "9lives"]) {
            expect(registryError({ name })).toContain("a name is one or two lowercase words");
        }
    });

    it("rejects a missing summary or option description", () => {
        expect(registryError({ summary: " " })).toContain("needs a summary");
        expect(registryError({ options: { a: { kind: "string", description: "" } } })).toContain(
            "needs a description"
        );
    });

    it("rejects a group without a description, and a description without a group", () => {
        const member = defineCommand({ ...base, name: "user list" }, () => ({ data: null }));
        expect(() => buildRegistry({ commands: [member] })).toThrow(
            "user: is a group without a description"
        );
        expect(() =>
            buildRegistry({ commands: [commandWith({})], groups: { orphan: "x" } })
        ).toThrow("orphan: describes a group that has no commands");
        expect(() =>
            buildRegistry({ commands: [member], groups: { user: "管理用户" } })
        ).not.toThrow();
    });

    it("rejects a word that is both a command and a group", () => {
        const leaf = defineCommand({ ...base, name: "user" }, () => ({ data: null }));
        const member = defineCommand({ ...base, name: "user list" }, () => ({ data: null }));
        expect(() => buildRegistry({ commands: [leaf, member], groups: { user: "x" } })).toThrow(
            "user: is both a command and the first word of others"
        );
    });

    it("rejects option keys that are not camelCase or look like a negation", () => {
        for (const key of ["Bad", "snake_case", "kebab-case", "9a", ""]) {
            expect(
                registryError({ options: { [key]: { kind: "boolean", description: "x" } } })
            ).toContain("the key has to be camelCase");
        }
        expect(
            registryError({ options: { noUpload: { kind: "boolean", description: "x" } } })
        ).toContain("collides with the --no-… form");
        // `note` merely starts with the letters.
        expect(registryError({ options: { note: { kind: "string", description: "x" } } })).toBe("");
    });

    it("rejects an option that takes a global flag", () => {
        for (const key of ["pretty", "format", "verbose", "offline", "help"]) {
            expect(
                registryError({ options: { [key]: { kind: "boolean", description: "x" } } })
            ).toContain(`--${key} is already taken`);
        }
    });

    it("rejects enums that cannot be told apart", () => {
        const enumError = (values: readonly (string | { value: string; aliases?: string[] })[]) =>
            registryError({ options: { e: { kind: "enum", values, description: "x" } } });
        expect(enumError([])).toContain("at least one value");
        expect(enumError(["a", "A"])).toContain('"A" is listed twice');
        expect(enumError(["a", { value: "b", aliases: ["a"] }])).toContain('"a" is listed twice');
        expect(enumError([" a"])).toContain("is not a usable spelling");
        expect(enumError([""])).toContain("is not a usable spelling");
        expect(enumError(["a", { value: "b", aliases: ["c"] }])).toBe("");
    });

    it("rejects defaults and bounds that do not fit", () => {
        const optionError = (option: CommandSpec["options"]) => registryError({ options: option });
        expect(
            optionError({ e: { kind: "enum", values: ["a"], default: "b", description: "x" } })
        ).toContain("the default is not one of the values");
        expect(
            optionError({
                l: {
                    kind: "list",
                    item: { kind: "enum", values: ["a"] },
                    default: ["z"],
                    description: "x",
                },
            })
        ).toContain("the default has a value outside the enum");
        expect(optionError({ n: { kind: "integer", min: 5, max: 1, description: "x" } })).toContain(
            "min is greater than max"
        );
        expect(
            optionError({ n: { kind: "integer", min: 1, default: 0, description: "x" } })
        ).toContain("the default is below min");
        expect(
            optionError({ n: { kind: "number", max: 1, default: 2, description: "x" } })
        ).toContain("the default is above max");
        expect(optionError({ n: { kind: "integer", default: 1.5, description: "x" } })).toContain(
            "the default is not an integer"
        );
        expect(
            optionError({ n: { kind: "integer", min: Number.NaN, description: "x" } })
        ).toContain("bounds must be finite");
    });

    it("rejects positional arguments in the wrong order", () => {
        const positionalError = (positionals: CommandSpec["positionals"]) =>
            registryError({ positionals });
        expect(
            positionalError([
                { name: "a", description: "x", optional: true },
                { name: "b", description: "x" },
            ])
        ).toContain("a required argument follows an optional one");
        expect(
            positionalError([
                { name: "a", description: "x", variadic: true },
                { name: "b", description: "x" },
            ])
        ).toContain("only the last argument can take the rest");
        expect(
            positionalError([
                { name: "a", description: "x" },
                { name: "a", description: "x" },
            ])
        ).toContain("the name is used twice");
        expect(positionalError([{ name: "Bad", description: "x" }])).toContain("camelCase");
        expect(positionalError([{ name: "a", description: "" }])).toContain("needs a description");
        expect(
            positionalError([
                { name: "a", description: "x" },
                { name: "b", description: "x", optional: true },
                { name: "c", description: "x", variadic: true, optional: true },
            ])
        ).toBe("");
    });
});

/** Every example in the registry is a command line that the parser accepts. */
function checkExamples(registry: ReturnType<typeof createRegistry>): string[] {
    const problems: string[] = [];
    for (const command of registry.commands) {
        for (const example of command.spec.examples ?? []) {
            const words = splitCommandLine(example.command);
            const outcome = parseArgv(registry, words);
            if (outcome.kind !== "run" || outcome.command.spec.name !== command.spec.name) {
                const detail = outcome.kind === "error" ? outcome.error.message : outcome.kind;
                problems.push(`${command.spec.name}: "${example.command}" → ${detail}`);
            }
        }
    }
    return problems;
}

describe("examples", () => {
    it("are accepted by the parser they document", () => {
        expect(checkExamples(createTestRegistry())).toEqual([]);
        expect(checkExamples(createRegistry())).toEqual([]);
    });

    it("are caught when they are wrong", () => {
        const wrong = defineCommand(
            {
                ...base,
                name: "wrong",
                options: { limit: { kind: "integer", description: "x" } },
                examples: [
                    { command: "wrong --limit abc", description: "not a number" },
                    { command: "wrong --nope", description: "no such option" },
                    { command: "wrong --limit 3", description: "fine" },
                ],
            },
            () => ({ data: null })
        );
        expect(checkExamples(buildRegistry({ commands: [wrong] }))).toEqual([
            'wrong: "wrong --limit abc" → 选项 --limit 需要整数「abc」',
            'wrong: "wrong --nope" → 未知选项「--nope」',
        ]);
    });
});

describe("the real command list", () => {
    it("has a unique name, a summary and an effect for every command", () => {
        const names = COMMANDS.map(command => command.spec.name);
        expect(new Set(names).size).toBe(names.length);
        for (const command of COMMANDS) {
            expect(command.spec.summary).not.toBe("");
            expect(["none", "local", "remote", "account"]).toContain(command.spec.effect);
        }
    });
});

describe("typed arguments", () => {
    it("types a handler's arguments from its spec", () => {
        defineCommand(
            {
                name: "typed",
                summary: "类型检查",
                category: "catalog",
                effect: "none",
                output: "object",
                positionals: [
                    { name: "text", description: "x" },
                    { name: "difficulty", description: "x", optional: true },
                    { name: "songs", description: "x", variadic: true },
                ],
                options: {
                    limit: { kind: "integer", default: 50, description: "x" },
                    count: { kind: "integer", description: "x" },
                    sort: {
                        kind: "enum",
                        values: ["default", "constant"],
                        default: "default",
                        description: "x",
                    },
                    rank: {
                        kind: "enum",
                        values: [{ value: "SSS+", aliases: ["sssp"] }, "SSS"],
                        description: "x",
                    },
                    diff: {
                        kind: "list",
                        item: {
                            kind: "enum",
                            values: [{ value: "MASTER", aliases: ["mas"] }, "Re:MASTER"],
                        },
                        description: "x",
                    },
                    ids: { kind: "list", item: { kind: "integer" }, description: "x" },
                    level: { kind: "range", item: "string", description: "x" },
                    constant: { kind: "range", item: "number", description: "x" },
                    asc: { kind: "boolean", description: "x" },
                    qr: { kind: "credential", description: "x" },
                    target: { kind: "string", required: true, description: "x" },
                    name: { kind: "string", description: "x" },
                },
            },
            args => {
                expectTypeOf(args.positionals.text).toEqualTypeOf<string>();
                expectTypeOf(args.positionals.difficulty).toEqualTypeOf<string | undefined>();
                expectTypeOf(args.positionals.songs).toEqualTypeOf<readonly string[]>();

                expectTypeOf(args.options.limit).toEqualTypeOf<number>();
                expectTypeOf(args.options.count).toEqualTypeOf<number | undefined>();
                expectTypeOf(args.options.sort).toEqualTypeOf<"default" | "constant">();
                expectTypeOf(args.options.rank).toEqualTypeOf<"SSS+" | "SSS" | undefined>();
                expectTypeOf(args.options.diff).toEqualTypeOf<
                    readonly ("MASTER" | "Re:MASTER")[] | undefined
                >();
                expectTypeOf(args.options.ids).toEqualTypeOf<readonly number[] | undefined>();
                expectTypeOf(args.options.level).toEqualTypeOf<RangeValue<string> | undefined>();
                expectTypeOf(args.options.constant).toEqualTypeOf<RangeValue<number> | undefined>();
                expectTypeOf(args.options.asc).toEqualTypeOf<boolean>();
                expectTypeOf(args.options.qr).toEqualTypeOf<"-" | undefined>();
                expectTypeOf(args.options.target).toEqualTypeOf<string>();
                expectTypeOf(args.options.name).toEqualTypeOf<string | undefined>();

                expectTypeOf(args.global.pretty).toEqualTypeOf<boolean>();
                expectTypeOf(args.global.format).toEqualTypeOf<
                    "json" | "tsv" | "text" | undefined
                >();
                return { data: null };
            }
        );
    });

    it("keeps the groups the fixtures declare", () => {
        expect(Object.keys(COMMAND_GROUPS)).toEqual(["user", "fav"]);
        expect(favAdd.words).toEqual(["fav", "add"]);
    });
});
