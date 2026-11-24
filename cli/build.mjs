// Bundles the CLI and the parts of shared/core it uses into one file, cli/dist/saltnet.mjs by
// default, or the path passed to --outfile.
//
// Every invocation of the CLI is a new process, so startup cost matters: one file means one read
// and no module resolution at run time. The repository uses enums and the `@core/*` alias, which
// Node's own type stripping cannot run, so the bundle is also the only supported way to run it.
//
// Defaults for the backend, render service and LXNS client are read from the same `.env` files the
// web app is built from (see build-defaults.mjs) and compiled into the bundle. They can be
// overridden at run time (see src/runtime/config.ts). Their values are never printed.
import { chmodSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { readBuildDefaults } from "./build-defaults.mjs";

const cliDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(cliDir, "..");

const buildDefaults = readBuildDefaults(repoRoot, process.env);

const pkg = JSON.parse(readFileSync(path.join(cliDir, "package.json"), "utf8"));
const outfileIndex = process.argv.indexOf("--outfile");
if (outfileIndex !== -1 && process.argv[outfileIndex + 1] === undefined) {
    throw new Error("--outfile needs a path");
}
const outfile =
    outfileIndex === -1
        ? path.join(cliDir, "dist", "saltnet.mjs")
        : path.resolve(process.cwd(), process.argv[outfileIndex + 1]);
mkdirSync(path.dirname(outfile), { recursive: true });

// The search libraries are a large share of the startup cost, and most commands never search
// (design 1.2: pinyin-pro and wanakana are for building the search index, opencc for a query with
// Chinese characters). Their only importer, shared/core/music/search.ts, imports them at the top,
// which the web app wants as it is. In the bundle, each import gets a small module instead whose
// functions `require()` the real ES module on their first call; esbuild then wraps that module in a
// function it runs only at that first `require`, so a command that does not search never evaluates
// it. The real modules are the same ES builds an `import` resolves to, so nothing else changes.
const LAZY_NAMESPACE = "saltnet-lazy";
const LAZY_MODULES = new Map([
    ["pinyin-pro", "export function pinyin(...args) { return load().pinyin(...args); }"],
    ["wanakana", "export function toRomaji(...args) { return load().toRomaji(...args); }"],
    [
        "opencc-js/t2cn",
        // Called at module level by search.ts; the real converter is made on its first use.
        `export default {
            Converter(options) {
                let convert;
                return text => (convert ??= load().default.Converter(options))(text);
            },
        };`,
    ],
]);
const lazySearchLibraries = {
    name: "saltnet-lazy-search",
    setup(pluginBuild) {
        const filter = /^(?:pinyin-pro|wanakana|opencc-js\/t2cn)$/;
        pluginBuild.onResolve({ filter }, args => {
            // The real module, asked for by the stand-in below: resolved as an import would be.
            if (args.pluginData?.real === true) return undefined;
            if (args.namespace === LAZY_NAMESPACE) {
                return pluginBuild.resolve(args.path, {
                    kind: "import-statement",
                    resolveDir: args.resolveDir,
                    pluginData: { real: true },
                });
            }
            return { path: args.path, namespace: LAZY_NAMESPACE };
        });
        pluginBuild.onLoad({ filter: /.*/, namespace: LAZY_NAMESPACE }, args => ({
            contents: [
                "let real;",
                `const load = () => (real ??= require(${JSON.stringify(args.path)}));`,
                LAZY_MODULES.get(args.path),
            ].join("\n"),
            resolveDir: path.join(repoRoot, "shared", "core", "music"),
            loader: "js",
        }));
    },
};

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
    plugins: [lazySearchLibraries],
    legalComments: "none",
    logLevel: "warning",
});

chmodSync(outfile, 0o755);
process.stdout.write(`built ${path.relative(repoRoot, outfile)}\n`);
