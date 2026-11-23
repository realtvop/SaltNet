/**
 * Reads a command the CLI printed (an error's or a warning's `fix`) the way the CLI reads the words
 * when someone runs it as printed, so a test can check the command, user and options it reaches.
 */
import { createRegistry } from "../src/commands";
import { parseArgv } from "../src/commands/parse";
import { splitCommandLine } from "../src/util/shell";

export interface PrintedCommand {
    /** The command's name, such as `user bind`. */
    readonly command: string;
    readonly positionals: Readonly<Record<string, unknown>>;
    readonly options: Readonly<Record<string, unknown>>;
}

/** Parses one printed `saltnet …` line, and throws when there is none or it would not run. */
export function parsePrintedCommand(line: string | undefined): PrintedCommand {
    if (line === undefined) throw new Error("no command was printed");
    const words = splitCommandLine(line);
    if (words[0] !== "saltnet") throw new Error(`not a saltnet command: ${line}`);
    const outcome = parseArgv(createRegistry(), words.slice(1));
    if (outcome.kind !== "run") {
        const reason = outcome.kind === "error" ? outcome.error.message : outcome.kind;
        throw new Error(`${line} does not run as printed: ${reason}`);
    }
    return {
        command: outcome.command.spec.name,
        positionals: outcome.args.positionals,
        options: outcome.args.options,
    };
}

/**
 * Every command of a fix that offers several (joined by ` 或 ` or `；`, each part possibly led by
 * some words), parsed as `parsePrintedCommand` does.
 */
export function printedCommands(fix: string | undefined): PrintedCommand[] {
    if (fix === undefined) throw new Error("no command was printed");
    return fix.split(/ 或 |；/).map(part => {
        const start = part.indexOf("saltnet ");
        if (start < 0) throw new Error(`no command in ${JSON.stringify(part)} of ${fix}`);
        return parsePrintedCommand(part.slice(start));
    });
}

/** The user a parsed command selects: the `user` positional or the `--user` option. */
export function selectedUser(command: PrintedCommand): unknown {
    return command.positionals.user ?? command.options.user;
}
