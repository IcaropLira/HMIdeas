// O desenho (PixiJS) precisa de WebGL. Sem ele o quadro ficaria em branco sem explicação:
// aqui detectamos isso e guardamos o motivo para a UI mostrar um aviso (components/WebGLNotice.tsx).
import { create } from "zustand";

export type GfxProblem = "no-webgl" | "init-failed";

export const useGfx = create<{ problem: GfxProblem | null }>(() => ({ problem: null }));

type Probe = { getContext: (id: string) => unknown };

/**
 * O navegador consegue criar um contexto WebGL? Testa num canvas descartável (o canvas real só pode
 * receber um contexto) e pede o mesmo que o Pixi: WebGL2 e, se não houver, WebGL1.
 * WebGL por software conta como disponível: o que importa é o app conseguir desenhar.
 */
export function detectWebGL(make: () => Probe = () => document.createElement("canvas") as unknown as Probe): boolean {
  try {
    const canvas = make();
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext(); // devolve o contexto (o navegador limita quantos existem)
    return true;
  } catch {
    return false;
  }
}
