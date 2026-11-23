import { useEffect, useRef, useState } from "react";
import { screenToWorld } from "../core/camera";
import { AttachmentElement } from "../core/model";
import { useEmbedView } from "../core/embedView";
import { clampPage, clampScroll, maxScroll, pageAtScroll, parseYouTube, scrollLayout, youtubeCommand, youtubeEmbed, youtubeWatch } from "../core/embed";
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

  const interact = useEmbedView((s) => s.interact);
  const paused = useEmbedView((s) => s.paused);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const activePage = useDoc((s) => s.activePageId);

  // Trocar de página (ou apagar/desfazer o vídeo) encerra o player: antes ele "voltava a tocar" do começo ao retornar à página.
  useEffect(() => { useEmbedView.getState().play(null); }, [activePage]);
  useEffect(() => {
    if (playing && !elements.some((e) => e.id === playing)) play(null);
  }, [elements, playing, play]);

  // Modo "controlar player": só nele o iframe recebe o mouse. Sair do retângulo do vídeo, clicar fora ou Esc volta ao quadro
  // (antes, com o vídeo selecionado, a roda do mouse e a pinça ficavam presas dentro do YouTube e a tela não andava).
  useEffect(() => {
    if (!interact) return;
    const inside = (x: number, y: number) => {
      const el = selectActivePage(useDoc.getState()).elements.find((e) => e.id === interact);
      if (!el || el.type !== "attachment") return false;
      const c = useView.getState().camera;
      const P = screenToWorld(c, x, y);
      const m = 6 / c.zoom;
      return P.x >= el.x - m && P.x <= el.x + el.w + m && P.y >= el.y - 40 / c.zoom && P.y <= el.y + el.h + m;
    };
    const leave = (ev: PointerEvent) => { if (!(ev.target as HTMLElement | null)?.closest?.(".embed-bar") && !inside(ev.clientX, ev.clientY)) useEmbedView.getState().setInteract(null); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") useEmbedView.getState().setInteract(null); };
    window.addEventListener("pointerdown", leave, true);
    window.addEventListener("pointermove", leave, true);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", leave, true);
      window.removeEventListener("pointermove", leave, true);
      window.removeEventListener("keydown", esc);
    };
  }, [interact]);

  const command = (id: string, func: "pauseVideo" | "playVideo") => {
    try { frameRef.current?.contentWindow?.postMessage(youtubeCommand(func), "*"); } catch { /* player ainda carregando */ }
    useEmbedView.getState().setPaused(id, func === "pauseVideo");
  };

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

  // Anti-glitch do player (iframe = camada própria do compositor). No WebView2, mover/redimensionar um iframe
  // por cima do canvas WebGL deixa rastros do quadro anterior. Por isso o iframe fica invisível (a miniatura do
  // Pixi aparece no lugar, já na posição certa, com o aviso "Reproduzindo") enquanto a câmera se move e ~100 ms
  // depois, e enquanto o próprio vídeo é arrastado/redimensionado. O vídeo continua tocando (só fica invisível).
  const [moving, setMoving] = useState(false);
  // Zoom "assentado": o iframe só é redimensionado quando a câmera para (relayout do player a cada passo de zoom pesava).
  const [zoomSettled, setZoomSettled] = useState(cam.zoom);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    setMoving(true);
    const t = setTimeout(() => { setMoving(false); setZoomSettled(useView.getState().camera.zoom); }, 100);
    return () => clearTimeout(t);
    // Selecionar/desmarcar também conta: a barra "1 selecionado" some e a camada do iframe podia deixar um pedaço dela na tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam, sel, playing]);
  useEffect(() => { if (moving) useEmbedView.getState().setInteract(null); }, [moving]);
  useEffect(() => {
    let release: ReturnType<typeof setTimeout> | undefined;
    const down = (ev: PointerEvent) => {
      const id = useEmbedView.getState().playing;
      if (!id || (ev.target as HTMLElement | null)?.closest?.(".embed-layer button")) return;
      const el = selectActivePage(useDoc.getState()).elements.find((x) => x.id === id);
      if (!el || el.type !== "attachment" || el.kind !== "video") return;
      const c = useView.getState().camera;
      const P = screenToWorld(c, ev.clientX, ev.clientY);
      const m = 16 / c.zoom; // inclui as alças de redimensionar, que ficam um pouco fora do quadro
      if (P.x >= el.x - m && P.x <= el.x + el.w + m && P.y >= el.y - m && P.y <= el.y + el.h + m) { clearTimeout(release); setHeld(true); }
    };
    const up = () => { clearTimeout(release); release = setTimeout(() => setHeld(false), 80); };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      clearTimeout(release);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  }, []);

  // Com um player vivo na tela, as sombras grandes das barras viram retângulos pretos no WebView2: desliga-as.
  const live = !!playing && elements.some((e) => e.id === playing);
  useEffect(() => {
    document.documentElement.classList.toggle("embed-live", live);
    return () => document.documentElement.classList.remove("embed-live");
  }, [live]);

  const vw = typeof window !== "undefined" ? window.innerWidth : 1920;
  const vh = typeof window !== "undefined" ? window.innerHeight : 1080;
  const items = elements.filter((e): e is AttachmentElement => e.type === "attachment" && (e.kind === "video" || e.kind === "pdf"));
  if (!items.length) return null;

  return (
    <div className="embed-layer">
      {items.map((el) => {
        const left = Math.round(el.x * cam.zoom + cam.x), top = Math.round(el.y * cam.zoom + cam.y);
        const w = el.w * cam.zoom, h = el.h * cam.zoom;
        // Fora da tela: PDF e botões somem, mas o player que está tocando NÃO é desmontado (desmontar o iframe para o vídeo);
        // ele só fica invisível até voltar à tela.
        const off = left > vw || top > vh || left + w < 0 || top + h < 0;
        // posiciona por transform (não relayouta o iframe a cada pan); o tamanho do iframe só muda no zoom
        const box = { width: w, height: h, transform: `translate3d(${left}px, ${top}px, 0)` };
        if (el.kind === "pdf") {
          if (off || !sel.includes(el.id)) return null;
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
            <div key={el.id} className={`embed-box${moving || held ? " embed-hold" : ""}${off ? " embed-off" : ""}${interact === el.id ? " embed-interact" : ""}`} style={box}>
              {/* O iframe tem o tamanho da TELA (não é mais um scale do tamanho do mundo): controles do YouTube legíveis em qualquer zoom
                  e vídeo nítido. Ele só muda de tamanho quando o zoom termina, porque durante o movimento fica invisível. */}
              <div className="embed-frame" style={{ width: el.w * zoomSettled, height: el.h * zoomSettled }}>
                <iframe
                  ref={frameRef}
                  src={youtubeEmbed(yt)}
                  title={el.title}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  style={{ pointerEvents: interact === el.id ? "auto" : "none" }}
                />
              </div>
              {(moving || held) && !off && <div className="embed-pill">● Reproduzindo…</div>}
              {interact === el.id && !moving && !held && <div className="embed-tip">Controlando o player · saia do vídeo ou Esc para voltar ao quadro</div>}
              <div className="embed-bar">
                <button onClick={() => command(el.id, paused[el.id] ? "playVideo" : "pauseVideo")} title={paused[el.id] ? "Continuar" : "Pausar"} aria-label={paused[el.id] ? "Continuar" : "Pausar"}>{paused[el.id] ? "▶" : "❚❚"}</button>
                <button
                  className={interact === el.id ? "on" : undefined}
                  onClick={() => useEmbedView.getState().setInteract(interact === el.id ? null : el.id)}
                  title="Deixa o mouse controlar o player do YouTube (barra de progresso, volume, legendas)"
                >{interact === el.id ? "Pronto" : "Controlar player"}</button>
                <button onClick={() => void openExternal(youtubeWatch(yt))} title="Abrir no navegador">Abrir ↗</button>
                <button onClick={() => play(null)} title="Voltar à miniatura">Fechar</button>
              </div>
            </div>
          );
        }
        if (off || !sel.includes(el.id)) return null;
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
