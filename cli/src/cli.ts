/**
 * Runs one command line from start to finish and returns the exit code. It never throws: every
 * failure becomes a failure envelope on stdout and an exit code (design 4.2, 4.6).
 */
import type { CommandDefinition, CommandSpec, RawCommandArgs, Registry } from "./commands/registry";
import type { ResolvedConfig } from "./runtime/config";
import type { Io } from "./runtime/io";
import type { Store } from "./store/store";
import { renderHelp } from "./commands/help";
import { parseArgv } from "./commands/parse";
import { CliError, usageError } from "./errors";
import { failureEnvelope, serializeEnvelope } from "./output/envelope";
import { chooseFormat } from "./output/format";
import { renderSuccess } from "./output/render";
import { loadConfig } from "./runtime/config";
import { createHttp } from "./runtime/http";
import { resolveRuntimePaths } from "./runtime/paths";
import { storeError } from "./store/errors";
import { openStore } from "./store/store";

export interface CliRuntime {
    readonly io: Io;
    readonly registry: Registry;
    readonly version: string;
}

function toCliError(error: unknown): CliError {
    if (error instanceof CliError) return error;
    // A busy or damaged database is something to tell the caller about, not an internal bug.
    const stored = storeError(error);
    if (stored) return stored;
    const detail = error instanceof Error ? error.message : String(error);
    return new CliError("INTERNAL", `内部错误：${detail}`, { cause: error });
}

/** Failures are always JSON, whatever `--format` says, so a caller has one thing to parse. */
function fail(io: Io, command: string | null, error: CliError, pretty: boolean): number {
    io.stdout.write(serializeEnvelope(failureEnvelope(command, error), pretty));
    return error.exitCode;
}

/**
 * A setting with a bad value stops the command before it does anything (design 2.1, plan 20). Each
 * problem's message already names the variable or `config.json` entry it is about.
 */
function configFailure(config: ResolvedConfig): CliError | undefined {
    const errors = config.problems.filter(problem => problem.severity === "error");
    if (errors.length === 0) return undefined;
    const lines = errors.map(problem => problem.message);
    return usageError(`配置有错误，命令没有运行：${lines.join("；")}`, {
        fix: "saltnet config list",
        extra: {
            problems: errors.map(({ source, key, message }) => ({ source, key, message })),
        },
    });
}

/** The `--fields` the command was given, if it has that option. */
function fieldsOf(args: RawCommandArgs): readonly string[] | undefined {
    const { fields } = args.options;
    return Array.isArray(fields) && fields.every(field => typeof field === "string")
        ? (fields as string[])
        : undefined;
}

function logTo(io: Io, args: RawCommandArgs): (message: string) => void {
    return message => {
        if (args.global.verbose || io.stderr.isTTY) io.stderr.write(`${message}\n`);
    };
}

async function run(
    runtime: CliRuntime,
    command: CommandDefinition,
    args: RawCommandArgs
): Promise<number> {
    const { io, registry, version } = runtime;
    const spec: CommandSpec = command.spec;
    let store: Store | undefined;
    try {
        const paths = resolveRuntimePaths({ env: io.env, cwd: io.cwd });
        const config = loadConfig(paths, { env: io.env, version });
        const broken = spec.allowBadConfig ? undefined : configFailure(config);
        if (broken) throw broken;

        const format = chooseFormat({
            command: spec.name,
            output: spec.output,
            requested: args.global.format,
            stdoutIsTTY: io.stdout.isTTY,
            configured: config.values.output.format,
        });
        const result = await command.run(args, {
            io,
            registry,
            version,
            paths,
            config,
            store: () => (store ??= openStore(paths, { now: () => io.now() })),
            http: ({ timeoutMs } = {}) =>
                createHttp({
                    fetch: io.fetch,
                    userAgent: config.values.network.userAgent,
                    timeoutMs: timeoutMs ?? config.values.network.timeoutMs,
                }),
            log: logTo(io, args),
        });

        const rendered = renderSuccess({
            command: spec.name,
            output: spec.output,
            result,
            format,
            pretty: args.global.pretty,
            fields: fieldsOf(args),
        });
        io.stdout.write(rendered.stdout);
        if (rendered.stderr !== "") io.stderr.write(rendered.stderr);
        return 0;
    } catch (error) {
        const cliError = toCliError(error);
        if (cliError.code === "INTERNAL" && (args.global.verbose || io.stderr.isTTY)) {
            io.stderr.write(
                `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
            );
        }
        return fail(io, spec.name, cliError, args.global.pretty);
    } finally {
        try {
            store?.close();
        } catch {
            // The command's own outcome matters more than a close that failed.
        }
    }
}

export async function runCli(argv: readonly string[], runtime: CliRuntime): Promise<number> {
    const { io, registry, version } = runtime;
    const outcome = parseArgv(registry, argv);

    switch (outcome.kind) {
        case "version":
            io.stdout.write(`${version}\n`);
            return 0;
        case "help":
            io.stdout.write(renderHelp(registry, outcome.target, version));
            return 0;
        case "error":
            return fail(
                io,
                outcome.command?.spec.name ?? null,
                outcome.error,
                outcome.global.pretty
            );
        case "run":
            return run(runtime, outcome.command, outcome.args);
    }
}
