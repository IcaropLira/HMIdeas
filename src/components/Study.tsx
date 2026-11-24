// Estudos (0.14): revisão de flashcards com repetição espaçada (SM-2), modo prova, Pomodoro, estatísticas,
// apresentação pelos quadros e gravação de áudio sincronizada com os traços.
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import type { Srs } from "../core/blocks/types";
import { HirakuDoc, ID, newId } from "../core/model";
import { selectActivePage, useDoc, useSel, useView } from "../core/store";
import {
  CardRef, GRADES, Grade, Recording, Stats, addStat, applySrs, cleanStats, collectCards, dueCards, examScore, intervalLabel, lastDays,
  markOf, notYetWritten, resetForExam, slideOrder, sm2, streak, withRecording, withoutRecording,
} from "../core/study";
import { elementBounds } from "../core/selection";
import { useTheme } from "../core/theme";
import { useUI } from "../core/ui";
import { Icon } from "./Icon";

const KEY = "hm-ideas:study-v1";
const toast = (m: string) => useUI.getState().showToast(m);

interface Pomo { running: boolean; phase: "focus" | "break"; endsAt: number; left: number; focusMin: number; breakMin: number; done: number }
interface StudyState {
  stats: Stats;
  pomo: Pomo;
  reviewOpen: boolean;
  exam: { active: boolean; startedAt: number } | null;
  present: { index: number } | null;
  rec: { startedAt: number; pageId: ID; marks: { id: ID; at: number }[] } | null;
  play: { pageId: ID; recId: ID } | null;
  set: (p: Partial<StudyState>) => void;
  bump: (p: Parameters<typeof addStat>[2]) => void;
}

const loadSaved = (): { stats: Stats; focusMin: number; breakMin: number } => {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { stats: cleanStats(r.stats), focusMin: Number.isFinite(r.focusMin) ? Math.max(5, Math.min(90, r.focusMin)) : 25, breakMin: Number.isFinite(r.breakMin) ? Math.max(1, Math.min(30, r.breakMin)) : 5 };
  } catch { return { stats: {}, focusMin: 25, breakMin: 5 }; }
};
const saved = typeof localStorage === "undefined" ? { stats: {}, focusMin: 25, breakMin: 5 } : loadSaved();

export const useStudy = create<StudyState>((set, get) => ({
  stats: saved.stats,
  pomo: { running: false, phase: "focus", endsAt: 0, left: saved.focusMin * 60_000, focusMin: saved.focusMin, breakMin: saved.breakMin, done: 0 },
  reviewOpen: false, exam: null, present: null, rec: null, play: null,
  set: (p) => {
    set(p);
    if ("stats" in p || "pomo" in p) {
      const s = get();
      try { localStorage.setItem(KEY, JSON.stringify({ stats: s.stats, focusMin: s.pomo.focusMin, breakMin: s.pomo.breakMin })); } catch { /* sem armazenamento */ }
    }
  },
  bump: (p) => get().set({ stats: addStat(get().stats, Date.now(), p) }),
}));

// ---------- Pomodoro ----------

export function pomoToggle() {
  const { pomo, set } = useStudy.getState();
  if (pomo.running) set({ pomo: { ...pomo, running: false, left: Math.max(0, pomo.endsAt - Date.now()) } });
  else set({ pomo: { ...pomo, running: true, endsAt: Date.now() + pomo.left } });
}
export function pomoReset() {
  const { pomo, set } = useStudy.getState();
  set({ pomo: { ...pomo, running: false, phase: "focus", left: pomo.focusMin * 60_000 } });
}
const beep = () => {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC(), o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; g.gain.setValueAtTime(0.12, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.6);
  } catch { /* sem áudio */ }
};
const fmt = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** Relógio do Pomodoro (uma instância só, em App): troca de fase e soma o tempo de foco nas estatísticas. */
export function PomodoroClock() {
  const pomo = useStudy((s) => s.pomo);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!pomo.running) return;
    const id = setInterval(() => {
      const { pomo: p, set, bump } = useStudy.getState();
      if (!p.running) return;
      if (Date.now() >= p.endsAt) {
        beep();
        if (p.phase === "focus") {
          bump({ focus: p.focusMin, pomodoros: 1 });
          set({ pomo: { ...p, phase: "break", endsAt: Date.now() + p.breakMin * 60_000, left: p.breakMin * 60_000, done: p.done + 1 } });
          toast(`Pomodoro concluído! Pausa de ${p.breakMin} min.`);
        } else {
          set({ pomo: { ...p, phase: "focus", running: false, left: p.focusMin * 60_000 } });
          toast("Pausa acabou. Toque em ▶ para o próximo bloco de foco.");
        }
      }
      tick((n) => n + 1);
    }, 500);
    return () => clearInterval(id);
  }, [pomo.running]);
  if (!pomo.running && pomo.left === pomo.focusMin * 60_000 && pomo.phase === "focus") return null;
  const left = pomo.running ? pomo.endsAt - Date.now() : pomo.left;
  const total = (pomo.phase === "focus" ? pomo.focusMin : pomo.breakMin) * 60_000;
  return (
    <div className={`pomo-pill ${pomo.phase}`} role="timer" aria-label="Pomodoro">
      <span className="pomo-ring" style={{ ["--p" as string]: `${Math.round((1 - left / total) * 100)}%` }} />
      <b>{fmt(left)}</b><small>{pomo.phase === "focus" ? "foco" : "pausa"}</small>
      <button className="btn sm" onClick={pomoToggle} aria-label={pomo.running ? "Pausar" : "Continuar"}>{pomo.running ? "❚❚" : "▶"}</button>
      <button className="btn sm" onClick={pomoReset} aria-label="Zerar" title="Zerar">↺</button>
    </div>
  );
}

// ---------- revisão (SM-2) ----------

export function ReviewModal() {
  const open = useStudy((s) => s.reviewOpen);
  const doc = useDoc((s) => s.doc);
  const [queue, setQueue] = useState<CardRef[]>([]);
  const [i, setI] = useState(0), [shown, setShown] = useState(false);
  const updates = useRef(new Map<ID, Srs>()), right = useRef(0);
  useEffect(() => {
    if (!open) return;
    updates.current = new Map(); right.current = 0;
    setQueue(dueCards(collectCards(useDoc.getState().doc), Date.now()));
    setI(0); setShown(false);
  }, [open]);
  const finish = () => {
    const n = updates.current.size;
    if (n) {
      useDoc.getState().editDoc((d: HirakuDoc) => applySrs(d, updates.current));
      useStudy.getState().bump({ reviewed: n, right: right.current });
    }
    useStudy.getState().set({ reviewOpen: false });
    if (n) toast(`${n} ${n === 1 ? "cartão revisado" : "cartões revisados"}. Até a próxima!`);
  };
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); finish(); return; }
      if (!queue[i]) return;
      if (!shown && (e.key === " " || e.key === "Enter")) { e.preventDefault(); e.stopPropagation(); setShown(true); return; }
      if (shown && ["1", "2", "3", "4"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); grade((+e.key - 1) as Grade); }
    };
    document.addEventListener("keydown", k, true);
    return () => document.removeEventListener("keydown", k, true);
  });
  if (!open) return null;
  const card = queue[i];
  const now = Date.now();
  const grade = (g: Grade) => {
    if (!card) return;
    const prev = updates.current.get(card.el.id) ?? card.el.block.srs;
    const next = sm2(prev, g, Date.now());
    updates.current.set(card.el.id, next);
    if (g >= 2) right.current++;
    // errou: volta para o fim da fila desta sessão
    const q = g === 0 ? [...queue, { ...card, el: { ...card.el, block: { ...card.el.block, srs: next } } }] : queue;
    setQueue(q); setI(i + 1); setShown(false);
  };
  const total = collectCards(doc).length;
  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) finish(); }}>
      <section className="review dialog" role="dialog" aria-modal="true" aria-label="Revisar flashcards">
        <header>
          <strong>Revisão</strong>
          <span>{card ? `${Math.min(i + 1, queue.length)} de ${queue.length}` : ""}</span>
          <button className="btn sm" onClick={finish} aria-label="Fechar" title="Fechar (Esc)"><Icon><path d="M6 6l12 12M18 6L6 18" /></Icon></button>
        </header>
        {!total ? (
          <p className="review-empty">Nenhum flashcard neste caderno. Crie um pela biblioteca de blocos (B → Estudos → Flashcard) e volte aqui.</p>
        ) : !card ? (
          <div className="review-empty"><b>Tudo em dia! 🎉</b><p>{updates.current.size ? `Você revisou ${updates.current.size} cartão(ões).` : "Nenhum cartão vence agora."}</p><button className="btn primary" onClick={finish}>Concluir</button></div>
        ) : (
          <>
            <div className="review-card" style={{ ["--c" as string]: card.el.block.color }}>
              <small>{card.pageName}</small>
              <p className="front">{card.el.block.front || "(sem frente)"}</p>
              {shown && <><hr /><p className="back">{card.el.block.back || "(sem verso)"}</p></>}
            </div>
            {!shown ? (
              <button className="btn primary big" onClick={() => setShown(true)}>Mostrar resposta <kbd>Espaço</kbd></button>
            ) : (
              <div className="review-grades">
                {GRADES.map((x) => {
                  const nx = sm2(updates.current.get(card.el.id) ?? card.el.block.srs, x.g, now);
                  return <button key={x.g} className={`btn grade g${x.g}`} onClick={() => grade(x.g)} title={x.hint}><b>{x.label}</b><small>{intervalLabel(nx, now)}</small><kbd>{x.g + 1}</kbd></button>;
                })}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// ---------- modo prova ----------

export function startExam() {
  useDoc.getState().editDoc(resetForExam);
  useStudy.getState().set({ exam: { active: true, startedAt: Date.now() } });
  toast("Modo prova: fitas escondidas e questões zeradas. Responda e toque em Terminar.");
}
export function ExamBar() {
  const exam = useStudy((s) => s.exam);
  const doc = useDoc((s) => s.doc);
  const [, tick] = useState(0);
  const [result, setResult] = useState<ReturnType<typeof examScore> | null>(null);
  useEffect(() => { if (!exam?.active) return; const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, [exam?.active]);
  if (!exam) return null;
  const sc = examScore(doc);
  if (result) {
    const pct = result.answered ? Math.round((result.right / result.quizzes) * 100) : 0;
    return (
      <div className="exam-bar done" role="status">
        <b>Resultado: {result.right}/{result.quizzes} questões ({pct}%)</b>
        <span>{result.revealed}/{result.tapes} fitas abertas · {fmt(Date.now() - exam.startedAt)}</span>
        <button className="btn sm" onClick={() => { setResult(null); startExam(); }}>Refazer</button>
        <button className="btn sm" onClick={() => { setResult(null); useStudy.getState().set({ exam: null }); }}>Fechar</button>
      </div>
    );
  }
  return (
    <div className="exam-bar" role="status">
      <b>Modo prova</b>
      <span>{fmt(Date.now() - exam.startedAt)}</span>
      <span>{sc.answered}/{sc.quizzes} questões · {sc.revealed}/{sc.tapes} fitas</span>
      <button className="btn sm primary" onClick={() => { setResult(examScore(useDoc.getState().doc)); useStudy.getState().bump({ reviewed: sc.answered, right: sc.right }); }}>Terminar</button>
    </div>
  );
}

// ---------- apresentação pelos quadros ----------

const fitCamera = (b: { minX: number; minY: number; maxX: number; maxY: number }) => {
  const W = window.innerWidth, H = window.innerHeight, pad = 40;
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  const zoom = Math.max(0.05, Math.min(8, Math.min((W - 2 * pad) / w, (H - 2 * pad - 60) / h)));
  return { zoom, x: W / 2 - ((b.minX + b.maxX) / 2) * zoom, y: (H - 60) / 2 - ((b.minY + b.maxY) / 2) * zoom };
};
let anim = 0;
const flyTo = (to: { x: number; y: number; zoom: number }) => {
  cancelAnimationFrame(anim);
  const from = useView.getState().camera;
  if (!useTheme.getState().anim) { useView.getState().setCamera(to); return; }
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / 380), e = 1 - (1 - k) ** 3;
    const z = from.zoom * Math.pow(to.zoom / from.zoom, e);
    useView.getState().setCamera({ zoom: z, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
    if (k < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
};

export function startPresentation() {
  const frames = slideOrder(selectActivePage(useDoc.getState()).elements);
  if (!frames.length) { toast("Para apresentar, crie quadros (F) na página: cada quadro vira um slide."); return; }
  useSel.getState().clear();
  useStudy.getState().set({ present: { index: 0 } });
  useTheme.getState().setFocus(true);
  flyTo(fitCamera(elementBounds(frames[0])));
}
export function Presenter() {
  const present = useStudy((s) => s.present);
  const els = useDoc((s) => selectActivePage(s).elements);
  const frames = useMemo(() => slideOrder(els), [els]);
  const go = (i: number) => {
    if (!frames.length) return;
    const k = Math.max(0, Math.min(frames.length - 1, i));
    useStudy.getState().set({ present: { index: k } });
    flyTo(fitCamera(elementBounds(frames[k])));
  };
  const stop = () => { useStudy.getState().set({ present: null }); useTheme.getState().setFocus(false); };
  useEffect(() => {
    if (!present) return;
    const k = (e: KeyboardEvent) => {
      const next = ["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key), prev = ["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key);
      if (!next && !prev && e.key !== "Escape" && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") stop();
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(frames.length - 1);
      else go(present.index + (next ? 1 : -1));
    };
    document.addEventListener("keydown", k, true);
    return () => document.removeEventListener("keydown", k, true);
  });
  useEffect(() => { if (present && !useTheme.getState().focus) useStudy.getState().set({ present: null }); });
  if (!present) return null;
  const f = frames[present.index];
  return (
    <div className="presenter" role="toolbar" aria-label="Apresentação">
      <button className="btn" onClick={() => go(present.index - 1)} disabled={present.index <= 0} aria-label="Slide anterior"><Icon><path d="M14 6l-6 6 6 6" /></Icon></button>
      <span><b>{present.index + 1}</b> / {frames.length}{f ? ` · ${f.title}` : ""}</span>
      <button className="btn" onClick={() => go(present.index + 1)} disabled={present.index >= frames.length - 1} aria-label="Próximo slide"><Icon><path d="M10 6l6 6-6 6" /></Icon></button>
      <button className="btn" onClick={stop} aria-label="Sair da apresentação" title="Sair (Esc)"><Icon><path d="M6 6l12 12M18 6L6 18" /></Icon></button>
    </div>
  );
}

// ---------- áudio sincronizado ----------

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let unsubMarks: (() => void) | null = null;

export async function startRecording() {
  if (useStudy.getState().rec) return;
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) { toast("Este navegador não grava áudio."); return; }
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { toast("Sem permissão para o microfone."); return; }
  const mime = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "";
  recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : undefined);
  chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const startedAt = Date.now(), pageId = useDoc.getState().activePageId;
  useStudy.getState().set({ rec: { startedAt, pageId, marks: [] } });
  // cada elemento novo na página ganha a marca de tempo de quando apareceu
  unsubMarks = useDoc.subscribe((s, prev) => {
    const r = useStudy.getState().rec;
    if (!r || s.doc === prev.doc) return;
    const page = s.doc.pages.find((p) => p.id === r.pageId), old = prev.doc.pages.find((p) => p.id === r.pageId);
    if (!page || !old || page.elements === old.elements) return;
    const had = new Set(old.elements.map((e) => e.id)), at = Date.now() - r.startedAt;
    const fresh = page.elements.filter((e) => !had.has(e.id) && !r.marks.some((m) => m.id === e.id)).map((e) => ({ id: e.id, at }));
    if (fresh.length) useStudy.getState().set({ rec: { ...r, marks: [...r.marks, ...fresh] } });
  });
  recorder.start(1000);
  toast("Gravando… O que você escrever fica ligado a este momento do áudio.");
}

export function stopRecording() {
  const r = useStudy.getState().rec;
  if (!r || !recorder) return;
  const rec = recorder;
  rec.onstop = () => {
    rec.stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result);
      if (!data.startsWith("data:audio/")) { toast("Não consegui salvar o áudio."); return; }
      const page = useDoc.getState().doc.pages.find((p) => p.id === r.pageId);
      const n = (page?.recordings?.length ?? 0) + 1;
      const recording: Recording = { id: newId(), name: `Gravação ${n} · ${new Date(r.startedAt).toLocaleString()}`, data, mime: blob.type, start: r.startedAt, duration: Date.now() - r.startedAt, marks: r.marks };
      useDoc.getState().editDoc((d) => ({ ...d, pages: d.pages.map((p) => (p.id === r.pageId ? withRecording(p, recording) : p)) }));
      toast(`Gravação salva na página (${fmt(recording.duration)}).`);
    };
    reader.readAsDataURL(blob);
  };
  rec.stop();
  recorder = null;
  unsubMarks?.(); unsubMarks = null;
  useStudy.getState().set({ rec: null });
}

/** Pílula de gravação + player com a escrita reaparecendo no ritmo do áudio. */
export function AudioDock() {
  const rec = useStudy((s) => s.rec), play = useStudy((s) => s.play);
  const page = useDoc((s) => selectActivePage(s));
  const audio = useRef<HTMLAudioElement>(null);
  const [t, setT] = useState(0), [, tick] = useState(0);
  const recording = play ? page.recordings?.find((r) => r.id === play.recId) : undefined;
  useEffect(() => { if (!rec) return; const id = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(id); }, [rec]);
  useEffect(() => { if (play && (!recording || play.pageId !== page.id)) useStudy.getState().set({ play: null }); });
  // o que ainda "não foi escrito" fica apagadinho durante a reprodução
  useEffect(() => {
    const ghosts = recording ? notYetWritten(recording, t) : new Set<ID>();
    window.dispatchEvent(new CustomEvent("hm-ghosts", { detail: ghosts }));
  }, [recording, t]);
  useEffect(() => () => { window.dispatchEvent(new CustomEvent("hm-ghosts", { detail: new Set() })); }, []);
  if (rec) {
    return (
      <div className="rec-pill" role="status">
        <span className="rec-dot" /> <b>Gravando</b> <span>{fmt(Date.now() - rec.startedAt)}</span> <small>{rec.marks.length} traços ligados</small>
        <button className="btn sm" onClick={stopRecording}>Parar</button>
      </div>
    );
  }
  if (!recording) return null;
  const sel = useSel.getState().ids[0];
  const selAt = sel ? markOf(recording, sel) : null;
  return (
    <div className="rec-pill play" role="region" aria-label="Reprodução da gravação">
      <audio ref={audio} src={recording.data} autoPlay controls onTimeUpdate={(e) => setT(e.currentTarget.currentTime * 1000)} onEnded={() => setT(Infinity)} />
      {selAt !== null && <button className="btn sm" onClick={() => { if (audio.current) { audio.current.currentTime = Math.max(0, selAt / 1000 - 2); void audio.current.play(); } }} title="Toca o que foi dito quando o item selecionado foi escrito">Ir ao selecionado</button>}
      <button className="btn sm" onClick={() => useStudy.getState().set({ play: null })} aria-label="Fechar player"><Icon size={18}><path d="M6 6l12 12M18 6L6 18" /></Icon></button>
    </div>
  );
}

// ---------- painel Estudos ----------

export function StudyPanel() {
  const doc = useDoc((s) => s.doc);
  const page = useDoc((s) => selectActivePage(s));
  const { stats, pomo, rec, exam } = useStudy();
  const now = Date.now();
  const cards = useMemo(() => collectCards(doc), [doc]);
  const due = useMemo(() => dueCards(cards, now).length, [cards]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = lastDays(stats, now, 7);
  const max = Math.max(1, ...days.map((d) => d.s.focus + d.s.reviewed));
  const total = Object.values(stats).reduce((a, s) => ({ focus: a.focus + s.focus, reviewed: a.reviewed + s.reviewed, right: a.right + s.right }), { focus: 0, reviewed: 0, right: 0 });
  const set = useStudy.getState().set;
  const frames = slideOrder(page.elements).length;
  return (
    <div className="study">
      <section>
        <h4>Revisão espaçada</h4>
        <p className="hint">{cards.length} flashcards no caderno · <b>{due}</b> para revisar agora</p>
        <button className="btn primary" disabled={!cards.length} onClick={() => set({ reviewOpen: true })}>Revisar agora</button>
      </section>
      <section>
        <h4>Pomodoro</h4>
        <div className="row">
          <button className="btn primary" onClick={pomoToggle}>{pomo.running ? "Pausar" : pomo.left < pomo.focusMin * 60_000 || pomo.phase === "break" ? "Continuar" : `Começar ${pomo.focusMin} min`}</button>
          <button className="btn" onClick={pomoReset}>Zerar</button>
        </div>
        <div className="row">
          <label className="mini">Foco <input type="number" min={5} max={90} value={pomo.focusMin} onChange={(e) => { const v = Math.max(5, Math.min(90, +e.target.value || 25)); set({ pomo: { ...pomo, focusMin: v, left: pomo.running || pomo.phase === "break" ? pomo.left : v * 60_000 } }); }} /> min</label>
          <label className="mini">Pausa <input type="number" min={1} max={30} value={pomo.breakMin} onChange={(e) => set({ pomo: { ...pomo, breakMin: Math.max(1, Math.min(30, +e.target.value || 5)) } })} /> min</label>
        </div>
      </section>
      <section>
        <h4>Modo prova</h4>
        <p className="hint">Esconde todas as fitas, zera as questões e vira os flashcards. No fim mostra a nota.</p>
        <button className="btn" disabled={!!exam} onClick={startExam}>{exam ? "Prova em andamento" : "Começar prova"}</button>
      </section>
      <section>
        <h4>Apresentar</h4>
        <p className="hint">{frames ? `${frames} quadro(s) nesta página viram slides (ordem de leitura ou numeração "1.", "2."…).` : "Crie quadros (F): cada um vira um slide."}</p>
        <button className="btn" disabled={!frames} onClick={startPresentation}>Apresentar pelos quadros</button>
      </section>
      <section>
        <h4>Gravação de áudio</h4>
        <p className="hint">Grave a aula enquanto escreve: depois a escrita reaparece no ritmo do áudio.</p>
        {rec ? <button className="btn danger" onClick={stopRecording}>Parar gravação</button> : <button className="btn" onClick={() => void startRecording()}>● Gravar</button>}
        {(page.recordings ?? []).map((r) => (
          <div key={r.id} className="rec-row">
            <button className="btn sm" onClick={() => set({ play: { pageId: page.id, recId: r.id } })} aria-label={`Tocar ${r.name}`}>▶</button>
            <span title={r.name}>{r.name}</span><small>{fmt(r.duration)}</small>
            <button className="btn sm" onClick={() => useDoc.getState().editDoc((d) => ({ ...d, pages: d.pages.map((p) => (p.id === page.id ? withoutRecording(p, r.id) : p)) }))} aria-label={`Apagar ${r.name}`} title="Apagar gravação (dá para desfazer)">✕</button>
          </div>
        ))}
      </section>
      <section>
        <h4>Estatísticas</h4>
        <p className="hint">{streak(stats, now)} dia(s) seguidos · {Math.round(total.focus / 60 * 10) / 10} h de foco · {total.reviewed} revisões{total.reviewed ? ` (${Math.round((total.right / total.reviewed) * 100)}% acertos)` : ""}</p>
        <div className="study-chart" aria-label="Últimos 7 dias">
          {days.map((d) => (
            <div key={d.key} className="bar" title={`${d.key}: ${d.s.focus} min de foco, ${d.s.reviewed} revisões`}>
              <span className="r" style={{ height: `${(d.s.reviewed / max) * 100}%` }} />
              <span className="f" style={{ height: `${(d.s.focus / max) * 100}%` }} />
              <small>{d.label}</small>
            </div>
          ))}
        </div>
        <p className="legend"><i className="f" /> minutos de foco <i className="r" /> revisões</p>
      </section>
    </div>
  );
}
