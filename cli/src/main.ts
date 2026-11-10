import process from "node:process";
import { runCli } from "./cli";
import { createRegistry } from "./commands";
import { createProcessIo } from "./runtime/io";
import { VERSION } from "./version";

// Set the exit code instead of calling process.exit(): output piped to another process is
// flushed asynchronously, and exiting early would cut it off.
process.exitCode = await runCli(process.argv.slice(2), {
    io: createProcessIo(),
    registry: createRegistry(),
    version: VERSION,
});
