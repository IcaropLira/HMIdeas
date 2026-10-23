// Desenho de nós de mapa mental e de quadros. Só desenha; a estrutura vive em core/mindmap.ts.
// Cada elemento é um Container com filhos fixos [Graphics, rótulo, marcador, bolinha] reaproveitados a cada
// repintura (arrastar um ramo repinta dezenas de nós por frame: nada de criar/destruir Text à toa).
import { Container, Graphics, Text } from "pixi.js";
import { FrameElement, NodeElement } from "../core/model";
import { badgeCenter, branchPath, growDir, readableOn, tint } from "../core/mindmap";
import { Pt, shapePath } from "../core/shapes";
import { FONT_CSS, LINE_HEIGHT } from "../core/text";

const flat = (pts: Pt[]) => pts.flatMap((p) => [p.x, p.y]);

function parts(host: Container): [Graphics, Text, Text, Text] {
  if (host.children.length < 4) {
    for (const c of host.removeChildren()) c.destroy();
    const mk = () => new Text({ text: "", style: { fontSize: 14 } });
    host.addChild(new Graphics(), mk(), mk(), mk());
  }
  return host.children as unknown as [Graphics, Text, Text, Text];
}

export interface NodeCtx {
  parent: NodeElement | null;
  root: NodeElement | null;
  kids: number;
  res: number;
}

export function paintNode(host: Container, el: NodeElement, ctx: NodeCtx) {
  const [g, label, icon, badge] = parts(host);
  g.clear();
  host.visible = !el.hidden;
  host.alpha = el.opacity;
  if (el.hidden) { label.visible = icon.visible = badge.visible = false; return; }

  // ramo até o pai (por baixo do nó)
  if (ctx.parent && !ctx.parent.hidden) {
    const vertical = ctx.root?.layout === "down";
    const pts = branchPath(ctx.parent, el, ctx.root?.branchStyle ?? "curve", !!vertical);
    g.poly(flat(pts), false).stroke({ width: Math.max(2, el.strokeWidth * 1.6), color: el.branchColor, cap: "round", join: "round" });
  }

  // corpo
  const stroke = el.stroke ?? null;
  if (el.shape === "underline") {
    g.moveTo(el.x, el.y + el.h).lineTo(el.x + el.w, el.y + el.h).stroke({ width: el.strokeWidth + 0.5, color: stroke ?? el.branchColor, cap: "round" });
  } else if (el.shape !== "none") {
    const poly = flat(shapePath(el));
    if (el.fill) g.poly(poly, true).fill({ color: el.fill });
    if (stroke) g.poly(poly, true).stroke({ width: el.strokeWidth, color: stroke, join: "round" });
  }

  // rótulo + marcador
  const iconW = el.icon ? el.fontSize * 1.35 : 0;
  const fill = el.color;
  label.visible = true;
  label.text = el.text;
  label.style.fontFamily = FONT_CSS[el.fontFamily];
  label.style.fontSize = el.fontSize;
  label.style.fill = fill;
  label.style.align = "center";
  label.style.lineHeight = el.fontSize * LINE_HEIGHT;
  label.style.fontWeight = "400";
  label.resolution = ctx.res;
  label.anchor.set(0.5);
  label.position.set(el.x + el.w / 2 + iconW / 2, el.y + el.h / 2);
  label.alpha = el.done ? 0.55 : 1;
  icon.visible = !!el.icon;
  if (el.icon) {
    icon.text = el.icon;
    icon.style.fontSize = el.fontSize;
    icon.style.fill = fill;
    icon.resolution = ctx.res;
    icon.anchor.set(0.5);
    icon.position.set(el.x + (el.shape === "underline" || el.shape === "none" ? 4 : 12) + iconW / 2 - 2, el.y + el.h / 2);
  }
  if (el.done) {
    const lw = label.width;
    g.moveTo(el.x + el.w / 2 + iconW / 2 - lw / 2, el.y + el.h / 2).lineTo(el.x + el.w / 2 + iconW / 2 + lw / 2, el.y + el.h / 2)
      .stroke({ width: 1.6, color: fill, alpha: 0.7 });
  }

  // bolinha de recolher (mostra a quantidade de nós escondidos)
  badge.visible = false;
  if (ctx.kids > 0 && el.collapsed) {
    const c = badgeCenter(el, ctx.root);
    const col = el.branchColor;
    g.circle(c.x, c.y, 9).fill({ color: col }).stroke({ width: 1.5, color: "#FFFFFF" });
    badge.visible = true;
    badge.text = String(ctx.kids > 99 ? "99+" : ctx.kids);
    badge.style.fontFamily = FONT_CSS.sans;
    badge.style.fontSize = 10;
    badge.style.fontWeight = "700";
    badge.style.fill = readableOn(col);
    badge.resolution = ctx.res;
    badge.anchor.set(0.5);
    badge.position.set(c.x, c.y);
  }
  void growDir;
}

export function paintFrame(host: Container, el: FrameElement, res: number) {
  const [g, label, icon, badge] = parts(host);
  g.clear();
  icon.visible = badge.visible = false;
  host.alpha = el.opacity;
  const poly = flat(shapePath(el));
  if (el.tint > 0) g.poly(poly, true).fill({ color: el.color, alpha: el.tint });
  g.poly(poly, true).stroke({ width: Math.max(1, el.strokeWidth), color: el.color, alpha: 0.9, join: "round" });
  label.visible = !!el.title;
  label.text = el.title;
  label.style.fontFamily = FONT_CSS.sans;
  label.style.fontSize = 14;
  label.style.fontWeight = "600";
  label.style.fill = tint(el.color, 0);
  label.resolution = res;
  label.anchor.set(0, 1);
  label.position.set(el.x + 2, el.y - 5);
}
