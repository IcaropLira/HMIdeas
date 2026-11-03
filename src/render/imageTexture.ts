// Carrega imagens anexadas (data URL) como textura do Pixi, de forma assíncrona e com cache.
// No PixiJS v8 `Texture.from(dataURL)` devolve uma textura VAZIA que só carrega depois (e sem avisar
// o renderer): o print colado aparecia como um retângulo em branco. Aqui a imagem é decodificada
// ANTES de virar textura, e quem desenha só recebe a textura quando ela está pronta.
import { Texture } from "pixi.js";
import { createLoaderCache } from "../core/loaderCache";

/** Decodifica o data URL num <img> pronto (com largura/altura reais) e só então cria a textura. */
async function loadTexture(src: string): Promise<Texture | null> {
  const img = new Image();
  img.decoding = "async";
  if (/^https?:/i.test(src)) img.crossOrigin = "anonymous"; // miniaturas remotas: o WebGL só aceita com CORS
  img.src = src;
  try {
    if (img.decode) await img.decode();
    else await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error("imagem inválida")); });
  } catch {
    return null;
  }
  if (!img.naturalWidth || !img.naturalHeight) return null;
  return Texture.from(img);
}

const cache = createLoaderCache<Texture>(loadTexture);

export const peekImageTexture = (src: string) => cache.peek(src);
export const loadImageTexture = (src: string) => cache.get(src);

/** Libera as texturas (ao destruir o renderer). */
export function clearImageTextures() {
  for (const t of cache.values()) { try { t.destroy(true); } catch { /* já destruída */ } }
  cache.clear();
}
