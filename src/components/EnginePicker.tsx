// Escolha do motor do pincel (0.17): perfis prontos (Fluido, Krita, Photoshop, Clip Studio) e ajuste fino
// (que vira o perfil "Personalizado"). Só afeta os PRÓXIMOS traços: cada traço guarda o que usou.
import { CURVES, ENGINES, EngineCfg, EngineId, PressureCurve, STABILIZERS, Stabilizer, engineDef, pressureCurve } from "../core/engine";
import { activeEngineCfg, useTool } from "../core/store";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Gráfico pequeno da curva de pressão. */
function CurveIcon({ c }: { c: PressureCurve }) {
  const d = Array.from({ length: 17 }, (_, i) => { const x = i / 16; return `${i ? "L" : "M"}${(2 + x * 20).toFixed(1)} ${(22 - pressureCurve(x, c) * 20).toFixed(1)}`; }).join("");
  return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M2 22H22M2 22V2" stroke="currentColor" strokeOpacity=".3" fill="none" /><path d={d} stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>;
}

export function setEngine(id: EngineId) {
  const t = useTool.getState();
  if (id === "custom") t.set({ engine: "custom", engineCfg: activeEngineCfg() });
  else t.set({ engine: id });
}

export function EnginePicker({ compact = false }: { compact?: boolean }) {
  const engine = useTool((t) => t.engine);
  useTool((t) => t.engineCfg);
  const cfg = activeEngineCfg();
  const edit = (p: Partial<EngineCfg>) => useTool.getState().set({ engine: "custom", engineCfg: { ...cfg, ...p } });
  if (compact) {
    return (
      <select className="engine-select" value={engine} onChange={(e) => setEngine(e.target.value as EngineId)} aria-label="Motor do pincel" title="Motor do pincel: como o traço segue a mão">
        {ENGINES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        <option value="custom">Personalizado</option>
      </select>
    );
  }
  const def = engine === "custom" ? null : engineDef(engine);
  return (
    <div className="engine">
      <div className="engine-cards" role="radiogroup" aria-label="Motor do pincel">
        {ENGINES.map((e) => (
          <button key={e.id} role="radio" aria-checked={engine === e.id} className={engine === e.id ? "engine-card on" : "engine-card"} onClick={() => setEngine(e.id)} title={e.hint}>
            <b>{e.label}</b><small>{e.like}</small>
          </button>
        ))}
        <button role="radio" aria-checked={engine === "custom"} className={engine === "custom" ? "engine-card on" : "engine-card"} onClick={() => setEngine("custom")} title="Seus próprios ajustes (mexer em qualquer controle abaixo cria este perfil)">
          <b>Personalizado</b><small>seus ajustes</small>
        </button>
      </div>
      <p className="hint">{def ? def.hint : "Ajustes seus. Escolha um perfil acima para voltar a um pronto."}</p>
      <details className="engine-adv">
        <summary>Ajustes do motor</summary>
        <div className="engine-body">
          <div className="row" role="radiogroup" aria-label="Ponta">
            <span className="rowlabel">Ponta</span>
            <button role="radio" aria-checked={cfg.render === "ribbon"} className={cfg.render === "ribbon" ? "chip on" : "chip"} onClick={() => edit({ render: "ribbon" })} title="Contorno vetorial contínuo: o mais liso e leve">Fita (vetor)</button>
            <button role="radio" aria-checked={cfg.render === "dab"} className={cfg.render === "dab" ? "chip on" : "chip"} onClick={() => edit({ render: "dab" })} title="Carimbos com espaçamento, dureza e fluxo (Krita/Photoshop/CSP)">Carimbos</button>
          </div>
          <div className="row" role="radiogroup" aria-label="Estabilizador">
            <span className="rowlabel">Estabilizador</span>
            {STABILIZERS.map((s) => <button key={s.id} role="radio" aria-checked={cfg.stabilizer === s.id} className={cfg.stabilizer === s.id ? "chip on" : "chip"} title={s.hint} onClick={() => edit({ stabilizer: s.id as Stabilizer })}>{s.label}</button>)}
          </div>
          <label className="slider" title="Somado ao controle Estabilizar da barra"><span>Força extra</span><input type="range" min={0} max={1} step={0.05} value={cfg.stabBoost} onChange={(e) => edit({ stabBoost: +e.target.value })} /><output>{pct(cfg.stabBoost)}</output></label>
          <button className={cfg.catchUp ? "chip on" : "chip"} aria-pressed={cfg.catchUp} onClick={() => edit({ catchUp: !cfg.catchUp })} title="Ao soltar, a ponta alcança o cursor (linha de chegada)">Alcançar o cursor ao soltar</button>
          <div className="row" role="radiogroup" aria-label="Curva da pressão">
            <span className="rowlabel">Curva da pressão</span>
            {CURVES.map((c) => <button key={c.id} role="radio" aria-checked={cfg.curve === c.id} className={cfg.curve === c.id ? "chip on curve" : "chip curve"} onClick={() => edit({ curve: c.id })}><CurveIcon c={c.id} />{c.label}</button>)}
          </div>
          <label className="slider" title="A pressão só vale inteira depois de andar esta distância (em larguras do traço). Evita a bolinha ao apoiar a caneta."><span>Entrada suave</span><input type="range" min={0} max={4} step={0.1} value={cfg.rampIn} onChange={(e) => edit({ rampIn: +e.target.value })} /><output>{cfg.rampIn ? `${cfg.rampIn.toFixed(1)}×` : "não"}</output></label>
          <label className="slider" title="Com caneta: negativo = traço rápido fica mais fino (tinta); positivo = mais grosso"><span>Velocidade → espessura</span><input type="range" min={-1} max={1} step={0.05} value={cfg.speedSize} onChange={(e) => edit({ speedSize: +e.target.value })} /><output>{cfg.speedSize > 0.01 ? `+${pct(cfg.speedSize)}` : cfg.speedSize < -0.01 ? `−${pct(-cfg.speedSize)}` : "não"}</output></label>
          <label className="slider" title="Alisa o caminho depois de desenhado (pós-correção do Clip Studio)"><span>Pós-correção</span><input type="range" min={0} max={1} step={0.05} value={cfg.postSmooth} onChange={(e) => edit({ postSmooth: +e.target.value })} /><output>{pct(cfg.postSmooth)}</output></label>
          {cfg.render === "dab" && <label className="slider" title="Carimbos ficam mais claros com pouca pressão"><span>Pressão → opacidade</span><input type="range" min={0} max={1} step={0.05} value={cfg.pressureOpacity} onChange={(e) => edit({ pressureOpacity: +e.target.value })} /><output>{pct(cfg.pressureOpacity)}</output></label>}
          <p className="hint">O motor vale para os próximos traços; cada traço guarda o que usou. Marca-texto é sempre fita; aerógrafo, lápis, caligrafia e pincel redondo são sempre carimbos.</p>
        </div>
      </details>
    </div>
  );
}
