import antfu from "@antfu/eslint-config";

export default antfu({
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
    ignores: ["dist", "node_modules", "*.md", "public", "database"],
});
