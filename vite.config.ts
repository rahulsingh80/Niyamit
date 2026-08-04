/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/Niyamit/",
  resolve: {
    alias: {
      "@domain": path.resolve(__dirname, "src/domain"),
      "@services": path.resolve(__dirname, "src/services"),
      "@components": path.resolve(__dirname, "src/components")
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/domain/**/*.ts", "src/services/**/*.ts"],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 75
      }
    }
  }
});

