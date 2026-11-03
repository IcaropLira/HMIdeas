/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Versão do app (package.json), injetada pelo Vite. */
declare const __APP_VERSION__: string;
declare const __GH_REPO__: string;

// pdf.js (build "legacy", compatível com WebViews mais antigas). Tipado à mão em render/pdfDoc.ts.
declare module "pdfjs-dist/legacy/build/pdf.mjs";
