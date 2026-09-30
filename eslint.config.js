import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  // Lints packages/ only (npm run lint:packages); each app runs its own config.
  globalIgnores(["**/node_modules/**", "*-frontend/**", "e2e/**", "backend/**"]),
]);
