import { renderGuide } from "../guide/markdown";
import { str } from "../output/schema";
import { defineCommand } from "./registry";

export const guide = defineCommand(
    {
        name: "guide",
        summary: "给 agent 的使用指南（Markdown）",
        description:
            "打印一份由手写规则和命令注册表共同生成的 Markdown 指南，包括命令、示例、退出码、错误码、警告和只读视图。",
        category: "data",
        effect: "none",
        output: "text",
        allowBadConfig: true,
        examples: [{ command: "guide", description: "完整的 agent 使用指南" }],
        dataSchema: str("完整的 Markdown 使用指南"),
    },
    (_args, ctx) => ({ data: renderGuide(ctx.registry, ctx.version) })
);
