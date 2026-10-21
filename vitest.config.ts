import { defineConfig } from "vitest/config";

// Testes só da lógica pura (src/core, parsers…): ambiente Node, sem o PWA/Tauri do vite.config.
export default defineConfig({ test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"] } });
