import process from "node:process";
import { usageError } from "../errors";

/** Where text goes. `isTTY` tells whether a person is looking at it. */
export interface OutputStream {
    write: (text: string) => void;
    readonly isTTY: boolean;
}

/**
 * Everything a command reaches the outside world through, so a test can run the whole CLI
 * in-process with its own streams, environment and clock.
 */
export interface Io {
    readonly stdout: OutputStream;
    readonly stderr: OutputStream;
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly cwd: string;
    /** The whole of stdin as text. It is only called when a command is given `-`. */
    readStdin: () => Promise<string>;
    now: () => Date;
}

/** The parts of the `process` object the real `Io` uses. */
export interface ProcessLike {
    readonly stdout: { write: (text: string) => unknown; isTTY?: boolean };
    readonly stderr: { write: (text: string) => unknown; isTTY?: boolean };
    readonly stdin: AsyncIterable<string | Uint8Array> & { isTTY?: boolean };
    readonly env: Readonly<Record<string, string | undefined>>;
    cwd: () => string;
}

async function readAll(stdin: ProcessLike["stdin"]): Promise<string> {
    // The CLI never asks questions. Waiting on a terminal that nobody is typing into would hang
    // an agent forever, so a secret has to come through a pipe or a redirect.
    if (stdin.isTTY) {
        throw usageError("要从 stdin 读取，但 stdin 是终端；请通过管道或重定向传入");
    }
    const decoder = new TextDecoder();
    let text = "";
    for await (const chunk of stdin) {
        text += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    }
    return text + decoder.decode();
}

export function createProcessIo(source: ProcessLike = process): Io {
    let stdin: Promise<string> | undefined;
    return {
        stdout: {
            write: text => void source.stdout.write(text),
            isTTY: source.stdout.isTTY === true,
        },
        stderr: {
            write: text => void source.stderr.write(text),
            isTTY: source.stderr.isTTY === true,
        },
        env: source.env,
        cwd: source.cwd(),
        // Read once: a second call gets the same text rather than an already drained stream.
        readStdin: () => (stdin ??= readAll(source.stdin)),
        now: () => new Date(),
    };
}
