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
        include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
        testTimeout: 20000,
    },
});
