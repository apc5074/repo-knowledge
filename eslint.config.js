import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/.uv-cache/**",
      "**/.venv/**",
      "**/.uv-python/**",
      "**/.ruff_cache/**",
      "**/.mypy_cache/**",
      "**/.pytest_cache/**",
      "packages/bootstrap-runtime/test/fixtures/repos/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"]
  }
);
