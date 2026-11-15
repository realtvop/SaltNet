/** The self-description command generated from the command registry. */
import type { ErrorCandidate } from "../errors";
import type { JsonSchema } from "./registry";
import { PUBLIC_VIEWS, VIEWS_CHANGES, VIEWS_VERSION } from "../catalog/views";
import { CliError, ERROR_CODES, EXIT_CODE_MEANINGS, exitCodeOf, usageError } from "../errors";
import { ENVELOPE_CHANGES, ENVELOPE_VERSION } from "../output/envelope";
import {
    anyOf,
    anything,
    bool,
    dictionary,
    int,
    list,
    literal,
    nullable,
    num,
    object,
    str,
    strEnum,
} from "../output/schema";
import { WARNING_CODES } from "../output/warning";
import { closestMatches } from "../util/closest";
import {
    commandErrorCodes,
    commandUsage,
    describeError,
    describeOption,
    describePositional,
} from "./describe";
import {
    COMMAND_CATEGORIES,
    commandOptionEntries,
    defineCommand,
    EFFECT_LABELS,
    GLOBAL_OPTION_ENTRIES,
} from "./registry";

const enumValueSchema = object(
    {
        value: str("规范写法"),
        aliases: list(str("别名"), "可接受的别名"),
        description: nullable(str("这个值的说明"), "这个值的说明；没有时是 null"),
    },
    { description: "一个枚举值" }
);

const optionItemSchema = object(
    {
        type: strEnum(["string", "integer", "number", "enum"], "列表项或区间端点的类型"),
        values: nullable(
            list(enumValueSchema, "枚举项的可选值"),
            "枚举项的可选值；不是枚举时是 null"
        ),
    },
    { description: "列表项或区间端点的说明" }
);

const optionSchema = object(
    {
        flag: str("带两个短横线的选项名"),
        type: strEnum(
            ["string", "credential", "integer", "number", "boolean", "enum", "list", "range"],
            "选项类型"
        ),
        description: str("选项说明"),
        valueName: nullable(str("帮助里显示的值名称"), "帮助里显示的值名称；没有时是 null"),
        required: bool("是否必填"),
        default: anything("默认值；没有时是 null，列表默认值是数组"),
        values: nullable(list(enumValueSchema, "枚举的可选值"), "枚举的可选值；不是枚举时是 null"),
        item: nullable(optionItemSchema, "列表项或区间端点的说明；不适用时是 null"),
        min: nullable(num("最小值"), "数字选项的最小值；没有时是 null"),
        max: nullable(num("最大值"), "数字选项的最大值；没有时是 null"),
    },
    { description: "一个命令行选项" }
);

const positionalSchema = object(
    {
        name: str("命令收到的位置参数键名"),
        valueName: nullable(str("帮助里显示的名称"), "帮助里显示的名称；没有时是 null"),
        description: str("位置参数说明"),
        required: bool("是否必填"),
        variadic: bool("是否接收余下的所有词"),
    },
    { description: "一个位置参数" }
);

const describedErrorSchema = object(
    {
        code: strEnum(ERROR_CODES, "稳定的错误码"),
        exitCode: int("进程退出码"),
        retryable: bool("默认是否可以原样重试"),
        description: str("错误的含义和处理办法"),
    },
    { description: "一个错误码" }
);

const changeSchema = object(
    {
        version: int("版本号"),
        description: str("这个版本的变化"),
    },
    { description: "一个版本变化" }
);

const warningSchema = object(
    {
        code: strEnum(Object.keys(WARNING_CODES), "警告码"),
        message: str("这次警告的说明"),
        fix: str("可以消除原因的命令"),
    },
    { description: "一个警告", optional: ["fix"] }
);

const candidateSchema = object(
    {
        ref: str("可以原样拿去重试的引用"),
        title: str("标题"),
        artist: str("曲师"),
        type: str("曲目类型"),
        difficulty: str("谱面难度"),
        level: str("谱面等级"),
    },
    {
        description: "一个候选引用",
        optional: ["title", "artist", "type", "difficulty", "level"],
    }
);

const errorObjectSchema: JsonSchema = {
    ...object(
        {
            code: strEnum(ERROR_CODES, "稳定的错误码"),
            message: str("给人看的错误说明"),
            candidates: list(candidateSchema, "可以重试的候选项"),
            fix: str("可以修正问题的命令"),
            retryable: bool("这次错误是否适合原样重试"),
        },
        {
            description: "失败详情；不同错误还可以带预览、设置问题、数据源或锁持有者",
            optional: ["candidates", "fix"],
        }
    ),
    additionalProperties: anything("这个错误码专有的额外信息"),
};

/** The public schema of the complete success and failure envelopes. */
export const ENVELOPE_SCHEMA = anyOf(
    "saltnet 的成功或失败输出",
    object(
        {
            v: literal(ENVELOPE_VERSION, "输出格式版本"),
            ok: literal(true, "成功"),
            command: str("运行的命令"),
            data: anything("命令的结果；形状看 schema 命令的 data"),
            meta: dictionary(anything("元数据值"), "本次结果的元数据"),
            warnings: list(warningSchema, "成功但要注意的警告"),
        },
        { description: "成功输出" }
    ),
    object(
        {
            v: literal(ENVELOPE_VERSION, "输出格式版本"),
            ok: literal(false, "失败"),
            command: nullable(str("运行的命令"), "运行的命令；还没识别出命令时是 null"),
            error: errorObjectSchema,
            meta: dictionary(anything("元数据值"), "失败前已经得到的元数据"),
            warnings: list(warningSchema, "失败前已经产生的警告"),
        },
        { description: "失败输出", optional: ["meta", "warnings"] }
    )
);

const commandsDataSchema = object(
    {
        kind: literal("commands", "这是全部命令的索引"),
        version: str("saltnet CLI 版本"),
        envelope: object(
            {
                version: int("输出格式版本"),
                changes: list(changeSchema, "输出格式的版本变化"),
                schema: dictionary(anything("JSON Schema 节点"), "完整输出的 JSON Schema"),
            },
            { description: "完整输出格式" }
        ),
        commands: list(
            object(
                {
                    name: str("命令全名"),
                    summary: str("一句话说明"),
                    category: strEnum(Object.keys(COMMAND_CATEGORIES), "命令分类"),
                    effect: strEnum(Object.keys(EFFECT_LABELS), "副作用级别"),
                    output: strEnum(["object", "list", "text"], "输出形状"),
                },
                { description: "一条命令" }
            ),
            "全部命令"
        ),
        groups: list(
            object(
                {
                    name: str("命令组名"),
                    summary: str("命令组说明"),
                    commands: list(str("命令全名"), "组里的命令"),
                },
                { description: "一个命令组" }
            ),
            "两词命令的分组"
        ),
        categories: list(
            object(
                { name: str("分类键"), label: str("分类标题") },
                { description: "一个命令分类" }
            ),
            "命令分类"
        ),
        effects: list(
            object(
                { level: str("副作用级别"), description: str("副作用说明") },
                { description: "一个副作用级别" }
            ),
            "副作用级别"
        ),
        globalOptions: list(optionSchema, "每条命令都接受的选项"),
        exitCodes: list(
            object(
                {
                    exitCode: int("进程退出码"),
                    meaning: str("退出码含义"),
                    errors: list(strEnum(ERROR_CODES, "错误码"), "映射到这个退出码的错误码"),
                },
                { description: "一个退出码" }
            ),
            "退出码 0 到 7"
        ),
        errors: list(describedErrorSchema, "全部错误码"),
        warnings: list(
            object(
                { code: str("警告码"), description: str("警告的含义") },
                { description: "一个警告码" }
            ),
            "全部警告码"
        ),
    },
    { description: "命令、输出、错误和警告的索引" }
);

const commandDataSchema = object(
    {
        kind: literal("command", "这是一条命令的说明"),
        name: str("命令全名"),
        summary: str("一句话说明"),
        description: nullable(str("详细说明"), "详细说明；没有时是 null"),
        category: strEnum(Object.keys(COMMAND_CATEGORIES), "命令分类"),
        effect: strEnum(Object.keys(EFFECT_LABELS), "副作用级别"),
        output: strEnum(["object", "list", "text"], "输出形状"),
        usage: str("完整用法行"),
        positionals: list(positionalSchema, "位置参数"),
        options: list(optionSchema, "这条命令自己的选项"),
        examples: list(
            object(
                { command: str("可复制运行的命令行"), description: str("示例说明") },
                { description: "一个示例" }
            ),
            "示例"
        ),
        errors: list(describedErrorSchema, "可能出现的错误码"),
        data: dictionary(anything("JSON Schema 节点"), "命令 data 的 JSON Schema"),
    },
    { description: "一条命令的完整机器可读说明" }
);

const viewsDataSchema = object(
    {
        kind: literal("views", "这是只读 SQL 视图的说明"),
        version: int("只读视图版本"),
        changes: list(changeSchema, "只读视图的版本变化"),
        views: list(
            object(
                {
                    name: str("视图名"),
                    summary: str("视图说明"),
                    needs: list(strEnum(["catalog", "collections"], "需要的数据"), "需要的数据"),
                    columns: list(
                        object(
                            {
                                name: str("列名"),
                                type: strEnum(["TEXT", "INTEGER", "REAL"], "SQLite 列类型"),
                                description: str("列的含义"),
                            },
                            { description: "一列" }
                        ),
                        "列定义"
                    ),
                },
                { description: "一个只读视图" }
            ),
            "sql 可以读取的视图"
        ),
    },
    { description: "只读 SQL 视图的机器可读说明" }
);

function commandNotFound(words: readonly string[], names: readonly string[]): CliError {
    const typed = words.join(" ");
    const candidates: ErrorCandidate[] = closestMatches(typed, names).map(ref => ({ ref }));
    return new CliError("NOT_FOUND", `找不到命令「${typed}」`, {
        candidates: candidates.length > 0 ? candidates : undefined,
    });
}

export const schema = defineCommand(
    {
        name: "schema",
        summary: "以机器可读的格式说明命令、参数、错误码和视图",
        description:
            "不带参数时列出全部命令、全局选项、输出格式、错误码和警告；给命令名时说明它的位置参数、选项、示例、错误码和 data 的 JSON Schema；--views 说明 sql 能读的视图。",
        category: "data",
        effect: "none",
        output: "object",
        allowBadConfig: true,
        positionals: [
            {
                name: "command",
                valueName: "命令",
                description: "一条命令的名字，可以是一个或两个词，例如 charts、config set",
                optional: true,
                variadic: true,
            },
        ],
        options: {
            views: {
                kind: "boolean",
                description: "列出 sql 可以读取的只读视图及其列定义",
            },
        },
        examples: [
            { command: "schema", description: "全部命令、错误码和输出格式" },
            { command: "schema charts", description: "charts 的参数和 data 形状" },
            { command: "schema config set", description: "config set 的参数和 data 形状" },
            { command: "schema --views", description: "sql 可以读取的视图和列" },
        ],
        errors: ["USAGE", "NOT_FOUND", "AMBIGUOUS_REF"],
        dataSchema: anyOf(
            "schema 的三种结果：命令索引、单条命令或只读视图",
            commandsDataSchema,
            commandDataSchema,
            viewsDataSchema
        ),
    },
    (args, ctx) => {
        const words = args.positionals.command;
        if (args.options.views) {
            if (words.length > 0) throw usageError("--views 不能和命令名一起写");
            return {
                data: {
                    kind: "views",
                    version: VIEWS_VERSION,
                    changes: VIEWS_CHANGES,
                    views: PUBLIC_VIEWS.map(({ name, summary, needs, columns }) => ({
                        name,
                        summary,
                        needs,
                        columns,
                    })),
                },
            };
        }

        if (words.length === 0) {
            return {
                data: {
                    kind: "commands",
                    version: ctx.version,
                    envelope: {
                        version: ENVELOPE_VERSION,
                        changes: ENVELOPE_CHANGES,
                        schema: ENVELOPE_SCHEMA,
                    },
                    commands: ctx.registry.commands.map(({ spec }) => ({
                        name: spec.name,
                        summary: spec.summary,
                        category: spec.category,
                        effect: spec.effect,
                        output: spec.output,
                    })),
                    groups: ctx.registry.groups.map(group => ({
                        name: group.name,
                        summary: group.summary,
                        commands: group.commands.map(command => command.spec.name),
                    })),
                    categories: Object.entries(COMMAND_CATEGORIES).map(([name, label]) => ({
                        name,
                        label,
                    })),
                    effects: Object.entries(EFFECT_LABELS).map(([level, description]) => ({
                        level,
                        description,
                    })),
                    globalOptions: GLOBAL_OPTION_ENTRIES.map(describeOption),
                    exitCodes: Array.from({ length: 8 }, (_, exitCode) => ({
                        exitCode,
                        meaning: EXIT_CODE_MEANINGS[exitCode],
                        errors: ERROR_CODES.filter(code => exitCodeOf(code) === exitCode),
                    })),
                    errors: ERROR_CODES.map(describeError),
                    warnings: Object.entries(WARNING_CODES).map(([code, description]) => ({
                        code,
                        description,
                    })),
                },
            };
        }

        const names = ctx.registry.commands.map(command => command.spec.name);
        const resolved = ctx.registry.resolve(words);
        if (resolved.kind === "group") {
            throw new CliError(
                "AMBIGUOUS_REF",
                `「${words.join(" ")}」是一组命令，请选一个子命令`,
                {
                    candidates: resolved.group.commands.map(command => ({
                        ref: command.spec.name,
                    })),
                }
            );
        }
        if (resolved.kind !== "command") throw commandNotFound(words, names);

        const { command } = resolved;
        const { spec } = command;
        return {
            data: {
                kind: "command",
                name: spec.name,
                summary: spec.summary,
                description: spec.description ?? null,
                category: spec.category,
                effect: spec.effect,
                output: spec.output,
                usage: commandUsage(command),
                positionals: (spec.positionals ?? []).map(describePositional),
                options: commandOptionEntries(command).map(describeOption),
                examples: (spec.examples ?? []).map(example => ({
                    command: `saltnet ${example.command}`,
                    description: example.description,
                })),
                errors: commandErrorCodes(spec).map(describeError),
                data: spec.dataSchema,
            },
        };
    }
);
