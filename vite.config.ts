import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Definido pelo Tauri em `tauri dev` / `tauri build` (e no Android via TAURI_DEV_HOST).
const host = process.env.TAURI_DEV_HOST;
const insideTauri = !!process.env.TAURI_ENV_PLATFORM;
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  // Site no GitHub Pages: o workflow define VITE_BASE=/repositorio/. No Tauri e no dev fica "/".
  base: process.env.VITE_BASE || "/",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    // PWA só na versão web (instalável no iPad/Android/PC). Dentro do Tauri fica desligado (o módulo virtual vira um no-op).
    // "prompt": a versão nova NUNCA recarrega a página sozinha; o aviso do app pede o clique.
    VitePWA({
      disable: insideTauri,
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["icon.svg"],
      workbox: { navigateFallbackDenylist: [/download\.html$/] },
      manifest: {
        name: "HM Ideas",
        short_name: "HM Ideas",
        description: "Hiraku Manager Ideas: quadro branco, mapas mentais e caderno de anotações com caneta.",
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
  build: {
    target: "es2022",
    rollupOptions: { input: { main: resolve(__dirname, "index.html"), download: resolve(__dirname, "download.html") } },
  },
});
