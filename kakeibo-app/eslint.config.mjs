import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // vinext / Cloudflare Workers build output:
    "dist/**",
    ".vinext/**",
    ".wrangler/**",
    "worker-configuration.d.ts",
  ]),
]);

export default eslintConfig;
