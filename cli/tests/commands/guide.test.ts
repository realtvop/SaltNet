import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PUBLIC_VIEWS } from "../../src/catalog/views";
import { createRegistry } from "../../src/commands";
import { commandUsage, positionalPlaceholder } from "../../src/commands/describe";
import { buildRegistry, defineCommand } from "../../src/commands/registry";
import { ERROR_CODES } from "../../src/errors";
import { escapeTableCell, renderGuide } from "../../src/guide/markdown";
import { WARNING_CODES } from "../../src/output/warning";
import { commandIn } from "../commandRun";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

describe("guide command", () => {
    it("prints deterministic Markdown with all generated sections", async () => {
        const first = await commandIn(makeHome(), "guide", []);
        const second = await commandIn(makeHome(), "guide", []);
        expect(first.code).toBe(0);
        expect(first.stdout.startsWith("# saltnet 使用指南\n")).toBe(true);
        expect(() => JSON.parse(first.stdout)).toThrow();
        expect(first.stdout).toContain("版本：`saltnet 9.9.9`");
        expect(second.stdout).toBe(first.stdout);

        const sections = [
            "## 先看这几条",
            "## 退出码",
            "## 命令",
            "## 全局选项",
            "## 错误码",
            "## 警告",
            "## 只读视图",
        ];
        let previous = -1;
        for (const section of sections) {
            const index = first.stdout.indexOf(section);
            expect(index, section).toBeGreaterThan(previous);
            previous = index;
        }
    });

    it("has a usage heading and executable example block for every command", async () => {
        const { stdout } = await commandIn(makeHome(), "guide", []);
        const registry = createRegistry();
        for (const command of registry.commands) {
            expect(stdout).toContain(`#### \`${commandUsage(command)}\``);
            expect(command.spec.examples?.length, command.spec.name).toBeGreaterThan(0);
            for (const example of command.spec.examples ?? []) {
                expect(stdout).toContain(`# ${example.description}\nsaltnet ${example.command}`);
            }
        }
        const fences = stdout.match(/```bash\n[\s\S]*?\n```/g) ?? [];
        expect(fences).toHaveLength(registry.commands.length);
    });

    it("prints exact exit rows, every error and warning, and every view", async () => {
        const { stdout } = await commandIn(makeHome(), "guide", []);
        expect(stdout).toContain(
            "| 2 | 用法错误 | `USAGE`、`SQL_ERROR`、`INVALID_BACKUP`、`FILE_EXISTS` | 命令写错了：看 `error.message` 和 `error.candidates` 改正后再运行 |"
        );
        expect(stdout).toContain(
            "| 6 | 需要确认 | `CONFIRMATION_REQUIRED` | 把预览原样给用户看，用户明确同意后再带上确认码重新运行；不能替用户确认 |"
        );
        for (const code of ERROR_CODES) expect(stdout).toContain(`| \`${code}\` |`);
        for (const code of Object.keys(WARNING_CODES)) {
            expect(stdout).toContain(`| \`${code}\` |`);
        }
        for (const view of PUBLIC_VIEWS) expect(stdout).toContain(`- \`${view.name}\`：`);
    });

    it("omits empty categories", async () => {
        const { stdout } = await commandIn(makeHome(), "guide", []);
        expect(stdout).not.toContain("### 成绩");
        expect(stdout).toContain("### 用户、同步、账号");
    });

    it("formats a made-up command and escapes Markdown table cells", () => {
        const sample = defineCommand(
            {
                name: "sample",
                summary: "示例命令",
                category: "data",
                effect: "local",
                output: "object",
                positionals: [{ name: "thing", valueName: "东西", description: "要处理的东西" }],
                options: {
                    count: {
                        kind: "integer",
                        min: 1,
                        max: 3,
                        default: 2,
                        description: "数量",
                    },
                },
                examples: [{ command: "sample x --count 2", description: "处理一个东西" }],
            },
            () => ({ data: {} })
        );
        const text = renderGuide(buildRegistry({ commands: [sample] }), "1.0.0");
        expect(text).toContain("#### `saltnet sample <东西> [选项]`");
        expect(text).toContain(
            `- \`${positionalPlaceholder(sample.spec.positionals![0])}\`：要处理的东西`
        );
        expect(text).toContain("- `--count <整数>`：数量（范围：1 到 3；默认：2）");
        expect(text).toContain("# 处理一个东西\nsaltnet sample x --count 2");
        expect(text).toContain("副作用：本地，只改本机的数据或文件");
        expect(escapeTableCell("左|右")).toBe("左\\|右");
    });

    it("works with broken config, creates no fresh home, and rejects tsv", async () => {
        const fresh = makeHome();
        const result = await commandIn(fresh, "guide", []);
        expect(result.code).toBe(0);
        expect(existsSync(fresh.home)).toBe(false);

        const broken = makeHome();
        mkdirSync(broken.home, { recursive: true });
        writeFileSync(broken.config, "{");
        const brokenResult = await commandIn(broken, "guide", []);
        expect(brokenResult.code).toBe(0);

        const tsv = await commandIn(makeHome(), "guide", ["--format", "tsv"]);
        expect(tsv.code).toBe(2);
        expect(tsv.json.error.code).toBe("USAGE");
    });
});
