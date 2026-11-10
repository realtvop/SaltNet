import type { Registry } from "../../src/commands/registry";
import { buildRegistry, defineCommand } from "../../src/commands/registry";

/** A command that takes one of every kind of option and hands back what it was given. */
export const demo = defineCommand(
    {
        name: "demo",
        summary: "演示每种参数类型",
        description: "把收到的参数原样返回，用来测试解析器。\n第二段说明。",
        category: "catalog",
        effect: "none",
        output: "object",
        positionals: [
            { name: "text", valueName: "文本", description: "要处理的文本" },
            { name: "difficulty", description: "难度", optional: true },
        ],
        options: {
            limit: { kind: "integer", min: 1, max: 500, default: 50, description: "每页条数" },
            offset: { kind: "integer", min: 0, default: 0, description: "跳过的条数" },
            sort: {
                kind: "enum",
                values: ["default", "constant", { value: "achievements", aliases: ["ach"] }],
                default: "default",
                description: "排序方式",
            },
            rank: {
                kind: "enum",
                values: [
                    { value: "SSS+", aliases: ["sssp"] },
                    "SSS",
                    { value: "S+", aliases: ["sp"] },
                ],
                description: "评级",
            },
            diff: {
                kind: "list",
                item: {
                    kind: "enum",
                    values: [
                        { value: "MASTER", aliases: ["mas", "3"] },
                        { value: "Re:MASTER", aliases: ["rem", "4"] },
                    ],
                },
                description: "难度",
            },
            tags: { kind: "list", item: { kind: "string" }, description: "标签" },
            level: { kind: "range", item: "string", description: "等级" },
            constant: { kind: "range", item: "number", description: "定数" },
            ratio: { kind: "number", min: -10, max: 10, description: "一个数字" },
            asc: { kind: "boolean", description: "升序" },
            upload: { kind: "boolean", default: true, description: "上传结果" },
            qr: { kind: "credential", description: "二维码，从 stdin 读取" },
            name: { kind: "string", description: "名称" },
            version: { kind: "string", description: "版本名" },
            groupBy: { kind: "enum", values: ["constant", "version"], description: "分组" },
        },
        examples: [
            { command: "demo hello --limit 3", description: "取前三条" },
            { command: "demo 'two words' --diff mas,rem", description: "带空格的文本" },
        ],
    },
    args => ({ data: args })
);

export const needsTarget = defineCommand(
    {
        name: "needs",
        summary: "有必填选项的命令",
        category: "data",
        effect: "local",
        output: "object",
        options: {
            target: { kind: "string", required: true, description: "目标" },
        },
    },
    args => ({ data: args.options })
);

export const userList = defineCommand(
    {
        name: "user list",
        summary: "列出用户",
        category: "account",
        effect: "none",
        output: "list",
    },
    () => ({ data: { items: [] } })
);

export const userBind = defineCommand(
    {
        name: "user bind",
        summary: "绑定数据来源",
        category: "account",
        effect: "account",
        output: "object",
        positionals: [
            { name: "user", valueName: "用户", description: "用户序号、uid 或名称" },
            { name: "source", valueName: "来源", description: "数据来源" },
        ],
        options: {
            token: { kind: "credential", description: "Import-Token，从 stdin 读取" },
        },
    },
    args => ({ data: { positionals: args.positionals, options: args.options } })
);

export const favAdd = defineCommand(
    {
        name: "fav add",
        summary: "把曲目加入收藏夹",
        category: "data",
        effect: "local",
        output: "object",
        positionals: [
            { name: "folder", valueName: "收藏夹", description: "收藏夹名称" },
            { name: "songs", valueName: "曲目", description: "曲目引用", variadic: true },
        ],
    },
    args => ({ data: args.positionals })
);

export const COMMAND_GROUPS = { user: "管理用户", fav: "管理收藏夹" };

export function createTestRegistry(): Registry {
    return buildRegistry({
        commands: [demo, needsTarget, userList, userBind, favAdd],
        groups: COMMAND_GROUPS,
    });
}
