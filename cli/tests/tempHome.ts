import type { RuntimePaths } from "../src/runtime/paths";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach } from "vitest";
import { resolveRuntimePaths } from "../src/runtime/paths";

/**
 * Call it in a `describe` block. The function it returns makes a data directory that does not
 * exist yet, inside a fresh directory under the system's temp directory; everything is removed
 * after each test, so a test never touches the real `~/.saltnet`.
 */
export function useTempHome(): () => RuntimePaths {
    const roots: string[] = [];

    afterEach(() => {
        for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
    });

    return () => {
        const root = mkdtempSync(path.join(tmpdir(), "saltnet-test-home-"));
        roots.push(root);
        return resolveRuntimePaths({ env: { SALTNET_HOME: path.join(root, "home") }, cwd: root });
    };
}
