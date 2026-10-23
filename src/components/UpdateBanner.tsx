import { dismissUpdate, installUpdate, useUpdate } from "../core/updater";

/** Aviso de nova versão (desktop, Android e site). */
export function UpdateBanner() {
  const u = useUpdate();
  if (u.dismissed || (u.status !== "available" && u.status !== "downloading" && u.status !== "installing")) return null;
  const busy = u.status !== "available";
  const label =
    u.kind === "link" ? "Baixar" : u.kind === "pwa" ? "Recarregar" : "Atualizar";
  return (
    <div className="update-banner" role="status" aria-live="polite">
      <div className="update-text">
        <strong>{u.version ? `Nova versão ${u.version}` : "Nova versão disponível"}</strong>
        <span>
          {u.status === "downloading"
            ? `Baixando${u.progress != null ? ` ${Math.round(u.progress * 100)}%` : "…"}`
            : u.status === "installing"
              ? "Instalando… o app vai reiniciar."
              : u.kind === "link"
                ? "Baixe e instale por cima; seus arquivos ficam como estão."
                : "Seu desenho é guardado automaticamente."}
        </span>
        {u.status === "downloading" && <progress className="update-bar" max={1} value={u.progress ?? undefined} />}
      </div>
      {!busy && (
        <>
          <button className="btn text" onClick={() => void installUpdate()}>{label}</button>
          <button className="btn text" onClick={dismissUpdate} aria-label="Lembrar depois">Depois</button>
        </>
      )}
    </div>
  );
}
