import type { FormatChoice } from "../../src/output/format";
import { describe, expect, it } from "vitest";
import { CliError } from "../../src/errors";
import { chooseFormat } from "../../src/output/format";

function choice(rest: Partial<FormatChoice>): FormatChoice {
    return {
        command: "charts",
        output: "list",
        requested: undefined,
        stdoutIsTTY: false,
        configured: "json",
        ...rest,
    };
}

describe("chooseFormat", () => {
    it("uses what --format asks for", () => {
        for (const requested of ["json", "tsv", "text"] as const) {
            expect(chooseFormat(choice({ requested }))).toBe(requested);
            expect(chooseFormat(choice({ requested, stdoutIsTTY: true, configured: "text" }))).toBe(
                requested
            );
        }
    });

    it("gives JSON to anything that is not a terminal, whatever is configured", () => {
        expect(chooseFormat(choice({ configured: "text", stdoutIsTTY: false }))).toBe("json");
    });

    it("gives a person at a terminal the configured format", () => {
        expect(chooseFormat(choice({ configured: "text", stdoutIsTTY: true }))).toBe("text");
        expect(chooseFormat(choice({ configured: "json", stdoutIsTTY: true }))).toBe("json");
    });

    it("refuses tsv for a command whose result is not a list, before it runs", () => {
        for (const output of ["object", "text"] as const) {
            let caught: unknown;
            try {
                chooseFormat(choice({ command: "song", output, requested: "tsv" }));
            } catch (error) {
                caught = error;
            }
            expect(caught).toBeInstanceOf(CliError);
            expect((caught as CliError).code).toBe("USAGE");
            expect((caught as CliError).message).toContain("命令 song 的结果不是列表");
        }
    });

    it("still allows json and text for such commands", () => {
        expect(chooseFormat(choice({ output: "object", requested: "text" }))).toBe("text");
        expect(chooseFormat(choice({ output: "object", requested: "json" }))).toBe("json");
    });
});
