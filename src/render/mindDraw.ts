// Desenho de nós de mapa mental e de quadros. Só desenha; a estrutura vive em core/mindmap.ts.
// Cada elemento é um Container com filhos fixos [Graphics, rótulo, marcador, bolinha] reaproveitados a cada
// repintura (arrastar um ramo repinta dezenas de nós por frame: nada de criar/destruir Text à toa).
import { Container, Graphics, Sprite, Text } from "pixi.js";
import { loadImageTexture, peekImageTexture } from "./imageTexture";
import { FrameElement, NodeElement } from "../core/model";
import { badgeCenter, branchPath, growDir, nodeLayout, readableOn, tint } from "../core/mindmap";
import { Pt, shapePath } from "../core/shapes";
import { FONT_CSS, LINE_HEIGHT, measureBlock } from "../core/text";

const flat = (pts: Pt[]) => pts.flatMap((p) => [p.x, p.y]);

function parts(host: Container): [Graphics, Text, Text, Text, Container] {
  if (host.children.length < 5) {
    for (const c of host.removeChildren()) c.destroy({ children: true });
    const mk = () => new Text({ text: "", style: { fontSize: 14 } });
    host.addChild(new Graphics(), mk(), mk(), mk(), new Container());
  }
  return host.children as unknown as [Graphics, Text, Text, Text, Container];
}

const extrasKey = new WeakMap<Container, string>();
const hasExtras = (el: NodeElement) => !!(el.image || el.tags?.length || el.due || el.progress !== undefined || el.note || el.link || el.shape === "card");

export interface NodeCtx {
  parent: NodeElement | null;
  root: NodeElement | null;
  kids: number;
  res: number;
}

export function paintNode(host: Container, el: NodeElement, ctx: NodeCtx) {
  const [g, label, icon, badge, extras] = parts(host);
  g.clear();
  for (const c of extras.removeChildren()) c.destroy({ children: true });
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
  } else if (el.shape !== "none" && el.shape !== "card") {
    const poly = flat(shapePath(el));
    if (el.fill) g.poly(poly, true).fill({ color: el.fill });
    if (stroke) g.poly(poly, true).stroke({ width: el.strokeWidth, color: stroke, join: "round" });
  }

  // cartão: sombra suave por baixo
  if (el.shape === "card") {
    const sh = flat(shapePath({ ...el, x: el.x + 2, y: el.y + 3 }));
    g.poly(sh, true).fill({ color: 0x1b2233, alpha: 0.08 });
    g.poly(flat(shapePath(el)), true).fill({ color: el.fill ?? "#FFFFFF" });
    if (stroke) g.poly(flat(shapePath(el)), true).stroke({ width: el.strokeWidth, color: stroke, join: "round" });
  }

  // conteúdo extra: imagem, nota (cartão), etiquetas, data, progresso, link
  const L = hasExtras(el) ? nodeLayout(el, (t, f, sz) => measureBlock(t, f, sz)) : null;
  if (L) paintExtras(extras, g, el, L, ctx.res);

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
  const labelY = L ? el.y + L.labelY : el.y + el.h / 2;
  if (L?.left) {
    label.style.align = "left";
    label.style.fontWeight = "600";
    label.anchor.set(0, 0.5);
    label.position.set(el.x + 14 + iconW, labelY);
  } else {
    label.anchor.set(0.5);
    label.position.set(el.x + el.w / 2 + iconW / 2, labelY);
  }
  label.alpha = el.done ? 0.55 : 1;
  icon.visible = !!el.icon;
  if (el.icon) {
    icon.text = el.icon;
    icon.style.fontSize = el.fontSize;
    icon.style.fill = fill;
    icon.resolution = ctx.res;
    icon.anchor.set(0.5);
    icon.position.set(el.x + (el.shape === "underline" || el.shape === "none" ? 4 : 12) + iconW / 2 - 2, labelY);
  }
  if (el.done) {
    const lw = label.width;
    const lx = L?.left ? el.x + 14 + iconW + lw / 2 : el.x + el.w / 2 + iconW / 2;
    g.moveTo(lx - lw / 2, labelY).lineTo(lx + lw / 2, labelY)
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

function paintExtras(box: Container, g: Graphics, el: NodeElement, L: ReturnType<typeof nodeLayout>, res: number) {
  const txt = (text: string, size: number, fill: string, weight: "400" | "600" | "700" = "400") => {
    const t = new Text({ text, style: { fontFamily: FONT_CSS[el.fontFamily], fontSize: size, fill, fontWeight: weight, lineHeight: size * LINE_HEIGHT } });
    t.resolution = res;
    return t;
  };
  if (L.img && el.image) {
    const r = L.img;
    const x = el.x + r.x, y = el.y + r.y;
    g.roundRect(x, y, r.w, r.h, 6).fill({ color: 0xeef1f7 });
    const put = (tex: import("pixi.js").Texture) => {
      const sp = new Sprite(tex);
      sp.position.set(x, y);
      sp.width = r.w; sp.height = r.h;
      const mask = new Graphics().roundRect(x, y, r.w, r.h, 6).fill({ color: 0xffffff });
      box.addChild(mask, sp);
      sp.mask = mask;
    };
    const src = el.image;
    extrasKey.set(box, src);
    const hit = peekImageTexture(src);
    if (hit) put(hit);
    else void loadImageTexture(src).then((tex) => { if (tex && !box.destroyed && extrasKey.get(box) === src) put(tex); });
  }
  if (L.note) {
    const t = txt(L.note.lines.join("\n"), L.note.size, "#52627A");
    t.position.set(el.x + 14, el.y + L.note.y);
    box.addChild(t);
  }
  if (L.chips) {
    const size = Math.max(10, Math.round(el.fontSize * 0.6));
    const total = L.chips.items.reduce((s, c) => s + c.w + 4, -4);
    let x = L.left ? el.x + 14 : el.x + (el.w - total) / 2;
    for (const c of L.chips.items) {
      g.roundRect(x, el.y + L.chips.y, c.w, size + 6, (size + 6) / 2).fill({ color: c.color, alpha: 0.16 });
      const t = txt(c.text, size, c.color, "600");
      t.position.set(x + 6, el.y + L.chips.y + 2);
      box.addChild(t);
      x += c.w + 4;
    }
  }
  if (L.bar) {
    const pad = L.left ? 14 : 10;
    const w = el.w - pad * 2, y = el.y + L.bar.y;
    const dark = el.fill ? readableOn(el.fill) === "#FFFFFF" : false;
    g.roundRect(el.x + pad, y, w, 5, 2.5).fill({ color: dark ? 0xffffff : 0x1b2233, alpha: dark ? 0.25 : 0.1 });
    if (L.bar.value > 0) g.roundRect(el.x + pad, y, Math.max(5, (w * L.bar.value) / 100), 5, 2.5).fill({ color: L.bar.value >= 100 ? "#2E9B5F" : el.branchColor });
  }
  // marcas no canto: nota (fora do cartão) e link
  const marks = [el.note && !L.note ? "📝" : "", el.link ? "🔗" : ""].filter(Boolean).join("");
  if (marks) {
    const t = txt(marks, 11, "#52627A");
    t.anchor.set(1, 0);
    t.position.set(el.x + el.w + 4, el.y - 10);
    box.addChild(t);
  }
}

export function paintFrame(host: Container, el: FrameElement, res: number) {
  const [g, label, icon, badge, extras] = parts(host);
  g.clear();
  for (const c of extras.removeChildren()) c.destroy({ children: true });
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
