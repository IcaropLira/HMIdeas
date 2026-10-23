// Desenho do traço de tinta no Pixi. A malha vem de core/strokeMesh.ts (pura); aqui só se pinta.
// O MESMO código desenha o traço ao vivo e o gravado → nada "salta" ao soltar a caneta.
//
// Cada traço é um Container com UM Mesh de triângulos (sem triangulação de polígono, sem earcut).
//  • Traço opaco e normal: o Mesh é pintado direto (o caminho rápido, o das canetas).
//  • Traço translúcido ou com mistura (marca-texto): o Mesh vira MÁSCARA de stencil de um retângulo da cor
//    do traço. Resultado: a opacidade/mistura vale para o traço INTEIRO (a união dos triângulos), então
//    cruzar o próprio traço não escurece nem forma manchas, e o multiply funciona (filtros perdem a cor
//    com multiply no Pixi, e sem MSAA ficam serrilhados).
import { Container, Graphics, Mesh, MeshGeometry, Texture } from "pixi.js";
import { InkStyle, StrokeMesh, buildStrokeMesh, dynOf, styleOf } from "../core/ink";
import { InkPoint, StrokeElement } from "../core/model";

export type { InkStyle };

export class InkNode extends Container {
  private geo = new MeshGeometry({
    positions: new Float32Array(6),
    uvs: new Float32Array(6),
    indices: new Uint32Array(3),
  });
  private mesh = new Mesh({ geometry: this.geo, texture: Texture.WHITE });
  private fill = new Graphics();
  private masked = false;

  constructor() {
    super();
    this.geo.batchMode = "no-batch";
    this.addChild(this.mesh, this.fill);
    this.fill.visible = false;
    this.mesh.visible = false;
  }

  /** Recalcula a malha. Custo linear nos pontos do traço (não da página). */
  setStroke(points: InkPoint[], st: InkStyle) {
    const m: StrokeMesh | null = buildStrokeMesh(points, st);
    const blend = dynOf(st).blend;
    this.masked = st.opacity < 0.999 || blend !== "normal";
    this.mesh.tint = st.color;

    if (!m || m.indices.length < 3) {
      this.mesh.visible = false;
      this.fill.visible = false;
      this.mask = null;
      return;
    }
    this.geo.uvs = new Float32Array(m.positions.length); // textura branca: o uv não importa
    this.geo.positions = m.positions;
    this.geo.indices = m.indices;
    this.mesh.position.set(m.ox, m.oy);
    this.mesh.visible = true;

    if (this.masked) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const p = m.positions;
      for (let i = 0; i < p.length; i += 2) {
        if (p[i] < x0) x0 = p[i];
        if (p[i] > x1) x1 = p[i];
        if (p[i + 1] < y0) y0 = p[i + 1];
        if (p[i + 1] > y1) y1 = p[i + 1];
      }
      this.fill.clear().rect(x0 + m.ox - 1, y0 + m.oy - 1, x1 - x0 + 2, y1 - y0 + 2).fill({ color: st.color });
      this.fill.alpha = st.opacity;
      this.fill.blendMode = blend;
      this.fill.visible = true;
      this.mask = this.mesh; // o próprio Mesh recorta o retângulo (e não é pintado)
    } else {
      this.fill.visible = false;
      this.mask = null;
    }
  }

  /** Alpha de "fantasma" (borracha): multiplica o do traço sem perder a opacidade real. */
  setGhost(alpha: number | null) {
    this.alpha = alpha ?? 1;
  }
}

export function drawStrokeElement(node: InkNode, el: StrokeElement) {
  node.setStroke(el.points, styleOf(el));
}
