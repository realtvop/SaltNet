import process from "node:process";
import { VERSION } from "./version";

// Placeholder entry point: the command registry and parser replace it in the next steps.
function main(argv: readonly string[]): number {
    if (argv.includes("--version")) {
        process.stdout.write(`${VERSION}\n`);
        return 0;
    }
    process.stderr.write("saltnet: no commands are available yet\n");
    return 2;
}

process.exitCode = main(process.argv.slice(2));
