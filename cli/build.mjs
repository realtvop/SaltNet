// Bundles the CLI and the parts of shared/core it uses into one file, cli/dist/saltnet.mjs.
//
// Every invocation of the CLI is a new process, so startup cost matters: one file means one read
// and no module resolution at run time. The repository uses enums and the `@core/*` alias, which
// Node's own type stripping cannot run, so the bundle is also the only supported way to run it.
//
// Defaults for the backend, render service and LXNS client are read from the same `.env` files the
// web app is built from (see build-defaults.mjs) and compiled into the bundle. They can be
// overridden at run time (see src/runtime/config.ts). Their values are never printed.
import { chmodSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { readBuildDefaults } from "./build-defaults.mjs";

const cliDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(cliDir, "..");

const buildDefaults = readBuildDefaults(repoRoot, process.env);

const pkg = JSON.parse(readFileSync(path.join(cliDir, "package.json"), "utf8"));
const outfile = path.join(cliDir, "dist", "saltnet.mjs");

await build({
    entryPoints: [path.join(cliDir, "src", "main.ts")],
    outfile,
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    banner: { js: "#!/usr/bin/env node" },
    alias: { "@core": path.join(repoRoot, "shared", "core") },
    define: {
        __SALTNET_VERSION__: JSON.stringify(pkg.version),
        __SALTNET_BUILD_DEFAULTS__: JSON.stringify(buildDefaults),
    },
    legalComments: "none",
    logLevel: "warning",
});

chmodSync(outfile, 0o755);
process.stdout.write(`built ${path.relative(repoRoot, outfile)}\n`);
