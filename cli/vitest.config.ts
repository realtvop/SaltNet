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
        // Gives every test file its own throwaway SALTNET_HOME and HOME.
        setupFiles: ["tests/setup.ts"],
        include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
        testTimeout: 20000,
    },
});
