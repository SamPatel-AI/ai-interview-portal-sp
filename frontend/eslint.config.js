import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Never lint: build output, shadcn primitives (do not edit), tailwind config
    ignores: [
      "dist",
      "src/components/ui/**",
      "tailwind.config.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Lovable generates `any` types — warn only so make validate never blocks on Lovable output
      "@typescript-eslint/no-explicit-any": "warn",
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["@/domains/*/hooks/*"], message: "Import from @/domains/{name} barrel export instead." },
          { group: ["@/domains/*/services/*"], message: "Import from @/domains/{name} barrel export instead." },
          { group: ["@/domains/*/types*"], message: "Import from @/domains/{name} barrel export instead." },
        ],
      }],
    },
  },
);
