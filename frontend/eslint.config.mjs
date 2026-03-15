import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import security from "eslint-plugin-security";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  security.configs.recommended,
  // Temporarily downgrade React hooks rules to warnings for existing code
  {
    rules: {
      "react-hooks/use-memo": "warn",
      "react-hooks/set-state-in-effect": "warn",
      // TypeScript/React コードで bracket notation は慣用的なため無効化
      "security/detect-object-injection": "off",
    },
  },
]);

export default eslintConfig;
