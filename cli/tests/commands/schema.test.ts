import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { VIEWS_CHANGES } from "../../src/catalog/views";
import { createRegistry } from "../../src/commands";
import { requireConfirmation } from "../../src/commands/confirm";
import { ERROR_CODES } from "../../src/errors";
import { failureEnvelope, serializeEnvelope } from "../../src/output/envelope";
import { WARNING_CODES } from "../../src/output/warning";
import { caught } from "../caught";
import { commandIn } from "../commandRun";
import { expectConforms, schemaErrors } from "../dataSchema";
import { createHarness, run } from "../harness";
import { useTempHome } from "../tempHome";

const makeHome = useTempHome();

describe("schema command", () => {
    it("lists the registry, exit codes, errors, effects, and warnings", async () => {
        const { code, json } = await commandIn(makeHome(), "schema", []);
        expect(code).toBe(0);
        expect(json.data.kind).toBe("commands");
        expect(json.data.commands.map((command: { name: string }) => command.name)).toEqual([
            "search",
            "song",
            "chart",
            "charts",
            "b50",
            "rating",
            "history",
            "collection list",
            "collection show",
            "course list",
            "course show",
            "kaleidxscope",
            "user list",
            "user show",
            "user add",
            "user edit",
            "user remove",
            "user default",
            "export",
            "import",
            "refresh",
            "status",
            "config list",
            "config get",
            "config set",
            "config unset",
            "sql",
            "schema",
            "guide",
        ]);
        expect(json.data.groups).toEqual([
            {
                name: "collection",
                summary: "收藏品：列表和详情",
                commands: ["collection list", "collection show"],
            },
            {
                name: "course",
                summary: "段位：列表和详情",
                commands: ["course list", "course show"],
            },
            {
                name: "user",
                summary: "用户：查看和管理本地用户",
                commands: [
                    "user list",
                    "user show",
                    "user add",
                    "user edit",
                    "user remove",
                    "user default",
                ],
            },
            {
                name: "config",
                summary: "设置：查看和修改 config.json",
                commands: ["config list", "config get", "config set", "config unset"],
            },
        ]);
        expect(json.data.exitCodes).toEqual([
            { exitCode: 0, meaning: "成功，可能带警告", errors: [] },
            { exitCode: 1, meaning: "内部错误", errors: ["INTERNAL"] },
            {
                exitCode: 2,
                meaning: "用法错误",
                errors: ["USAGE", "SQL_ERROR", "INVALID_BACKUP", "FILE_EXISTS"],
            },
            {
                exitCode: 3,
                meaning: "找不到或有歧义",
                errors: ["NOT_FOUND", "AMBIGUOUS_REF"],
            },
            {
                exitCode: 4,
                meaning: "需要人来处理",
                errors: [
                    "NO_USER",
                    "NOT_BOUND",
                    "QR_REQUIRED",
                    "QR_INVALID",
                    "LXNS_REAUTH_REQUIRED",
                ],
            },
            {
                exitCode: 5,
                meaning: "网络或上游出错",
                errors: ["NETWORK", "UPSTREAM_ERROR", "OFFLINE_NO_CACHE"],
            },
            { exitCode: 6, meaning: "需要确认", errors: ["CONFIRMATION_REQUIRED"] },
            {
                exitCode: 7,
                meaning: "资源被占用",
                errors: ["SYNC_IN_PROGRESS", "DB_LOCKED"],
            },
        ]);
        expect(json.data.effects).toEqual([
            { level: "none", description: "无，只读" },
            { level: "local", description: "本地，只改本机的数据或文件" },
            { level: "remote", description: "远端，会写入第三方服务" },
            { level: "account", description: "账号，会登录或改动舞萌账号" },
        ]);
        expect(json.data.errors.map((error: { code: string }) => error.code)).toEqual(ERROR_CODES);
        expect(json.data.errors).toHaveLength(18);
        expect(
            json.data.errors.filter((error: { retryable: boolean }) => error.retryable)
        ).toMatchObject([{ code: "NETWORK" }, { code: "SYNC_IN_PROGRESS" }, { code: "DB_LOCKED" }]);
        expect(json.data.warnings.map((warning: { code: string }) => warning.code)).toEqual(
            Object.keys(WARNING_CODES)
        );
        expect(json.data.globalOptions.map((option: { flag: string }) => option.flag)).toEqual([
            "--pretty",
            "--format",
            "--verbose",
            "--offline",
        ]);
    });

    it("publishes an envelope schema that accepts real results and rejects malformed ones", async () => {
        const root = await commandIn(makeHome(), "schema", []);
        const envelopeSchema = root.json.data.envelope.schema;
        const errorProperties = envelopeSchema.anyOf[1].properties.error.properties;
        expect(errorProperties.preview.description).toContain("仅 CONFIRMATION_REQUIRED");
        expect(errorProperties.confirmationCode.description).toContain("仅 CONFIRMATION_REQUIRED");
        expect(errorProperties.codeRejected.description).toContain("仅 CONFIRMATION_REQUIRED");
        const success = await commandIn(makeHome(), "status", []);

        const projectedHome = makeHome();
        const seeded = await commandIn(projectedHome, "refresh", []);
        expect(seeded.code).toBe(0);
        const projected = await commandIn(projectedHome, "charts", [
            "--level",
            "13+",
            "--diff",
            "mas",
            "--fields",
            "chartKey,title",
        ]);
        expect(projected.code).toBe(0);

        const unknownOption = await commandIn(makeHome(), "charts", ["--levl", "13"]);
        const missingCommand = await commandIn(makeHome(), "schema", ["nosuch"]);
        const unknownCommand = await commandIn(makeHome(), "nosuch", []);

        const brokenHome = makeHome();
        mkdirSync(brokenHome.home, { recursive: true });
        writeFileSync(brokenHome.config, "{");
        const brokenConfig = await commandIn(brokenHome, "search", ["x"]);

        expectConforms(envelopeSchema, success.json);
        expectConforms(envelopeSchema, projected.json);
        expectConforms(envelopeSchema, unknownOption.json);
        expectConforms(envelopeSchema, missingCommand.json);
        expectConforms(envelopeSchema, brokenConfig.json);
        expectConforms(envelopeSchema, unknownCommand.json);
        const confirmation = JSON.parse(
            serializeEnvelope(
                failureEnvelope(
                    "demo remove",
                    caught(() =>
                        requireConfirmation(undefined, {
                            operation: "demo.remove",
                            target: "entry:a",
                            state: { revision: 1 },
                            preview: { name: "a", entries: ["a", "b"] },
                            summary: "将删除 a",
                            confirmArgs: ["demo", "remove", "a"],
                        })
                    )
                ),
                false
            )
        );
        expectConforms(envelopeSchema, confirmation);
        expect(unknownCommand.json.command).toBeNull();
        expect(unknownOption.json.error.candidates).toBeDefined();
        expect((brokenConfig.json.error as { problems?: unknown }).problems).toBeDefined();

        const invalid = [
            { v: 1, command: "x", data: null, meta: {}, warnings: [] },
            { v: 1, ok: "yes", command: "x", data: null, meta: {}, warnings: [] },
            { v: 2, ok: true, command: "x", data: null, meta: {}, warnings: [] },
            { v: 1, ok: false, command: "x", error: { message: "x", retryable: false } },
            {
                v: 1,
                ok: false,
                command: "x",
                error: { code: "NOPE", message: "x", retryable: false },
            },
            {
                v: 1,
                ok: true,
                command: "x",
                data: null,
                meta: {},
                warnings: [{ code: "NOPE", message: "x" }],
            },
        ];
        for (const value of invalid) expect(schemaErrors(envelopeSchema, value)).not.toEqual([]);
        for (const wrong of [
            { confirmationCode: 1 },
            { codeRejected: "yes" },
            { preview: ["a"] },
        ]) {
            const value = { ...confirmation, error: { ...confirmation.error, ...wrong } };
            expect(schemaErrors(envelopeSchema, value)).not.toEqual([]);
        }
    });

    it("does not leak build defaults through schema or guide output", async () => {
        const defaults = {
            apiUrl: "https://sentinel-backend.invalid",
            apiFallbackUrl: "https://sentinel-fallback.invalid",
            renderUrl: "https://sentinel-render.invalid",
            lxnsClientId: "sentinel-client-id",
            lxnsRedirectUri: "https://sentinel-redirect.invalid/callback",
        };
        vi.stubGlobal("__SALTNET_BUILD_DEFAULTS__", defaults);

        try {
            const home = makeHome();
            const registry = createRegistry();
            const invoke = async (...argv: string[]) => {
                const harness = createHarness({ env: { SALTNET_HOME: home.home } });
                const code = await run(registry, harness, ...argv);
                expect(code, argv.join(" ")).toBe(0);
                return { stdout: harness.stdout(), stderr: harness.stderr() };
            };

            const config = await invoke("config", "get", "api.url");
            expect(config.stdout).toContain(defaults.apiUrl);
            expect(JSON.parse(config.stdout).data).toMatchObject({
                value: defaults.apiUrl,
                source: "build",
            });

            const outputs = [
                await invoke("schema"),
                ...(await Promise.all(
                    registry.commands.map(command =>
                        invoke("schema", ...command.spec.name.split(" "))
                    )
                )),
                await invoke("schema", "--views"),
                await invoke("guide"),
            ];
            for (const [index, output] of outputs.entries()) {
                for (const sentinel of Object.values(defaults)) {
                    expect(`${output.stdout}\n${output.stderr}`, `output ${index}`).not.toContain(
                        sentinel
                    );
                }
            }
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("describes representative commands and publishes their exact data schemas", async () => {
        const registry = createRegistry();
        for (const words of [["charts"], ["sql"], ["config", "set"], ["guide"], ["schema"]]) {
            const name = words.join(" ");
            const { code, json } = await commandIn(makeHome(), "schema", words);
            expect(code, name).toBe(0);
            expect(json.data.kind).toBe("command");
            expect(json.data.name).toBe(name);
            expect(json.data.data).toEqual(registry.find(name)!.spec.dataSchema);
        }

        const charts = await commandIn(makeHome(), "schema", ["charts"]);
        expect(charts.json.data.usage).toBe("saltnet charts [选项]");
        expect(charts.json.data.effect).toBe("none");
        expect(charts.json.data.output).toBe("list");
        expect(charts.json.data.options.map((option: { flag: string }) => option.flag)).toEqual([
            "--level",
            "--constant",
            "--diff",
            "--version",
            "--search",
            "--gate",
            "--course",
            "--plate",
            "--collection",
            "--achieved",
            "--missing",
            "--recent",
            "--stats",
            "--sort",
            "--asc",
            "--desc",
            "--group-by",
            "--user",
            "--limit",
            "--offset",
            "--fields",
        ]);
        expect(charts.json.data.examples[0]).toEqual({
            command: "saltnet charts --level 13+ --diff mas",
            description: "13+ 的紫谱",
        });
        expect(charts.json.data.errors.map((error: { code: string }) => error.code)).toEqual([
            "INTERNAL",
            "USAGE",
            "NOT_FOUND",
            "AMBIGUOUS_REF",
            "NO_USER",
            "NETWORK",
            "UPSTREAM_ERROR",
            "OFFLINE_NO_CACHE",
            "SYNC_IN_PROGRESS",
            "DB_LOCKED",
        ]);

        const sql = await commandIn(makeHome(), "schema", ["sql"]);
        expect(sql.json.data.usage).toBe("saltnet sql <查询...> [选项]");
        expect(sql.json.data.positionals).toEqual([
            {
                name: "query",
                valueName: "查询",
                description: "一条 SELECT；多个词会用空格连起来，所以整条加不加引号都行",
                required: true,
                variadic: true,
            },
        ]);

        const configSet = await commandIn(makeHome(), "schema", ["config", "set"]);
        expect(configSet.json.data.effect).toBe("local");
        const guide = await commandIn(makeHome(), "schema", ["guide"]);
        expect(guide.json.data).toMatchObject({ output: "text", options: [], positionals: [] });
    });

    it("reports group ambiguity, typos, extra words, and --views conflicts", async () => {
        const group = await commandIn(makeHome(), "schema", ["config"]);
        expect(group.code).toBe(3);
        expect(group.json.error).toMatchObject({
            code: "AMBIGUOUS_REF",
            candidates: [
                { ref: "config list" },
                { ref: "config get" },
                { ref: "config set" },
                { ref: "config unset" },
            ],
        });

        const typo = await commandIn(makeHome(), "schema", ["chrat"]);
        expect(typo.code).toBe(3);
        expect(typo.json.error.code).toBe("NOT_FOUND");
        expect(typo.json.error.candidates![0]).toEqual({ ref: "chart" });

        const subTypo = await commandIn(makeHome(), "schema", ["collection", "lst"]);
        expect(subTypo.json.error.code).toBe("NOT_FOUND");
        expect(subTypo.json.error.candidates![0]).toEqual({ ref: "collection list" });

        const three = await commandIn(makeHome(), "schema", ["a", "b", "c"]);
        expect(three.json.error.code).toBe("NOT_FOUND");

        const conflict = await commandIn(makeHome(), "schema", ["charts", "--views"]);
        expect(conflict.code).toBe(2);
        expect(conflict.json.error.code).toBe("USAGE");
    });

    it("lists versioned views without their SELECT text", async () => {
        expect(VIEWS_CHANGES.at(-1)?.version).toBe(2);
        const { code, json } = await commandIn(makeHome(), "schema", ["--views"]);
        expect(code).toBe(0);
        expect(json.data).toMatchObject({ kind: "views", version: 2, changes: VIEWS_CHANGES });
        expect(
            json.data.views.map(
                (view: { name: string; columns: unknown[]; needs: string[]; select?: string }) => ({
                    name: view.name,
                    columns: view.columns.length,
                    needs: view.needs,
                    select: view.select,
                })
            )
        ).toEqual([
            { name: "v_charts", columns: 36, needs: ["catalog"], select: undefined },
            { name: "v_scores", columns: 18, needs: [], select: undefined },
            { name: "v_score_events", columns: 16, needs: [], select: undefined },
            { name: "v_rating_history", columns: 4, needs: [], select: undefined },
            { name: "v_collections", columns: 8, needs: ["collections"], select: undefined },
            {
                name: "v_collection_targets",
                columns: 10,
                needs: ["collections"],
                select: undefined,
            },
            { name: "v_user_items", columns: 7, needs: [], select: undefined },
            { name: "v_user_characters", columns: 10, needs: [], select: undefined },
            { name: "v_course_tracks", columns: 16, needs: [], select: undefined },
        ]);
        for (const view of json.data.views) {
            for (const column of view.columns) {
                expect(column.name).not.toBe("");
                expect(["TEXT", "INTEGER", "REAL"]).toContain(column.type);
                expect(column.description).not.toBe("");
            }
        }
    });

    it("ignores broken config and does not create a fresh data directory", async () => {
        for (const args of [[], ["--views"]]) {
            const fresh = makeHome();
            const freshResult = await commandIn(fresh, "schema", args);
            expect(freshResult.code).toBe(0);
            expect(existsSync(fresh.home)).toBe(false);

            const broken = makeHome();
            mkdirSync(broken.home, { recursive: true });
            writeFileSync(broken.config, "not json");
            const brokenResult = await commandIn(broken, "schema", args);
            expect(brokenResult.code).toBe(0);
        }
    });
});
