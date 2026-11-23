import { renderGuide, renderSkill } from "../guide/markdown";
import { str } from "../output/schema";
import { defineCommand } from "./registry";

export const guide = defineCommand(
    {
        name: "guide",
        summary: "给 agent 的使用指南（Markdown）",
        description:
            "打印一份由手写规则和命令注册表共同生成的 Markdown 指南，包括规则、常见问题、术语、命令、示例、退出码、错误码、警告和只读视图。加 --skill 时在前面加上 Claude Code skill 的 frontmatter，保存成 ~/.claude/skills/saltnet/SKILL.md 就能用。只打印，不写文件。",
        category: "data",
        effect: "none",
        output: "text",
        allowBadConfig: true,
        options: {
            skill: {
                kind: "boolean",
                description:
                    "输出成 Claude Code skill：指南前面加上 name 和 description 的 frontmatter",
            },
        },
        examples: [
            { command: "guide", description: "完整的 agent 使用指南" },
            { command: "guide --skill", description: "同一份指南，作为 Claude Code skill 输出" },
        ],
        dataSchema: str("完整的 Markdown 使用指南；加 --skill 时以 skill 的 frontmatter 开头"),
    },
    (args, ctx) => ({
        data: args.options.skill
            ? renderSkill(ctx.registry, ctx.version)
            : renderGuide(ctx.registry, ctx.version),
    })
);
