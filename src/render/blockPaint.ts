// Desenho dos blocos nativos no Pixi, a partir das mesmas primitivas do SVG (blockDraw.ts).
import { Container, Graphics, Text } from "pixi.js";
import { AttachmentElement } from "../core/model";
import { FONT_CSS } from "../core/text";
import { anchorX, canvasMeasure, primsFor } from "./blockDraw";

export function paintBlock(node: Container, el: AttachmentElement, res: number) {
  const p = primsFor(el);
  if (!p) return;
  const g = new Graphics();
  g.position.set(el.x, el.y);
  node.addChild(g);
  for (const r of p.rects) {
    g.roundRect(r.x, r.y, r.w, r.h, r.r).fill({ color: r.fill, alpha: r.alpha ?? 1 });
    if (r.stroke) g.roundRect(r.x, r.y, r.w, r.h, r.r).stroke({ color: r.stroke, width: r.sw ?? 1 });
  }
  for (const l of p.lines) {
    if (l.pts.length < 2) continue;
    g.moveTo(l.pts[0].x, l.pts[0].y);
    for (let i = 1; i < l.pts.length; i++) g.lineTo(l.pts[i].x, l.pts[i].y);
    g.stroke({ width: l.width, color: l.color, alpha: l.alpha ?? 1, cap: "round", join: "round" });
  }
  for (const c of p.circles) {
    g.circle(c.x, c.y, c.r).fill({ color: c.fill });
    if (c.stroke) g.circle(c.x, c.y, c.r).stroke({ color: c.stroke, width: c.sw ?? 1 });
  }
  const strikes = new Graphics();
  strikes.position.set(el.x, el.y);
  for (const t of p.texts) {
    if (!t.text) continue;
    const tx = new Text({ text: t.text, style: { fontFamily: FONT_CSS[t.font ?? "sans"], fontSize: t.size, fill: t.color, fontWeight: t.bold ? "600" : "400" } });
    tx.resolution = res;
    tx.alpha = t.alpha ?? 1;
    tx.anchor.set(anchorX(t), 0);
    tx.position.set(el.x + t.x, el.y + t.y);
    node.addChild(tx);
    if (t.strike) {
      const w = canvasMeasure(t.text, t.size, t.font, t.bold);
      const x0 = t.x - w * anchorX(t);
      strikes.moveTo(x0, t.y + t.size * 0.62).lineTo(x0 + w, t.y + t.size * 0.62);
    }
  }
  strikes.stroke({ width: 1.4, color: 0x9aa3b2 });
  node.addChild(strikes);
}

