// Desenho dos blocos nativos no Pixi, a partir das mesmas primitivas do SVG (blockDraw.ts).
import { Container, Graphics, Text } from "pixi.js";
import { AttachmentElement } from "../core/model";
import { FONT_CSS } from "../core/text";
import { anchorX, canvasMeasure, dashes, primsFor, roundRectPts } from "./blockDraw";

export function paintBlock(node: Container, el: AttachmentElement, res: number) {
  const p = primsFor(el);
  if (!p) return;
  // tudo num contêiner local (0..w, 0..h); adesivos giram em torno do centro
  const box = new Container();
  box.position.set(el.x + el.w / 2, el.y + el.h / 2);
  box.pivot.set(el.w / 2, el.h / 2);
  box.rotation = p.tilt ?? 0;
  node.addChild(box);
  const g = new Graphics();
  box.addChild(g);
  for (const r of p.rects) {
    g.roundRect(r.x, r.y, r.w, r.h, r.r).fill({ color: r.fill, alpha: r.alpha ?? 1 });
    if (r.stroke && !r.dash) g.roundRect(r.x, r.y, r.w, r.h, r.r).stroke({ color: r.stroke, width: r.sw ?? 1 });
    if (r.stroke && r.dash) for (const d of dashes(roundRectPts(r.x, r.y, r.w, r.h, r.r))) { g.moveTo(d[0].x, d[0].y); d.slice(1).forEach((q) => g.lineTo(q.x, q.y)); g.stroke({ color: r.stroke, width: r.sw ?? 1, cap: "round" }); }
  }
  for (const l of p.lines) {
    if (l.pts.length < 2) continue;
    if (l.fill) g.poly(l.pts.flatMap((q) => [q.x, q.y])).fill({ color: l.fill, alpha: l.fillAlpha ?? 1 });
    if (l.width <= 0) continue;
    for (const d of l.dash ? dashes(l.pts, 6, 5) : [l.pts]) {
      g.moveTo(d[0].x, d[0].y);
      for (let i = 1; i < d.length; i++) g.lineTo(d[i].x, d[i].y);
      g.stroke({ width: l.width, color: l.color, alpha: l.alpha ?? 1, cap: "round", join: "round" });
    }
  }
  for (const c of p.circles) {
    g.circle(c.x, c.y, c.r).fill({ color: c.fill, alpha: c.alpha ?? 1 });
    if (c.stroke) g.circle(c.x, c.y, c.r).stroke({ color: c.stroke, width: c.sw ?? 1 });
  }
  const strikes = new Graphics();
  for (const t of p.texts) {
    if (!t.text) continue;
    const tx = new Text({ text: t.text, style: { fontFamily: FONT_CSS[t.font ?? "sans"], fontSize: t.size, fill: t.color, fontWeight: t.bold ? "600" : "400", fontStyle: t.italic ? "italic" : "normal" } });
    tx.resolution = res;
    tx.alpha = t.alpha ?? 1;
    tx.anchor.set(anchorX(t), 0);
    tx.position.set(t.x, t.y);
    if (t.angle) tx.rotation = t.angle;
    box.addChild(tx);
    if (t.strike) {
      const w = canvasMeasure(t.text, t.size, t.font, t.bold);
      const x0 = t.x - w * anchorX(t);
      strikes.moveTo(x0, t.y + t.size * 0.62).lineTo(x0 + w, t.y + t.size * 0.62);
    }
  }
  strikes.stroke({ width: 1.4, color: 0x9aa3b2 });
  box.addChild(strikes);
}
