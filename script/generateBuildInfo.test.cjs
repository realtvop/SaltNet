const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { afterEach, test } = require("node:test");
const { findLatestCodeChangeTime } = require("./generateBuildInfo.cjs");

const temporaryDirectories = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

function git(cwd, args, env = {}) {
    return execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        env: { ...process.env, ...env },
    }).trim();
}

function commit(cwd, message, isoTime) {
    git(cwd, ["add", "."]);
    git(cwd, ["commit", "-m", message], {
        GIT_AUTHOR_DATE: isoTime,
        GIT_COMMITTER_DATE: isoTime,
    });
}

test("uses the latest substantive code commit and skips docs and formatting-only commits", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "saltnet-build-info-"));
    temporaryDirectories.push(cwd);
    git(cwd, ["init"]);
    git(cwd, ["config", "user.email", "test@example.com"]);
    git(cwd, ["config", "user.name", "Test"]);

    fs.writeFileSync(path.join(cwd, "app.ts"), "export const answer={value:1};\n");
    commit(cwd, "feat: add answer", "2026-01-01T00:00:00Z");

    fs.writeFileSync(path.join(cwd, "README.md"), "documentation only\n");
    commit(cwd, "docs: update readme", "2026-01-02T00:00:00Z");

    fs.writeFileSync(path.join(cwd, "app.ts"), "export const answer = {\n    value: 1,\n};\n");
    commit(cwd, "style: format code", "2026-01-03T00:00:00Z");

    assert.equal(await findLatestCodeChangeTime(cwd), Date.parse("2026-01-01T00:00:00Z"));

    fs.writeFileSync(path.join(cwd, "app.ts"), "export const answer = {\n    value: 2,\n};\n");
    commit(cwd, "fix: change answer", "2026-01-04T00:00:00Z");

    assert.equal(await findLatestCodeChangeTime(cwd), Date.parse("2026-01-04T00:00:00Z"));
});

test("recognizes semantic whitespace changes in stylesheet code", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "saltnet-build-info-css-"));
    temporaryDirectories.push(cwd);
    git(cwd, ["init"]);
    git(cwd, ["config", "user.email", "test@example.com"]);
    git(cwd, ["config", "user.name", "Test"]);

    fs.writeFileSync(path.join(cwd, "app.css"), ".parent .child { color: red; }\n");
    commit(cwd, "feat: add descendant selector", "2026-01-01T00:00:00Z");

    fs.writeFileSync(path.join(cwd, "app.css"), ".parent.child { color: red; }\n");
    commit(cwd, "fix: require both classes", "2026-01-02T00:00:00Z");

    assert.equal(await findLatestCodeChangeTime(cwd), Date.parse("2026-01-02T00:00:00Z"));
});
