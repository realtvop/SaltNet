import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import legacy from "@vitejs/plugin-legacy";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        vue({
            template: {
                compilerOptions: {
                    // 所有以 s- 开头的标签名都是 sober 组件
                    isCustomElement: tag => tag.startsWith("s-"),
                },
            },
        }),
        legacy({
            targets: ["defaults", "not IE 11"],
            additionalLegacyPolyfills: ["regenerator-runtime/runtime"],
            modernPolyfills: true,
        }),
    ],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
});
