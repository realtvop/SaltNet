// generateBuildInfo.cjs
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const prettier = require("prettier");
const ts = require("typescript");

const codeExtensions = new Set([
    ".cjs",
    ".css",
    ".html",
    ".js",
    ".jsx",
    ".mjs",
    ".py",
    ".scss",
    ".sh",
    ".ts",
    ".tsx",
    ".vue",
]);
const emptyTreeHash = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const scriptExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);

function git(args, cwd) {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function isCodeFile(file) {
    return codeExtensions.has(path.extname(file).toLowerCase());
}

function readGitFile(cwd, revision, file) {
    const result = spawnSync("git", ["show", `${revision}:${file}`], {
        cwd,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
    });
    return result.status === 0 ? result.stdout : null;
}

function normalizeScript(source) {
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, source);
    const tokens = [];
    let token = scanner.scan();

    while (token !== ts.SyntaxKind.EndOfFileToken) {
        const value =
            token === ts.SyntaxKind.StringLiteral ||
            token === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
            token === ts.SyntaxKind.NumericLiteral ||
            token === ts.SyntaxKind.Identifier
                ? scanner.getTokenValue()
                : "";
        tokens.push([token, value]);
        token = scanner.scan();
    }

    return tokens
        .filter(([kind], index) => {
            if (kind !== ts.SyntaxKind.CommaToken) return true;
            const nextKind = tokens[index + 1]?.[0];
            return ![
                ts.SyntaxKind.CloseBraceToken,
                ts.SyntaxKind.CloseBracketToken,
                ts.SyntaxKind.CloseParenToken,
            ].includes(nextKind);
        })
        .map(([kind, value]) => `${kind}:${value}`)
        .join("|");
}

function removeLayoutWhitespace(source) {
    let result = "";
    let quote = null;
    let escaped = false;
    let pendingWhitespace = false;

    for (const character of source) {
        if (quote) {
            result += character;
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === quote) quote = null;
        } else if (character === '"' || character === "'" || character === "`") {
            if (pendingWhitespace && result) result += " ";
            pendingWhitespace = false;
            quote = character;
            result += character;
        } else if (/\s/.test(character)) {
            pendingWhitespace = true;
        } else {
            if (pendingWhitespace && result) result += " ";
            pendingWhitespace = false;
            result += character;
        }
    }

    return stripTrailingCommas(result);
}

function stripTrailingCommas(source) {
    let result = "";
    let quote = null;
    let escaped = false;

    for (let index = 0; index < source.length; index++) {
        const character = source[index];
        if (quote) {
            result += character;
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === quote) quote = null;
            continue;
        }
        if (character === '"' || character === "'" || character === "`") {
            quote = character;
            result += character;
            continue;
        }
        if (character === ",") {
            const nextNonWhitespace = source.slice(index + 1).match(/^\s*([}\])])/);
            if (nextNonWhitespace) continue;
        }
        result += character;
    }

    return result.trim();
}

async function normalizeCode(source, file, cwd) {
    if (scriptExtensions.has(path.extname(file).toLowerCase())) return normalizeScript(source);
    const config = (await prettier.resolveConfig(path.join(cwd, file))) ?? {};
    const formatted = await prettier.format(source, { ...config, filepath: file });
    return removeLayoutWhitespace(formatted);
}

async function hasSubstantiveCodeChange(cwd, parent, commit, normalizer = normalizeCode) {
    const files = git(["diff", "--name-only", "--diff-filter=ACDMRT", parent, commit], cwd)
        .split("\n")
        .filter(Boolean)
        .filter(isCodeFile);

    for (const file of files) {
        const before = readGitFile(cwd, parent, file);
        const after = readGitFile(cwd, commit, file);
        if (before === null || after === null) return true;
        if (before === after) continue;

        try {
            const [normalizedBefore, normalizedAfter] = await Promise.all([
                normalizer(before, file, cwd),
                normalizer(after, file, cwd),
            ]);
            if (normalizedBefore === normalizedAfter) continue;
        } catch {
            const stripWhitespace = value => value.replace(/\s+/g, "");
            if (stripWhitespace(before) === stripWhitespace(after)) continue;
        }

        return true;
    }

    return false;
}

async function findLatestCodeChangeTime(cwd = process.cwd(), normalizer = normalizeCode) {
    const commits = git(["log", "--format=%H%x09%ct"], cwd).split("\n").filter(Boolean);

    for (const entry of commits) {
        const [commit, timestamp] = entry.split("\t");
        const firstParent = git(["show", "-s", "--format=%P", commit], cwd).split(" ")[0];
        const parent = firstParent || emptyTreeHash;
        if (await hasSubstantiveCodeChange(cwd, parent, commit, normalizer)) {
            return Number(timestamp) * 1000;
        }
    }

    throw new Error("No commit with a substantive code change was found.");
}

async function generateBuildInfo(cwd = process.cwd()) {
    const assets = fs.readdirSync(path.join(cwd, "dist/assets"));
    const buildInfo = {
        buildTime: `${await findLatestCodeChangeTime(cwd)}`,
        assets,
    };
    fs.writeFileSync(path.join(cwd, "dist/latest.json"), JSON.stringify(buildInfo, null, 2));

    const indexPath = path.join(cwd, "dist/index.html");
    const data = fs.readFileSync(indexPath, "utf8");
    const updatedContent = data.replace("%buildTime%", buildInfo.buildTime);
    fs.writeFileSync(indexPath, updatedContent, "utf8");

    console.log("Version file generated.");
}

if (require.main === module) {
    generateBuildInfo().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = {
    findLatestCodeChangeTime,
    generateBuildInfo,
    hasSubstantiveCodeChange,
    isCodeFile,
};
