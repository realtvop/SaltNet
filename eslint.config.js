import antfu from "@antfu/eslint-config";

// Packages and path styles that platform-neutral code (shared/core) must never import.
const frameworkOnlyModules = ["vue", "vue-router", "pinia", "mdui", "localforage"];

function coreImportRestrictions({ allowNodeBuiltins }) {
    return [
        "error",
        {
            paths: frameworkOnlyModules.map(name => ({
                name,
                message: "shared/core must not depend on the web framework or browser storage.",
            })),
            patterns: [
                {
                    group: frameworkOnlyModules.map(name => `${name}/*`),
                    message: "shared/core must not depend on the web framework or browser storage.",
                },
                {
                    group: ["@/*", "@core/*"],
                    message: "shared/core must use relative imports, not the web app aliases.",
                },
                {
                    group: ["**/src/**", "**/cli/**"],
                    message: "shared/core must not import from src/ or cli/.",
                },
                ...(allowNodeBuiltins
                    ? []
                    : [
                          {
                              group: ["node:*"],
                              message:
                                  "shared/core must run in browsers and Workers, not just Node.",
                          },
                      ]),
            ],
        },
    ];
}

// esquery regex literals cannot contain a bare slash, so a subpath import is matched as \u002f.
const frameworkImportSelector = `/^(${frameworkOnlyModules.join("|")})(\\u002f|$)/`;

// Prettier owns formatting in the newer packages; these ESLint stylistic rules would
// otherwise contradict its output (for example `} else {` versus `}\nelse {`).
const prettierOwnedFormattingRules = Object.fromEntries(
    [
        "antfu/consistent-list-newline",
        "antfu/if-newline",
        "style/arrow-parens",
        "style/brace-style",
        "style/comma-dangle",
        "style/indent",
        "style/indent-binary-ops",
        "style/member-delimiter-style",
        "style/multiline-ternary",
        "style/operator-linebreak",
        "style/quote-props",
    ].map(rule => [rule, "off"])
);

export default antfu(
    {
        vue: true,
        typescript: true,

        formatters: {
            css: true,
            html: true,
        },

        // 自定义规则
        rules: {
            // 允许 console.error 和 console.warn（用于生产环境调试）
            "no-console": ["warn", { allow: ["warn", "error"] }],

            // Vue 相关
            "vue/block-order": ["error", { order: ["script", "template", "style"] }],
            "vue/component-name-in-template-casing": ["error", "kebab-case"],
            "vue/multi-word-component-names": "off", // 允许单词组件名

            // TypeScript 相关
            "@typescript-eslint/no-explicit-any": "warn", // 警告但不报错
            "unused-imports/no-unused-vars": "warn",

            // 代码风格
            "style/indent": ["error", 4], // 4 空格缩进
            "style/quotes": ["error", "double"], // 双引号
            "style/semi": ["error", "always"], // 分号
        },

        // 忽略文件
        ignores: [
            "dist",
            "node_modules",
            "**/*.md",
            "public",
            ".claude",
            "eslint-suppressions.json",
            // 脚本生成的紧凑数据，格式不由 ESLint 管
            "shared/core/collection/additionalCollections.json",
        ],
    },
    {
        // shared/core 是网页端和 CLI 共用的纯领域核心：不能依赖 Vue、MDUI、localForage、DOM 或 src/
        name: "saltnet/shared-core-boundary",
        files: ["shared/core/**/*.{ts,tsx}"],
        rules: {
            ...prettierOwnedFormattingRules,
            "no-restricted-imports": coreImportRestrictions({ allowNodeBuiltins: false }),
            "no-restricted-syntax": [
                "error",
                {
                    selector: `ImportExpression[source.value=${frameworkImportSelector}]`,
                    message: "shared/core must not depend on the web framework or browser storage.",
                },
                {
                    selector: "MemberExpression[object.type='MetaProperty'][property.name='env']",
                    message:
                        "shared/core must not read import.meta.env; take configuration as arguments.",
                },
            ],
        },
    },
    {
        // 配置文件本身由 Prettier 格式化
        name: "saltnet/prettier-owned-config",
        files: ["eslint.config.js"],
        rules: prettierOwnedFormattingRules,
    },
    {
        // 曲目页的查询逻辑先在网页端成形，随后整体搬进 shared/core/query（那里本来就由 Prettier 管）
        name: "saltnet/prettier-owned-songs-query",
        files: ["src/components/data/chart/songsQuery*.ts"],
        rules: prettierOwnedFormattingRules,
    },
    {
        // 新包里的 JSON（tsconfig、package.json 等）同样由 Prettier 格式化，缩进是 4 空格
        name: "saltnet/prettier-owned-json",
        files: ["shared/core/**/*.json", "cli/**/*.json"],
        rules: {
            "antfu/consistent-list-newline": "off",
            "jsonc/indent": "off",
            "jsonc/key-spacing": "off",
            "jsonc/object-curly-spacing": "off",
            "jsonc/sort-keys": "off",
        },
    },
    {
        // 测试可以用 node 内置模块读固定数据
        name: "saltnet/shared-core-tests",
        files: ["shared/core/**/*.test.ts"],
        rules: {
            "no-restricted-imports": coreImportRestrictions({ allowNodeBuiltins: true }),
        },
    }
);
