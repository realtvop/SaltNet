/**
 * Runs one command line from start to finish and returns the exit code. It never throws: every
 * failure becomes a failure envelope on stdout and an exit code (design 4.2, 4.6).
 */
import type {
    CommandDefinition,
    GlobalOptions,
    RawCommandArgs,
    Registry,
} from "./commands/registry";
import type { Io } from "./runtime/io";
import { renderHelp } from "./commands/help";
import { parseArgv } from "./commands/parse";
import { CliError } from "./errors";
import { failureEnvelope, serializeEnvelope, successEnvelope } from "./output/envelope";

export interface CliRuntime {
    readonly io: Io;
    readonly registry: Registry;
    readonly version: string;
}

function toCliError(error: unknown): CliError {
    if (error instanceof CliError) return error;
    const detail = error instanceof Error ? error.message : String(error);
    return new CliError("INTERNAL", `内部错误：${detail}`, { cause: error });
}

function fail(io: Io, command: string | null, error: CliError, global: GlobalOptions): number {
    io.stdout.write(serializeEnvelope(failureEnvelope(command, error), global.pretty));
    return error.exitCode;
}

async function run(
    runtime: CliRuntime,
    command: CommandDefinition,
    args: RawCommandArgs
): Promise<number> {
    const { io, registry } = runtime;
    const name = command.spec.name;
    try {
        const result = await command.run(args, { io, registry });
        io.stdout.write(serializeEnvelope(successEnvelope(name, result), args.global.pretty));
        return 0;
    } catch (error) {
        const cliError = toCliError(error);
        if (cliError.code === "INTERNAL" && (args.global.verbose || io.stderr.isTTY)) {
            io.stderr.write(
                `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
            );
        }
        return fail(io, name, cliError, args.global);
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
            return fail(io, outcome.command?.spec.name ?? null, outcome.error, outcome.global);
        case "run":
            return run(runtime, outcome.command, outcome.args);
    }
}
