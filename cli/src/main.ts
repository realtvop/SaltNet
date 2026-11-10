import process from "node:process";
import { runCli } from "./cli";
import { createRegistry } from "./commands";
import { createProcessIo } from "./runtime/io";
import { VERSION } from "./version";

// A reader that quits early (`saltnet charts | head`) closes the pipe. That is not a failure of
// ours, so it must not end in an unhandled error and a stack trace.
process.stdout.on("error", error => {
    if ((error as NodeJS.ErrnoException).code === "EPIPE") process.exit(process.exitCode ?? 0);
    throw error;
});

// Set the exit code instead of calling process.exit(): output piped to another process is
// flushed asynchronously, and exiting early would cut it off.
process.exitCode = await runCli(process.argv.slice(2), {
    io: createProcessIo(),
    registry: createRegistry(),
    version: VERSION,
});
