import { ReactNode, useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { BarsPane } from "./LayoutSettings";
import { rotateBlock } from "./BlockHandle";
import { useLayout } from "../core/layout";
import { APP_VERSION } from "../core/repo";
import { downloadDoc, parseDoc } from "../core/serialize";
import { defaultCamera } from "../core/camera";
import { resetPageCameras } from "../core/pageView";
import { useDoc, useTool, useView } from "../core/store";
import { Density, ThemeMode, useTheme } from "../core/theme";
import { useUI } from "../core/ui";
import { checkForUpdates, isTauri } from "../core/updater";

const TABS: { id: string; label: string; icon: ReactNode }[] = [
  { id: "aparencia", label: "Aparência", icon: <><circle cx="12" cy="12" r="8" /><path d="M12 4v16" /></> },
  { id: "barras", label: "Barras", icon: <><rect x="3.5" y="14" width="17" height="6" rx="2" /><rect x="3.5" y="4" width="6" height="8" rx="2" /></> },
  { id: "caneta", label: "Caneta e toque", icon: <><path d="M4 20l4-1 11-11a2.1 2.1 0 00-3-3L5 16l-1 4z" /></> },
  { id: "atalhos", label: "Atalhos", icon: <><rect x="3" y="7" width="18" height="11" rx="2" /><path d="M7 11h.01M11 11h.01M15 11h.01M8 15h8" /></> },
  { id: "dados", label: "Cadernos e dados", icon: <><path d="M6 4h11a2 2 0 012 2v13a1 1 0 01-1 1H7a2 2 0 01-2-2V5a1 1 0 011-1z" /><path d="M9 4v16" /></> },
  { id: "sobre", label: "Sobre", icon: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></> },
];

const SHORTCUTS: [string, string][] = [
  ["Ctrl+V", "Colar print, imagem, link ou texto"],
  ["Ctrl+C / X / D", "Copiar, recortar, duplicar"],
  ["Ctrl+Z / Ctrl+Shift+Z", "Desfazer / refazer"],
  ["Ctrl+A", "Selecionar tudo"],
  ["V · L · P · E · H", "Selecionar, laço, caneta, borracha, mão"],
  ["R · O · D · A · T", "Retângulo, elipse, losango, seta, texto"],
  ["M · F", "Mapa mental, quadro"],
  ["Tab · Enter · F2", "Mapa: filho, irmão, editar rótulo"],
  ["Ctrl+G", "Agrupar em quadro (Shift desfaz)"],
  ["Shift+1 / Shift+2", "Ver tudo / ver seleção"],
  ["Espaço + arrastar", "Mover a tela"],
  ["PageUp / PageDown", "Página anterior / próxima"],
];

const Chips = <T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) => (
  <div className="row" role="radiogroup" aria-label={label}>
    {options.map(([v, l]) => (
      <button key={v} role="radio" aria-checked={value === v} className={value === v ? "chip on" : "chip"} onClick={() => onChange(v)}>{l}</button>
    ))}
  </div>
);

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button className="toggle" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="toggle-text"><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <span className={on ? "switch on" : "switch"} aria-hidden="true"><i /></span>
    </button>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <output>{fmt(value)}</output>
    </label>
  );
}

export function Settings() {
  const open = useUI((s) => s.settingsOpen);
  const tab = useUI((s) => s.settingsTab);
  const layout = useLayout((s) => s.layout);
  const theme = useTheme();
  const t = useTool();
  const fileRef = useRef<HTMLInputElement>(null);
  const close = () => useUI.getState().setSettingsOpen(false);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  if (!open) return null;
  const L = useLayout.getState();

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const doc = parseDoc(await file.text());
      resetPageCameras();
      useDoc.getState().loadDoc(doc);
      useView.getState().setCamera(defaultCamera());
      close();
    } catch (err) {
      useUI.getState().showToast(err instanceof Error ? err.message : "Não foi possível abrir o arquivo.");
    }
  };

  let body: ReactNode;
  if (tab === "barras") {
    body = <BarsPane layout={layout} onSide={L.setSide} onMove={L.move} onRotate={rotateBlock} onLocked={L.setLocked} onReset={L.reset} />;
  } else if (tab === "caneta") {
    body = (
      <section className="pane">
        <h3>Caneta e toque</h3>
        <Slider label="Sensibilidade à pressão" value={t.pressureSens} min={0} max={1} step={0.05} onChange={(v) => t.set({ pressureSens: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Estabilização do traço" value={t.smoothing} min={0} max={0.9} step={0.05} onChange={(v) => t.set({ smoothing: v })} fmt={(v) => `${Math.round((v / 0.9) * 100)}%`} />
        <Slider label="Afilamento das pontas" value={t.taper} min={0} max={1} step={0.05} onChange={(v) => t.set({ taper: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        <Toggle on={t.fingerDraws} onChange={(v) => t.set({ fingerDraws: v })} label="Desenhar com o dedo" hint="Desligado, o dedo só move a tela (estilo GoodNotes)." />
        <h3>Borracha</h3>
        <Chips label="Modo da borracha" value={t.eraserMode} options={[["stroke", "Traço inteiro"], ["pixel", "Pixel"]]} onChange={(v) => t.set({ eraserMode: v })} />
        <Toggle on={t.eraserPressure} onChange={(v) => t.set({ eraserPressure: v })} label="Pressão muda o tamanho da borracha" />
        <h3>Laço</h3>
        <Chips label="O que o laço seleciona" value={t.lassoMode} options={[["inside", "Só dentro"], ["touch", "Tocando"]]} onChange={(v) => t.set({ lassoMode: v })} />
      </section>
    );
  } else if (tab === "atalhos") {
    body = (
      <section className="pane">
        <h3>Atalhos de teclado</h3>
        <dl className="keys">
          {SHORTCUTS.map(([k, d]) => (<div key={k}><dt><kbd>{k}</kbd></dt><dd>{d}</dd></div>))}
        </dl>
      </section>
    );
  } else if (tab === "dados") {
    body = (
      <section className="pane">
        <h3>Cadernos e arquivos</h3>
        <p className="hint">Os cadernos ficam salvos neste dispositivo. Exporte um arquivo .hiraku para guardar uma cópia externa.</p>
        <div className="row">
          <button className="chip" onClick={() => { close(); useUI.getState().setNotebooksOpen(true); }}>Abrir cadernos</button>
          <button className="chip" onClick={() => downloadDoc(useDoc.getState().doc)}>Salvar .hiraku</button>
          <button className="chip" onClick={() => fileRef.current?.click()}>Abrir .hiraku</button>
          <input ref={fileRef} type="file" accept=".hiraku,application/json" hidden onChange={(e) => { void openFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <p className="hint">Anexos colados ou arrastados (prints, imagens, arquivos de até 15 MB) são guardados dentro do caderno.</p>
      </section>
    );
  } else if (tab === "sobre") {
    body = (
      <section className="pane about">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Logo HM Ideas" height={120} />
        <div>
          <h3>HM Ideas</h3>
          <p className="hint">Hiraku Manager Ideas · versão {APP_VERSION}</p>
          <div className="row">
            <button className="chip" onClick={() => void checkForUpdates(true)}>Verificar atualizações</button>
            {!isTauri() && <a className="chip" href={`${import.meta.env.BASE_URL}download.html`}>Baixar o app</a>}
          </div>
        </div>
      </section>
    );
  } else {
    body = (
      <section className="pane">
        <h3>Tema</h3>
        <Chips<ThemeMode> label="Tema" value={theme.mode} options={[["auto", "Automático"], ["light", "Claro"], ["dark", "Escuro"]]} onChange={theme.setMode} />
        <h3>Tamanho dos botões</h3>
        <Chips<Density> label="Densidade" value={theme.density} options={[["compact", "Compacto"], ["normal", "Normal"], ["large", "Grande (toque)"]]} onChange={theme.setDensity} />
        <p className="hint">O tema muda barras e janelas; a cor da folha continua sendo a do papel do caderno.</p>
      </section>
    );
  }

  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="panel settings dialog" role="dialog" aria-modal="true" aria-label="Configurações">
        <nav className="tabs" role="tablist" aria-label="Seções">
          <div className="tabs-title"><img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={26} height={26} /><strong>Configurações</strong></div>
          {TABS.map((x) => (
            <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? "tab on" : "tab"} onClick={() => useUI.getState().setSettingsTab(x.id)}>
              <Icon size={18}>{x.icon}</Icon><span>{x.label}</span>
            </button>
          ))}
        </nav>
        <div className="tabbody" role="tabpanel">
          <button className="btn sm close" onClick={close} aria-label="Fechar" title="Fechar (Esc)"><Icon><path d="M6 6l12 12M18 6L6 18" /></Icon></button>
          {body}
        </div>
      </div>
    </div>
  );
}
