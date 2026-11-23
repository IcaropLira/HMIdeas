// Se algo quebrar ao desenhar a interface, mostra uma tela de recuperação em vez de uma tela vazia.
import { Component, ReactNode } from "react";

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error) { console.error("HM Ideas: erro na interface", error); }
  render() {
    const e = this.state.error;
    if (!e) return this.props.children;
    const reset = (keys: string[]) => { try { keys.forEach((k) => localStorage.removeItem(k)); } catch { /* sem armazenamento */ } location.reload(); };
    return (
      <div className="crash">
        <div className="crash-card">
          <strong>Algo deu errado ao abrir a interface</strong>
          <p>Seus cadernos continuam salvos neste dispositivo. Tente recarregar; se continuar, restaure as preferências da interface (barras, tema e tela inicial) — isso não apaga nenhum caderno.</p>
          <code>{e.message}</code>
          <div className="crash-actions">
            <button className="btn primary" onClick={() => location.reload()}>Recarregar</button>
            <button className="btn" onClick={() => reset(["hm-ideas-layout-v1", "hm-ideas-theme-v1", "hm-ideas:start-home", "hmideas-tool"])}>Restaurar preferências da interface</button>
          </div>
        </div>
      </div>
    );
  }
}
