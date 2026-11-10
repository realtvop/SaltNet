import type { CommandSpec } from "../commands/registry";
import { usageError } from "../errors";

export type OutputFormat = "json" | "tsv" | "text";

export interface FormatChoice {
    readonly command: string;
    readonly output: CommandSpec["output"];
    /** What `--format` asked for, if anything. */
    readonly requested: OutputFormat | undefined;
    readonly stdoutIsTTY: boolean;
    /** The `output.format` setting; it only matters in a terminal. */
    readonly configured: "json" | "text";
}

/**
 * The format to print in (design 4.2). An explicit `--format` always wins. Without one, a person
 * at a terminal gets their configured format and anything that reads stdout gets JSON, so a
 * program never sees a table because someone once changed a setting. `tsv` is for lists only, and
 * this is checked before the command runs so that nothing is done and then refused.
 */
export function chooseFormat(choice: FormatChoice): OutputFormat {
    const { requested } = choice;
    if (requested === "tsv" && choice.output !== "list") {
        throw usageError(
            `命令 ${choice.command} 的结果不是列表，不能用 --format tsv；可以用 json 或 text`
        );
    }
    if (requested) return requested;
    return choice.stdoutIsTTY ? choice.configured : "json";
}
