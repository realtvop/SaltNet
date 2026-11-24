import { existsSync } from "node:fs";
import path from "node:path";
import { CliError } from "../errors";
import { joinCommandLine } from "../util/shell";
import { writeFileAtomic } from "./files";

export function fileExistsError(absolutePath: string, retryCommand: readonly string[]): CliError {
    const fixWords = retryCommand.includes("--overwrite")
        ? retryCommand
        : [...retryCommand, "--overwrite"];
    return new CliError("FILE_EXISTS", `文件已经存在：${absolutePath}`, {
        retryable: false,
        fix: joinCommandLine(fixWords),
    });
}

export interface OutputFileTarget {
    readonly path: string;
    readonly overwrite: boolean;
    readonly retryCommand: readonly string[];
}

/** Resolves `given` against the working directory; FILE_EXISTS unless `overwrite`. */
export function resolveOutputFile(
    ctx: { readonly io: { readonly cwd: string } },
    given: string,
    overwrite: boolean,
    retryCommand: readonly string[]
): OutputFileTarget {
    const absolutePath = path.resolve(ctx.io.cwd, given);
    if (existsSync(absolutePath) && !overwrite) {
        throw fileExistsError(absolutePath, retryCommand);
    }
    return {
        path: absolutePath,
        overwrite,
        retryCommand,
    };
}

/** Writes atomically with mode 0600; a missing directory is USAGE naming the command. */
export function writeOutputFile(
    target: OutputFileTarget | string,
    content: string | Uint8Array,
    commandName: string,
    options?: { overwrite?: boolean; retryCommand?: readonly string[] }
): void {
    const filePath = typeof target === "string" ? target : target.path;
    const overwrite = typeof target === "string" ? (options?.overwrite ?? true) : target.overwrite;
    const retryCommand = typeof target === "string" ? options?.retryCommand : target.retryCommand;

    try {
        writeFileAtomic(filePath, content, 0o600, { overwrite });
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EEXIST") {
            if (retryCommand) {
                throw fileExistsError(filePath, retryCommand);
            }
            throw new CliError("FILE_EXISTS", `文件已经存在：${filePath}`, {
                retryable: false,
            });
        }
        if (code === "ENOENT" || code === "ENOTDIR") {
            throw new CliError(
                "USAGE",
                `目录不存在：${path.dirname(filePath)}；${commandName} 不会创建目录`,
                { retryable: false, cause: error }
            );
        }
        throw error;
    }
}
