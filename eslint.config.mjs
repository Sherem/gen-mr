import js from "@eslint/js";
import prettier from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

export default [
    js.configs.recommended,
    {
        files: ["**/*.js", "**/*.mjs"],
        ignores: ["node_modules/**", "dist/**", "build/**"],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: "module",
            globals: {
                console: "readonly",
                process: "readonly",
                Buffer: "readonly",
                __dirname: "readonly",
                __filename: "readonly",
                global: "readonly",
                module: "readonly",
                require: "readonly",
                exports: "readonly",
                fetch: "readonly", // Add fetch as a global for Node.js 18+
            },
        },
        plugins: {
            prettier,
        },
        rules: {
            ...prettierConfig.rules,
            "prettier/prettier": [
                "error",
                {
                    semi: true,
                    singleQuote: false,
                    trailingComma: "es5",
                    printWidth: 100,
                    tabWidth: 4,
                    useTabs: false,
                },
            ],
            "no-unused-vars": "warn",
            "no-console": "off",
        },
    },
];
