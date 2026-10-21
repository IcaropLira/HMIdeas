import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Definido pelo Tauri em `tauri dev` / `tauri build` (e no Android via TAURI_DEV_HOST).
const host = process.env.TAURI_DEV_HOST;
const insideTauri = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig({
  plugins: [
    react(),
    // PWA só na versão web (para testar no iPad sem Mac). Dentro do Tauri fica desligado.
    !insideTauri &&
      VitePWA({
        registerType: "autoUpdate",
        manifest: {
          name: "HM Ideas",
          short_name: "HM Ideas",
          description: "Hiraku Manager Ideas: quadro branco e caderno de anotações com caneta.",
          display: "standalone",
          orientation: "any",
          background_color: "#EDF0F4",
          theme_color: "#EDF0F4",
          icons: [
            { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
            { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
            { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
      }),
  ],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: { target: "es2022" },
});
