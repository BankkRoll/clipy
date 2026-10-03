import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Vitest config for frontend unit tests.
// Reuses the React plugin and the `@/` -> ./src path alias from vite.config.ts.
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Full-page interaction tests drive many user events; vitest 4 runs them
    // slower under coverage instrumentation than the 5 s default allows.
    testTimeout: 15_000,
    coverage: {
      provider: "istanbul",
      reportsDirectory: "./coverage/frontend",
      reporter: ["text-summary", "html", "lcov", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/test/**",
        "src/**/*.d.ts",
        "src/main.tsx",
        // Type-only modules have no runtime code to cover.
        "src/types/**",
      ],
      // Every frontend file is fully covered; any untested addition fails CI.
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
