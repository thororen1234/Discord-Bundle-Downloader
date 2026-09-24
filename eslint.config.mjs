import stylistic from "@stylistic/eslint-plugin";
import { defineConfig } from "eslint/config";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

export default defineConfig(
    { ignores: [".next", "node_modules", "builds", "next-env.d.ts"] },
    {
        files: ["**/*.{ts,tsx,mjs}"],
        plugins: {
            "@typescript-eslint": tseslint.plugin,
            "@stylistic": stylistic,
            "simple-import-sort": simpleImportSort,
            "unused-imports": unusedImports,
        },
        languageOptions: {
            parser: tseslint.parser,
        },
        rules: {
            "@stylistic/jsx-quotes": ["error", "prefer-double"],
            "@stylistic/quotes": ["error", "double", { avoidEscape: true }],
            "@stylistic/indent": ["error", 4, { SwitchCase: 1 }],
            "@stylistic/no-mixed-spaces-and-tabs": "error",
            "@stylistic/arrow-parens": ["error", "as-needed"],
            "@stylistic/eol-last": ["error", "always"],
            "@stylistic/no-multi-spaces": "error",
            "@stylistic/no-trailing-spaces": "error",
            "@stylistic/semi": ["error", "always"],
            "@stylistic/space-in-parens": ["error", "never"],
            "@stylistic/block-spacing": ["error", "always"],
            "@stylistic/object-curly-spacing": ["error", "always"],
            "@stylistic/spaced-comment": ["error", "always", { markers: ["!"] }],
            "@stylistic/no-extra-semi": "error",
            "@stylistic/comma-spacing": "error",
            "@stylistic/function-call-spacing": ["error", "never"],
            "yoda": "error",
            "eqeqeq": ["error", "always", { null: "ignore" }],
            "operator-assignment": ["error", "always"],
            "no-useless-computed-key": "error",
            "no-unneeded-ternary": ["error", { defaultAssignment: false }],
            "no-duplicate-imports": "error",
            "simple-import-sort/imports": "error",
            "simple-import-sort/exports": "error",
            "unused-imports/no-unused-imports": "error",
            "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
        },
    },
);
