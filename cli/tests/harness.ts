import type { Registry } from "../src/commands/registry";
import type { HttpFetch, Io } from "../src/runtime/io";
import process from "node:process";
import { vi } from "vitest";
import { runCli } from "../src/cli";
import { mockFetch } from "./mockHttp";

export interface HarnessOptions {
    stdin?: string;
    stdoutIsTTY?: boolean;
    stderrIsTTY?: boolean;
    /** Added to the environment the command sees; `SALTNET_HOME` is the test sandbox by default. */
    env?: Record<string, string | undefined>;
    /** The network the command sees. By default there is none: every request fails. */
    fetch?: HttpFetch;
    /** What the command's clock reads; a fixed instant by default. */
    now?: Date;
}

/** An in-process terminal: everything the CLI writes is collected instead of printed. */
export interface Harness {
    io: Io;
    stdout: () => string;
    stderr: () => string;
    readStdin: ReturnType<typeof vi.fn>;
    /** The network, as a spy: what it was asked for, and what it answered. */
    fetch: ReturnType<typeof vi.fn<HttpFetch>>;
}

export function createHarness(options: HarnessOptions = {}): Harness {
    const out: string[] = [];
    const err: string[] = [];
    const readStdin = vi.fn(async () => options.stdin ?? "");
    // A test that wants the network says so; one that reaches it by accident fails right here.
    const fetch = vi.fn<HttpFetch>(options.fetch ?? mockFetch());
    const io: Io = {
        stdout: { write: text => void out.push(text), isTTY: options.stdoutIsTTY ?? false },
        stderr: { write: text => void err.push(text), isTTY: options.stderrIsTTY ?? false },
        // The command sees only this environment, never the real one; `tests/setup.ts` has already
        // pointed the process's own SALTNET_HOME at a throwaway directory.
        env: { SALTNET_HOME: process.env.SALTNET_HOME, ...options.env },
        cwd: "/work",
        readStdin,
        now: () => options.now ?? new Date("2026-11-11T00:00:00Z"),
        fetch,
    };
    return { io, stdout: () => out.join(""), stderr: () => err.join(""), readStdin, fetch };
}

export async function run(
    registry: Registry,
    harness: Harness,
    ...argv: string[]
): Promise<number> {
    return runCli(argv, { io: harness.io, registry, version: "9.9.9" });
}
