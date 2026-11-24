import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@core": fileURLToPath(new URL("../shared/core", import.meta.url)),
        },
    },
    test: {
        environment: "node",
        setupFiles: ["tests/setup.ts"],
        include: ["e2e/**/*.test.ts"],
        hookTimeout: 180000,
        testTimeout: 180000,
    },
});
