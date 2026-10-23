import { isTauri } from "../core/updater";
import { GfxProblem, useGfx } from "../core/webgl";

/** Texto do aviso (puro, para testar sem DOM). */
export function WebGLNoticeView({ problem, downloadHref }: { problem: GfxProblem; downloadHref?: string }) {
  return (
    <div className="gfx-notice" role="alert">
      <div className="gfx-card">
        <strong>
          {problem === "no-webgl" ? "O WebGL está desativado neste navegador" : "Não consegui iniciar o desenho"}
        </strong>
        <p>
          O HM Ideas desenha com WebGL (aceleração gráfica). Sem ele o quadro fica em branco, mesmo com o site
          carregado normalmente.
        </p>
        <p>
          <b>Chrome / Edge:</b> em Configurações → Sistema, ative “Usar aceleração de hardware quando disponível” e
          reinicie o navegador. Depois confira em <code>chrome://gpu</code> se a linha “WebGL” aparece como ativa.
        </p>
        <p>
          <b>Firefox / Safari:</b> costumam funcionar de fábrica. Se não funcionar, atualize o navegador e os drivers
          de vídeo.
        </p>
        {downloadHref && (
          <p>
            Outra opção: <a href={downloadHref}>instalar o app para desktop ou Android</a>.
          </p>
        )}
        <button className="btn text" onClick={() => window.location.reload()}>Tentar de novo</button>
      </div>
    </div>
  );
}

/** Aparece por cima do quadro quando o WebGL não está disponível (ver core/webgl.ts). */
export function WebGLNotice() {
  const problem = useGfx((s) => s.problem);
  if (!problem) return null;
  return <WebGLNoticeView problem={problem} downloadHref={isTauri() ? undefined : `${import.meta.env.BASE_URL}download.html`} />;
}
