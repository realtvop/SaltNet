import { CliError } from "./errors";
import { storeError } from "./store/errors";

/**
 * Any error as the `CliError` that reports it. A failure the CLI already knows about stays as it
 * is, a busy or damaged database is explained, and the rest is an internal error (a bug).
 */
export function toCliError(error: unknown): CliError {
    if (error instanceof CliError) return error;
    const stored = storeError(error);
    if (stored) return stored;
    const detail = error instanceof Error ? error.message : String(error);
    return new CliError("INTERNAL", `内部错误：${detail}`, { cause: error });
}
