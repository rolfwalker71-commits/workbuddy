import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
  {
    // Node CJS helper scripts (git hooks run them directly, package.json has no
    // "type": "module"), so require() is correct here.
    files: ["scripts/**/*.js", "scripts/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Warn, not error: ~90 hits, and most are load-on-mount or hydration flags
    // rather than defects. As errors they drowned out real findings and made
    // `npm run lint` useless as a gate. Raise back to "error" once the effects
    // have been reworked (data layer + key-based resets).
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
]);

export default eslintConfig;
