import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { afterAll } from "vitest";

// Tests must never read or write the real ~/.saltnet. Every test file gets its own throwaway home,
// and HOME points at the same sandbox, so even code that falls back to the user's home directory
// stays inside it.
const sandbox = mkdtempSync(path.join(tmpdir(), "saltnet-test-"));
process.env.SALTNET_HOME = path.join(sandbox, "saltnet-home");
process.env.HOME = path.join(sandbox, "user-home");
process.env.USERPROFILE = process.env.HOME;

afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
});
