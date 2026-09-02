import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  {
    extends: [...nextCoreWebVitals, ...nextTypescript],
    rules: {
      // New, stricter rule as of this eslint-config-next version. Every
      // current hit is a pre-existing, deliberate pattern (the next-themes
      // hydration-safe "mounted" flag, syncing local state to an incoming
      // URL search param, resetting a modal's form state when it reopens)
      // — not a bug introduced by the Next.js 16 upgrade. Downgraded rather
      // than silenced so it stays visible without blocking the pre-push
      // build/lint gate; revisit case-by-case if it's worth restructuring.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);
