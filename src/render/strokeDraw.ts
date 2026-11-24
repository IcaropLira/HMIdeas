// Desenho do traço de tinta no Pixi. A malha vem de core/strokeMesh.ts (pura); aqui só se pinta.
// O MESMO código desenha o traço ao vivo e o gravado → nada "salta" ao soltar a caneta.
//
// Cada traço é um Container com UM Mesh de triângulos (sem triangulação de polígono, sem earcut).
//  • Traço opaco e normal: o Mesh é pintado direto (o caminho rápido, o das canetas).
//  • Traço translúcido ou com mistura (marca-texto): o Mesh vira MÁSCARA de stencil de um retângulo da cor
//    do traço. Resultado: a opacidade/mistura vale para o traço INTEIRO (a união dos triângulos), então
//    cruzar o próprio traço não escurece nem forma manchas, e o multiply funciona (filtros perdem a cor
//    com multiply no Pixi, e sem MSAA ficam serrilhados).
import { Container, Graphics, Mesh, MeshGeometry, Particle, ParticleContainer, Rectangle, Texture } from "pixi.js";
import { InkStyle, StrokeMesh, buildStrokeMesh, dynOf, styleOf } from "../core/ink";
import { buildStrokeDabs, usesDabs } from "../core/strokeMesh";
import { DEFAULT_TIP } from "../core/engine";

/** Textura de um carimbo redondo com a dureza dada (cache por degrau de 0.1). Lado de 128 px. */
const TIP_PX = 128;
const tipCache = new Map<number, Texture>();
function tipTexture(hardness: number): Texture {
  const k = Math.round(Math.max(0, Math.min(1, hardness)) * 10);
  let t = tipCache.get(k);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = c.height = TIP_PX;
  const g = c.getContext("2d")!;
  const r = TIP_PX / 2, h = k / 10;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  // dureza 1: borda dura com ~1.5 px de antisserrilhado; dureza 0: cai suave desde o centro (aerógrafo)
  const inner = Math.min(0.985, h * 0.97);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(inner, "rgba(255,255,255,1)");
  if (h < 1) grad.addColorStop(inner + (1 - inner) * 0.5, `rgba(255,255,255,${0.35 + 0.3 * h})`);
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, TIP_PX, TIP_PX);
  t = Texture.from(c);
  tipCache.set(k, t);
  return t;
}
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
  /** Carimbos (motor de carimbos): criados sob demanda; partículas são reaproveitadas entre quadros. */
  private dabs: ParticleContainer | null = null;

  constructor() {
    super();
    this.geo.batchMode = "no-batch";
    this.addChild(this.mesh, this.fill);
    this.fill.visible = false;
    this.mesh.visible = false;
  }

  /** Desenha como carimbos (cada um uma partícula com a textura da dureza, escala, giro e alfa). */
  private setDabs(points: InkPoint[], st: InkStyle) {
    this.mesh.visible = false;
    this.fill.visible = false;
    this.mask = null;
    if (!this.dabs) {
      this.dabs = new ParticleContainer({ dynamicProperties: { position: true, vertex: true, rotation: true, color: true, uvs: false } });
      this.addChild(this.dabs);
    }
    const pc = this.dabs;
    pc.visible = true;
    const dyn = dynOf(st);
    const tex = tipTexture(dyn.tip?.hardness ?? DEFAULT_TIP.hardness);
    const list = buildStrokeDabs(points, st);
    const kids = pc.particleChildren as Particle[];
    const round = dyn.tip?.roundness ?? 1;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      let p = kids[i];
      if (!p || p.texture !== tex) { p = new Particle({ texture: tex, anchorX: 0.5, anchorY: 0.5 }); kids[i] = p; }
      const s = (2 * d.r) / TIP_PX;
      p.x = d.x; p.y = d.y; p.scaleX = s; p.scaleY = s * round; p.rotation = d.rot;
      p.tint = st.color; p.alpha = Math.max(0, Math.min(1, d.a * st.opacity));
      if (d.x - d.r < x0) x0 = d.x - d.r;
      if (d.y - d.r < y0) y0 = d.y - d.r;
      if (d.x + d.r > x1) x1 = d.x + d.r;
      if (d.y + d.r > y1) y1 = d.y + d.r;
    }
    kids.length = list.length;
    pc.blendMode = dyn.blend;
    if (list.length) pc.boundsArea = new Rectangle(x0, y0, x1 - x0, y1 - y0);
    pc.update();
  }

  /** Recalcula a malha. Custo linear nos pontos do traço (não da página). */
  setStroke(points: InkPoint[], st: InkStyle) {
    if (usesDabs(st)) { this.setDabs(points, st); return; }
    if (this.dabs) { this.dabs.visible = false; this.dabs.particleChildren.length = 0; this.dabs.update(); }
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
