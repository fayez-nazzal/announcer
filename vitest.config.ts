import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["apps/**/*.test.{ts,tsx}", "libs/**/*.test.{ts,tsx}"],
    setupFiles: ["test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["apps/web/src/**/*.{ts,tsx}", "libs/*/src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts"],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage",
      thresholds: { lines: 91, statements: 91, functions: 91, branches: 91 },
    },
  },
});
