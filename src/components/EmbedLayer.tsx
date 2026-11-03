import { useEffect } from "react";
import { AttachmentElement } from "../core/model";
import { useEmbedView } from "../core/embedView";
import { clampPage, clampScroll, maxScroll, pageAtScroll, parseYouTube, scrollLayout, youtubeEmbed, youtubeWatch } from "../core/embed";
import { openExternal } from "../core/openExternal";
import { selectActivePage, useDoc, useSel, useView } from "../core/store";

/** Passa `delta` páginas no PDF (carrossel: troca a página; rolagem: salta para o início da página vizinha). */
function turnPage(el: AttachmentElement, delta: number) {
  const v = useEmbedView.getState();
  const count = Math.max(1, el.pages ?? 1);
  if (el.mode === "scroll") {
    const L = scrollLayout(el.w, el.ratio ?? 1.414, count);
    const cur = pageAtScroll(v.scroll[el.id] ?? 0, el.h, L.step, count);
    v.setScroll(el.id, clampScroll((clampPage(cur + delta, count) - 1) * L.step, L.total, el.h));
  } else {
    v.setPage(el.id, clampPage((v.page[el.id] ?? 1) + delta, count));
  }
}

/**
 * Camada DOM por cima do canvas para o que o WebGL não desenha: o player do YouTube (iframe) e os controles
 * dos incorporados. Acompanha a câmera; só os botões recebem clique, o resto deixa o canvas funcionar.
 */
export function EmbedLayer() {
  const elements = useDoc((s) => selectActivePage(s).elements);
  const cam = useView((s) => s.camera);
  const sel = useSel((s) => s.ids);
  const playing = useEmbedView((s) => s.playing);
  const play = useEmbedView((s) => s.play);

  const pdfScroll = useEmbedView((s) => s.scroll);
  const pdfPage = useEmbedView((s) => s.page);

  // Setas e PageUp/PageDown passam as páginas do PDF selecionado (fora de campos de texto).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const dir = ev.key === "ArrowRight" || ev.key === "PageDown" ? 1 : ev.key === "ArrowLeft" || ev.key === "PageUp" ? -1 : 0;
      if (!dir) return;
      const ids = useSel.getState().ids;
      if (ids.length !== 1) return;
      const el = selectActivePage(useDoc.getState()).elements.find((x) => x.id === ids[0]);
      if (!el || el.type !== "attachment" || el.kind !== "pdf") return;
      ev.preventDefault();
      turnPage(el, dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const vw = typeof window !== "undefined" ? window.innerWidth : 1920;
  const vh = typeof window !== "undefined" ? window.innerHeight : 1080;
  const items = elements.filter((e): e is AttachmentElement => e.type === "attachment" && (e.kind === "video" || e.kind === "pdf"));
  if (!items.length) return null;

  return (
    <div className="embed-layer">
      {items.map((el) => {
        const left = el.x * cam.zoom + cam.x, top = el.y * cam.zoom + cam.y;
        const w = el.w * cam.zoom, h = el.h * cam.zoom;
        if (left > vw || top > vh || left + w < 0 || top + h < 0) return null; // fora da tela: nada de iframe vivo
        const box = { left, top, width: w, height: h };
        if (el.kind === "pdf") {
          if (!sel.includes(el.id)) return null;
          const count = Math.max(1, el.pages ?? 1);
          const L = scrollLayout(el.w, el.ratio ?? 1.414, count);
          const scrolling = el.mode === "scroll";
          const cur = scrolling ? pageAtScroll(pdfScroll[el.id] ?? 0, el.h, L.step, count) : clampPage(pdfPage[el.id] ?? 1, count);
          const atEnd = scrolling ? (pdfScroll[el.id] ?? 0) >= maxScroll(L.total, el.h) - 1 : cur >= count;
          return (
            <div key={el.id} className="embed-box" style={box}>
              <div className="embed-nav" style={{ top: h + 8 }}>
                <button onClick={() => turnPage(el, -1)} disabled={cur <= 1} title="Página anterior (←)" aria-label="Página anterior">‹</button>
                <span className="embed-count">{cur} / {count}</span>
                <button onClick={() => turnPage(el, 1)} disabled={atEnd} title="Próxima página (→)" aria-label="Próxima página">›</button>
                <button
                  onClick={() => useDoc.getState().updateElements([{ ...el, mode: scrolling ? "carousel" : "scroll" }])}
                  title={scrolling ? "Mostrar uma página por vez" : "Rolar as páginas para baixo"}
                >
                  {scrolling ? "Carrossel" : "Rolagem"}
                </button>
              </div>
            </div>
          );
        }
        const yt = parseYouTube(el.url);
        if (!yt) return null;
        if (playing === el.id) {
          return (
            <div key={el.id} className="embed-box" style={box}>
              <iframe
                src={youtubeEmbed(yt)}
                title={el.title}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
              <div className="embed-bar">
                <button onClick={() => void openExternal(youtubeWatch(yt))} title="Abrir no navegador">Abrir no navegador ↗</button>
                <button onClick={() => play(null)} title="Voltar à miniatura">Fechar</button>
              </div>
            </div>
          );
        }
        if (!sel.includes(el.id)) return null;
        const d = Math.max(44, Math.min(w, h) * 0.26);
        return (
          <div key={el.id} className="embed-box embed-idle" style={box}>
            <button className="embed-play" style={{ width: d, height: d }} onClick={() => play(el.id)} title="Reproduzir aqui" aria-label="Reproduzir vídeo">▶</button>
            <div className="embed-bar">
              <button onClick={() => void openExternal(youtubeWatch(yt))} title="Abrir no navegador">Abrir no navegador ↗</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
