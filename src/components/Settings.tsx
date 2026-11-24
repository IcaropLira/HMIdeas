import { ReactNode, useEffect, useRef, useState } from "react";
import { START_HOME_KEY } from "./NotebookManager";
import { Icon } from "./Icon";
import { BackupsPane, pickPdfAsPages, useExport } from "./ExportDialog";
import { BarsPane } from "./LayoutSettings";
import { ShortcutEditor } from "./ShortcutEditor";
import { WorkspacePane } from "./WorkspacePane";
import { useLayout } from "../core/layout";
import { APP_VERSION } from "../core/repo";
import { downloadDoc, parseDoc } from "../core/serialize";
import { defaultCamera } from "../core/camera";
import { resetPageCameras } from "../core/pageView";
import { useDoc, useTool, useView } from "../core/store";
import { ACCENTS, Density, REGIONS, TEXTURES, THEMES, Texture, ThemeDef, ThemeTokens, mixHex, useTheme } from "../core/theme";
import { useUI } from "../core/ui";
import { useCapture } from "./commands";
import { checkForUpdates, isTauri } from "../core/updater";

const TABS: { id: string; label: string; icon: ReactNode }[] = [
  { id: "aparencia", label: "Aparência", icon: <><circle cx="12" cy="12" r="8" /><path d="M12 4v16" /></> },
  { id: "areas", label: "Áreas de trabalho", icon: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M3.5 8h17M15 8v12" /></> },
  { id: "barras", label: "Barras", icon: <><rect x="3.5" y="14" width="17" height="6" rx="2" /><rect x="3.5" y="4" width="6" height="8" rx="2" /></> },
  { id: "caneta", label: "Caneta e toque", icon: <><path d="M4 20l4-1 11-11a2.1 2.1 0 00-3-3L5 16l-1 4z" /></> },
  { id: "atalhos", label: "Atalhos", icon: <><rect x="3" y="7" width="18" height="11" rx="2" /><path d="M7 11h.01M11 11h.01M15 11h.01M8 15h8" /></> },
  { id: "dados", label: "Cadernos e dados", icon: <><path d="M6 4h11a2 2 0 012 2v13a1 1 0 01-1 1H7a2 2 0 01-2-2V5a1 1 0 011-1z" /><path d="M9 4v16" /></> },
  { id: "sobre", label: "Sobre", icon: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></> },
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

/** Baixa um texto como arquivo. */
export function saveText(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const TOKEN_LABELS: [keyof ThemeTokens, string][] = [["paper", "Fundo (atrás de tudo)"], ["chrome", "Barras e painéis"], ["surface", "Campos e cartões"], ["surface2", "Destaques suaves"], ["ink", "Texto"], ["soft", "Texto secundário"], ["danger", "Perigo (excluir)"]];

/** Editor de um tema do usuário: cores base e cores por região, com prévia ao vivo. */
function ThemeEditor({ def }: { def: ThemeDef }) {
  const th = useTheme.getState();
  const up = (p: Partial<ThemeDef>) => th.saveTheme({ ...def, ...p });
  return (
    <div className="theme-ed">
      <div className="row">
        <input className="name" defaultValue={def.label} key={def.id} maxLength={40} aria-label="Nome do tema" onBlur={(e) => up({ label: e.target.value })} />
        <button className={def.dark ? "chip on" : "chip"} aria-pressed={def.dark} onClick={() => up({ dark: !def.dark })} title="Ícones e cores do sistema no modo escuro">Escuro</button>
        <button className="chip" onClick={() => saveText(`tema-${def.label.replace(/[^\w-]+/g, "-")}.json`, th.exportThemes([def.id]))}>Exportar</button>
        <button className="chip danger" onClick={() => th.deleteTheme(def.id)}>Excluir</button>
      </div>
      <small>Cores do tema</small>
      <div className="color-grid">
        {TOKEN_LABELS.map(([k, label]) => (
          <label key={k} className="color-field"><span>{label}</span><input type="color" value={def.t[k] || "#000000"} onChange={(e) => up({ t: { ...def.t, [k]: e.target.value } })} /></label>
        ))}
      </div>
      <small>Cores por região (vazio = a do tema)</small>
      <div className="color-grid">
        {REGIONS.map((g) => (
          <label key={g.id} className="color-field" title={g.hint}><span>{g.label}</span>
            <input type="color" value={def.regions?.[g.id] ?? def.t.chrome} onChange={(e) => up({ regions: { ...def.regions, [g.id]: e.target.value } })} />
            {def.regions?.[g.id] && <button onClick={() => { const r = { ...def.regions }; delete r[g.id]; up({ regions: r }); }} aria-label={`Tirar cor de ${g.label}`} title="Usar a do tema">↺</button>}
          </label>
        ))}
      </div>
    </div>
  );
}

export function Settings() {
  const open = useUI((s) => s.settingsOpen);
  const tab = useUI((s) => s.settingsTab);
  const layout = useLayout((s) => s.layout);
  const theme = useTheme();
  const t = useTool();
  const fileRef = useRef<HTMLInputElement>(null), themeFileRef = useRef<HTMLInputElement>(null);
  const custom = theme.custom.find((c) => c.id === theme.mode);
  const [startHome, setStartHome] = useState(() => { try { return localStorage.getItem(START_HOME_KEY) !== "0"; } catch { return true; } });
  const close = () => useUI.getState().setSettingsOpen(false);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !useCapture.getState().id && close();
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
    body = <BarsPane layout={layout} onChange={(n) => L.setLayout(n)} onLocked={L.setLocked} onReset={L.reset} />;
  } else if (tab === "caneta") {
    body = (
      <section className="pane">
        <h3>Caneta e toque</h3>
        <Slider label="Sensibilidade à pressão" value={t.pressureSens} min={0} max={1} step={0.05} onChange={(v) => t.set({ pressureSens: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Estabilização do traço" value={t.smoothing} min={0} max={0.9} step={0.05} onChange={(v) => t.set({ smoothing: v })} fmt={(v) => `${Math.round((v / 0.9) * 100)}%`} />
        <Slider label="Afilamento das pontas" value={t.taper} min={0} max={1} step={0.05} onChange={(v) => t.set({ taper: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        <Toggle on={t.fingerDraws} onChange={(v) => t.set({ fingerDraws: v })} label="Desenhar com o dedo" hint="Desligado, o dedo só move a tela (estilo GoodNotes)." />
        <Toggle on={t.recognize} onChange={(v) => t.set({ recognize: v })} label="Reconhecer formas" hint="O traço da caneta vira linha, retângulo, círculo, losango ou triângulo perfeitos." />
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
        <ShortcutEditor />
      </section>
    );
  } else if (tab === "areas") {
    body = <WorkspacePane />;
  } else if (tab === "dados") {
    body = (
      <section className="pane">
        <h3>Cadernos e arquivos</h3>
        <p className="hint">Os cadernos ficam salvos neste dispositivo. Exporte um arquivo .hiraku para guardar uma cópia externa.</p>
        <Toggle on={startHome} onChange={(v) => { setStartHome(v); try { localStorage.setItem(START_HOME_KEY, v ? "1" : "0"); } catch { /* sem armazenamento */ } }} label="Abrir na tela inicial" hint="Ao abrir o app, mostra os cadernos (desligado: volta direto ao último caderno)." />
        <div className="row">
          <button className="chip" onClick={() => { close(); useUI.getState().setNotebooksOpen(true); }}>Tela inicial (cadernos)</button>
          <button className="chip" onClick={() => downloadDoc(useDoc.getState().doc)}>Salvar .hiraku</button>
          <button className="chip" onClick={() => fileRef.current?.click()}>Abrir .hiraku</button>
          <input ref={fileRef} type="file" accept=".hiraku,application/json" hidden onChange={(e) => { void openFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <p className="hint">Anexos colados ou arrastados (prints, imagens, arquivos de até 15 MB) são guardados dentro do caderno.</p>
        <div className="row">
          <button className="chip" onClick={() => { close(); useExport.getState().set({ open: true, scope: "page" }); }}>Exportar PNG/JPEG/SVG/PDF…</button>
          <button className="chip" onClick={() => { close(); pickPdfAsPages(); }}>Importar PDF como páginas…</button>
        </div>
        <BackupsPane />
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
        <div className="tiles four" role="radiogroup" aria-label="Tema">
          {[...THEMES, ...theme.custom.map((c) => ({ id: c.id, label: c.label, dark: c.dark, paper: c.t.paper, chrome: c.regions?.tools ?? c.t.chrome, ink: c.t.ink, line: mixHex(c.t.chrome, c.t.ink, 0.16) }))].map((th) => (
            <button key={th.id} role="radio" aria-checked={theme.mode === th.id} className={theme.mode === th.id ? "tile theme-tile on" : "tile theme-tile"} onClick={() => theme.setMode(th.id)}>
              <span className="theme-art" style={{ background: th.id === "auto" ? `linear-gradient(135deg, ${th.paper} 50%, #0f0d1f 50%)` : th.paper }}>
                <i className="t-top" style={{ background: th.chrome, boxShadow: `0 0 0 1px ${th.line}` }} />
                <i className="t-side" style={{ background: th.chrome, boxShadow: `0 0 0 1px ${th.line}` }} />
                <i style={{ background: "transparent" }} />
                <i className="t-bar" style={{ background: th.chrome, boxShadow: `0 0 0 1px ${th.line}` }} />
              </span>
              <span>{th.id.startsWith("custom:") ? "★ " : ""}{th.label}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <button className="chip" onClick={() => theme.duplicateTheme()} title="Copia o tema atual para você editar as cores">Criar tema a partir deste…</button>
          <button className="chip" onClick={() => themeFileRef.current?.click()}>Importar tema…</button>
          {theme.custom.length > 0 && <button className="chip" onClick={() => saveText("temas-hm-ideas.json", theme.exportThemes())}>Exportar meus temas</button>}
          <input ref={themeFileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void f.text().then((txt) => { const n = theme.importThemes(txt); useUI.getState().showToast(n ? `${n} tema(s) importado(s).` : "Arquivo sem temas válidos."); }); }} />
        </div>
        {custom && <ThemeEditor def={custom} />}
        <h3>Cor de destaque</h3>
        <div className="accent-row" role="radiogroup" aria-label="Cor de destaque">
          {ACCENTS.map((a) => (
            <button key={a.id} role="radio" aria-checked={theme.accent === a.id} aria-label={a.label} title={a.label} className={theme.accent === a.id ? "accent-dot on" : "accent-dot"}
              style={{ background: `linear-gradient(135deg, ${a.second}, ${a.light})` }} onClick={() => theme.setAccent(a.id)} />
          ))}
        </div>
        <h3>Tamanho dos botões</h3>
        <Chips<Density> label="Densidade" value={theme.density} options={[["compact", "Compacto"], ["normal", "Normal"], ["large", "Grande (toque)"]]} onChange={theme.setDensity} />
        <h3>Formas e efeitos</h3>
        <Slider label="Cantos" value={theme.radius} min={0} max={1.6} step={0.1} onChange={(v) => theme.patch({ radius: v })} fmt={(v) => (v === 0 ? "retos" : v < 0.8 ? "pouco" : v > 1.2 ? "bem redondos" : "normais")} />
        <Slider label="Opacidade das barras" value={theme.opacity} min={0.7} max={1} step={0.02} onChange={(v) => theme.patch({ opacity: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        <Toggle on={theme.contrast} onChange={(v) => theme.patch({ contrast: v })} label="Contraste reforçado" hint="Linhas e contornos mais fortes, foco bem visível. Vale em qualquer tema." />
        <Toggle on={theme.anim} onChange={(v) => theme.patch({ anim: v })} label="Animações" hint="Transições de menus e painéis. Desligue para uma interface mais seca e rápida." />
        <h3>Papel e mesa</h3>
        <Chips label="Textura" value={theme.texture} options={TEXTURES.map((x) => [x.id, x.label] as [Texture, string])} onChange={(v) => theme.patch({ texture: v })} />
        {theme.texture !== "none" && <Slider label="Intensidade da textura" value={theme.textureStrength} min={0.1} max={1} step={0.05} onChange={(v) => theme.patch({ textureStrength: v })} fmt={(v) => `${Math.round(v * 100)}%`} />}
        <div className="row">
          <label className="color-field"><span>Cor da mesa (cadernos com páginas)</span><input type="color" value={theme.desk ?? "#d5dae3"} onChange={(e) => theme.patch({ desk: e.target.value })} />{theme.desk && <button onClick={() => theme.patch({ desk: null })} aria-label="Mesa automática" title="Automática">↺</button>}</label>
        </div>
        <h3>Cursor e seleção</h3>
        <Toggle on={theme.brushCursor} onChange={(v) => theme.patch({ brushCursor: v })} label="Cursor com o tamanho do pincel" hint="Mostra um círculo do tamanho e da cor do traço ao passar o mouse/caneta." />
        <div className="color-grid">
          <label className="color-field"><span>Cor da seleção</span><input type="color" value={theme.selColor} onChange={(e) => theme.patch({ selColor: e.target.value })} /><button onClick={() => theme.patch({ selColor: "#2F4B8F" })} aria-label="Padrão" title="Padrão">↺</button></label>
          <label className="color-field"><span>Cor das guias</span><input type="color" value={theme.guideColor} onChange={(e) => theme.patch({ guideColor: e.target.value })} /><button onClick={() => theme.patch({ guideColor: "#E0197D" })} aria-label="Padrão" title="Padrão">↺</button></label>
        </div>
        <h3>Espaço na tela</h3>
        <Toggle on={theme.grips === "subtle"} onChange={(v) => theme.setGrips(v ? "subtle" : "normal")} label="Alças discretas" hint="Os pontinhos de arrastar as barras ficam finos e aparecem ao passar o mouse (sobra mais espaço)." />
        <Toggle on={layout.locked} onChange={(v) => useLayout.getState().setLocked(v)} label="Travar as barras" hint="Esconde as alças: nada sai do lugar por acidente com a caneta." />
        <button className="toggle" onClick={() => { close(); useTheme.getState().setFocus(true); }}>
          <span className="toggle-text"><b>Entrar no modo foco</b><small>Esconde todas as barras e deixa só o desenho. Saia com o botão no canto ou Ctrl+.</small></span>
          <kbd>Ctrl+.</kbd>
        </button>
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
