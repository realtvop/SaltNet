import { existsSync } from "node:fs";
import path from "node:path";
import { CliError } from "../errors";
import { joinCommandLine } from "../util/shell";
import { writeFileAtomic } from "./files";

/** Resolves `given` against the working directory; FILE_EXISTS unless `overwrite`. */
export function resolveOutputFile(
    ctx: { readonly io: { readonly cwd: string } },
    given: string,
    overwrite: boolean,
    retryCommand: readonly string[]
): string {
    const absolutePath = path.resolve(ctx.io.cwd, given);
    if (existsSync(absolutePath) && !overwrite) {
        const fixWords = retryCommand.includes("--overwrite")
            ? retryCommand
            : [...retryCommand, "--overwrite"];
        throw new CliError("FILE_EXISTS", `文件已经存在：${absolutePath}`, {
            retryable: false,
            fix: joinCommandLine(fixWords),
        });
    }
    return absolutePath;
}

/** Writes atomically with mode 0600; a missing directory is USAGE naming the command. */
export function writeOutputFile(
    absolutePath: string,
    content: string | Uint8Array,
    commandName: string
): void {
    try {
        writeFileAtomic(absolutePath, content, 0o600);
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") {
            throw new CliError(
                "USAGE",
                `目录不存在：${path.dirname(absolutePath)}；${commandName} 不会创建目录`,
                { retryable: false, cause: error }
            );
        }
        throw error;
    }
}
