import type { ConfigDefinition, ConfigProblem } from "../runtime/config";
import type { SettingRow } from "../runtime/configRows";
import type { CommandContext } from "./registry";
import { settingRowSchema } from "../catalog/schemas";
import { usageError } from "../errors";
import { paginate } from "../output/paging";
import { bool, extend, list, object, str, strEnumOf } from "../output/schema";
import { resolveSetting } from "../refs/setting";
import { loadConfig, parseConfigText } from "../runtime/config";
import { setConfigEntry, unsetConfigEntry } from "../runtime/configFile";
import { settingRow, settingRows } from "../runtime/configRows";
import { listOptions } from "./listOptions";
import { defineCommand } from "./registry";

const KEY_POSITIONAL = {
    name: "key",
    valueName: "设置",
    description:
        "设置的完整名字，点号连接，不分大小写，例如 metadata.maxAgeHours；config list 列出全部",
} as const;

/** The settings again, after `config.json` has been changed. */
function reload(ctx: CommandContext) {
    return loadConfig(ctx.paths, { env: ctx.io.env, version: ctx.version });
}

function resultOf(changed: boolean, definition: ConfigDefinition, ctx: CommandContext) {
    return { data: { changed, ...settingRow(definition, reload(ctx), ctx.version) } };
}

export const configList = defineCommand(
    {
        name: "config list",
        summary: "列出全部设置、现在的值和值从哪来",
        description:
            "列出 saltnet 的全部设置，一行一个，顺序固定。每行有 key（点号连接的名字）、value（现在生效的值）、source（值从哪来：env 环境变量，file 数据目录里的 config.json，build 构建时从网页端的 .env 带进来的，default 内置的默认值；优先级就是这个顺序）、default（没有环境变量和 config.json 时的值）、env（可以覆盖它的环境变量名，是 SALTNET_ 加上 key 的大写下划线写法）、type（接受什么样的值）和 description。data.file 是 config.json 的路径，data.problems 是读配置时发现的问题：severity 为 error 的是命令不能运行的原因（那一项已退回下一层的值，改正或用 config unset 去掉就好了），为 warning 的只是提醒，例如 config.json 里有不认识的设置。有 error 时别的命令会报 USAGE 而不运行，config 命令不受影响，所以可以用它修。修改用 config set 和 config unset。",
        category: "data",
        effect: "none",
        output: "list",
        allowBadConfig: true,
        options: { ...listOptions() },
        examples: [
            { command: "config list", description: "全部设置" },
            {
                command: "config list --fields key,value,source --format tsv",
                description: "只看名字、值和来源，输出成表格",
            },
        ],
        errors: ["USAGE"],
        dataSchema: object(
            {
                file: str("config.json 配置文件路径"),
                items: list(settingRowSchema, "全部设置项列表"),
                problems: list(
                    object<ConfigProblem>(
                        {
                            severity: strEnumOf<ConfigProblem["severity"]>(
                                { error: "应当停下来", warning: "只是提醒" },
                                "问题有多严重"
                            ),
                            source: strEnumOf<ConfigProblem["source"]>(
                                { env: "环境变量", file: "config.json" },
                                "问题出在哪里"
                            ),
                            key: str("出问题的设置的名称；整个文件有问题时是空字符串"),
                            message: str("问题是什么"),
                        },
                        { description: "读取设置时发现的一个问题" }
                    ),
                    "读取设置时发现的问题；没有问题时是空数组"
                ),
            },
            { description: "设置项列表与配置文件状态" }
        ),
    },
    (args, ctx) => {
        const { items, page } = paginate(settingRows(ctx.config, ctx.version), args.options);
        return {
            data: {
                file: ctx.paths.config,
                items,
                problems: ctx.config.problems.map(({ severity, source, key, message }) => ({
                    severity,
                    source,
                    key,
                    message,
                })),
            },
            meta: { page },
        };
    }
);

export const configGet = defineCommand(
    {
        name: "config get",
        summary: "一项设置现在的值和值从哪来",
        description:
            "按完整的名字（不分大小写）查一项设置，结果就是 config list 里的那一行：key、value、source、default、env、type、description。名字写错是 NOT_FOUND，candidates 里是最接近的几个。",
        category: "data",
        effect: "none",
        output: "object",
        allowBadConfig: true,
        positionals: [KEY_POSITIONAL],
        examples: [
            {
                command: "config get metadata.maxAgeHours",
                description: "曲库和收藏品多少小时后过期",
            },
        ],
        errors: ["USAGE", "NOT_FOUND"],
        dataSchema: settingRowSchema,
    },
    (args, ctx) => {
        const definition = resolveSetting(args.positionals.key);
        return { data: settingRow(definition, ctx.config, ctx.version) };
    }
);

export const configSet = defineCommand(
    {
        name: "config set",
        summary: "把一项设置写进 config.json",
        description:
            '检查值是否合法（类型和范围见 config list 的 type），合法才写进数据目录里的 config.json，没有这个文件就新建；文件里别的内容原样保留。可以留空的设置（例如 api.fallbackUrl）用 "" 写空值。结果是这项设置现在的样子（和 config get 一样），再加 changed：文件里原来就是这个值时是 false，没有写文件。环境变量的优先级比 config.json 高，所以结果里 source 是 env 时，生效的还是环境变量的值（env 字段是它的名字）。config.json 不是合法的 JSON 时不会改它，要先修好或删掉。',
        category: "data",
        effect: "local",
        output: "object",
        allowBadConfig: true,
        positionals: [
            KEY_POSITIONAL,
            {
                name: "value",
                valueName: "值",
                description: "新的值；是不是合法看这项设置的 type，数字直接写，文字不用加引号",
            },
        ],
        examples: [
            {
                command: "config set metadata.maxAgeHours 12",
                description: "曲库和收藏品 12 小时就算过期",
            },
            {
                command: "config set output.format text",
                description: "在终端里直接运行时默认输出给人看的文字",
            },
        ],
        errors: ["USAGE", "NOT_FOUND"],
        dataSchema: extend<SettingRow & { readonly changed: boolean }, SettingRow>(
            settingRowSchema,
            {
                changed: bool("有没有改 config.json；文件里原来就是这个值时是 false，没有写文件"),
            },
            { description: "这项设置现在的样子（和 config get 一样），再加 changed" }
        ),
    },
    (args, ctx) => {
        const definition = resolveSetting(args.positionals.key);
        const parsed = parseConfigText(definition, args.positionals.value);
        if (!parsed.ok) throw usageError(`设置 ${definition.key} ${parsed.reason}`);
        const { changed } = setConfigEntry(ctx.paths, definition.key, parsed.value);
        return resultOf(changed, definition, ctx);
    }
);

export const configUnset = defineCommand(
    {
        name: "config unset",
        summary: "去掉 config.json 里的一项设置，让它回到默认值",
        description:
            "从数据目录的 config.json 里删掉这一项，该项所在的组空了也一并删掉；文件里别的内容原样保留。没有这个文件或这一项时什么也不改，changed 是 false。结果是这项设置现在的样子（和 config get 一样）再加 changed；环境变量里设了的话，值还是环境变量的。config.json 不是合法的 JSON 时不会改它，要先修好或删掉。",
        category: "data",
        effect: "local",
        output: "object",
        allowBadConfig: true,
        positionals: [KEY_POSITIONAL],
        examples: [
            {
                command: "config unset metadata.maxAgeHours",
                description: "曲库和收藏品的过期时间回到默认的 24 小时",
            },
        ],
        errors: ["USAGE", "NOT_FOUND"],
        dataSchema: extend<SettingRow & { readonly changed: boolean }, SettingRow>(
            settingRowSchema,
            {
                changed: bool("有没有改 config.json；没有这个文件或这一项时是 false，什么也没改"),
            },
            { description: "这项设置现在的样子（和 config get 一样），再加 changed" }
        ),
    },
    (args, ctx) => {
        const definition = resolveSetting(args.positionals.key);
        const { changed } = unsetConfigEntry(ctx.paths, definition.key);
        return resultOf(changed, definition, ctx);
    }
);
