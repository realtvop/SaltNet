import type { ProcessLike } from "../../src/runtime/io";
import { describe, expect, it } from "vitest";
import { createProcessIo } from "../../src/runtime/io";

function fakeProcess(options: {
    chunks?: (string | Uint8Array)[];
    stdinIsTTY?: boolean;
    stdoutIsTTY?: boolean;
}): { source: ProcessLike; stdout: string[]; stderr: string[] } {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const chunks = options.chunks ?? [];
    const source: ProcessLike = {
        stdout: { write: text => stdout.push(text), isTTY: options.stdoutIsTTY },
        stderr: { write: text => stderr.push(text) },
        stdin: Object.assign(
            (async function* () {
                for (const chunk of chunks) yield chunk;
            })(),
            { isTTY: options.stdinIsTTY }
        ),
        env: { A: "1" },
        cwd: () => "/somewhere",
    };
    return { source, stdout, stderr };
}

describe("process io", () => {
    it("passes the environment and working directory through", () => {
        const io = createProcessIo(fakeProcess({}).source);
        expect(io.env).toEqual({ A: "1" });
        expect(io.cwd).toBe("/somewhere");
        expect(io.now()).toBeInstanceOf(Date);
    });

    it("writes to the streams and reports whether they are terminals", () => {
        const { source, stdout, stderr } = fakeProcess({ stdoutIsTTY: true });
        const io = createProcessIo(source);
        io.stdout.write("out");
        io.stderr.write("err");
        expect(stdout).toEqual(["out"]);
        expect(stderr).toEqual(["err"]);
        expect(io.stdout.isTTY).toBe(true);
        expect(io.stderr.isTTY).toBe(false);
    });

    it("reads all of stdin", async () => {
        const io = createProcessIo(fakeProcess({ chunks: ["abc", "def\n"] }).source);
        expect(await io.readStdin()).toBe("abcdef\n");
    });

    it("decodes a multibyte character split across chunks", async () => {
        const bytes = new TextEncoder().encode("熊極");
        const io = createProcessIo(
            fakeProcess({ chunks: [bytes.slice(0, 4), bytes.slice(4)] }).source
        );
        expect(await io.readStdin()).toBe("熊極");
    });

    it("reads stdin once and gives the same text on a second call", async () => {
        const io = createProcessIo(fakeProcess({ chunks: ["once"] }).source);
        expect(await io.readStdin()).toBe("once");
        expect(await io.readStdin()).toBe("once");
    });

    it("refuses to wait on a terminal", async () => {
        const io = createProcessIo(fakeProcess({ stdinIsTTY: true }).source);
        await expect(io.readStdin()).rejects.toMatchObject({
            code: "USAGE",
            message: expect.stringContaining("stdin 是终端"),
        });
    });
});
