// Camada ÚNICA de entrada. Normaliza mouse / caneta / toque em eventos de alto nível.
// As ferramentas nunca falam com PointerEvent direto: só com estes callbacks.
// Assim o mesmo código funciona em desktop, Android e iPad (PWA).

export interface Sample {
  /** Coordenadas em pixels CSS relativos ao canvas. */
  x: number;
  y: number;
  /** 0..1 */
  pressure: number;
  tiltX: number;
  tiltY: number;
  pointerType: string;
  time: number;
  /** Ponta "borracha" da caneta (Apple Pencil não tem; S Pen/Wacom sim). */
  eraserTip: boolean;
  shift: boolean;
  alt: boolean;
}

export interface InputHandlers {
  drawStart(s: Sample): void;
  /** `predicted`: pontos que o navegador PREVÊ à frente da caneta (só para o traço ao vivo; nunca são gravados). */
  drawMove(samples: Sample[], predicted?: Sample[]): void;
  drawEnd(sample: Sample): void;
  drawCancel(): void;
  pan(dx: number, dy: number): void;
  /** factor multiplicativo, centro em coordenadas da tela. */
  zoom(factor: number, cx: number, cy: number): void;
  /** Mouse/caneta pairando sem tocar (para mostrar o anel da borracha). */
  hover?(s: Sample): void;
  hoverEnd?(): void;
  /** Botão direito solto sem ter arrastado (arrastar com ele continua sendo "mover a tela"). */
  contextTap?(s: Sample): void;
}

export interface InputConfig {
  /** Retorna a ferramenta ativa: "pen" desenha, "hand" só move. */
  getTool(): string;
  getFingerDraws(): boolean;
}

/** Depois de ver uma caneta, ignora toques por este tempo (rejeição de palma simples). */
const PALM_REJECT_MS = 1200;

type Mode = "idle" | "draw" | "pan" | "pinch";

export class InputController {
  private mode: Mode = "idle";
  private drawPointerId: number | null = null;
  private panPointerId: number | null = null;
  private touches = new Map<number, { x: number; y: number }>();
  private lastPenTime = -Infinity;
  private lastPan = { x: 0, y: 0 };
  private spaceDown = false;
  private rect: DOMRect;
  private rightStart: { x: number; y: number } | null = null;

  constructor(
    private el: HTMLElement,
    private h: InputHandlers,
    private cfg: InputConfig,
  ) {
    this.rect = el.getBoundingClientRect();
    el.style.touchAction = "none"; // desliga scroll/zoom nativo do navegador
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onCancel);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("wheel", this.onWheel, { passive: false });
    el.addEventListener("contextmenu", this.prevent);
    // Clicar no canvas não pode roubar o foco (nem fechar) da <textarea> de edição de texto.
    el.addEventListener("mousedown", this.prevent);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.refreshRect);
  }

  destroy() {
    const el = this.el;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointercancel", this.onCancel);
    el.removeEventListener("pointerleave", this.onLeave);
    el.removeEventListener("wheel", this.onWheel);
    el.removeEventListener("contextmenu", this.prevent);
    el.removeEventListener("mousedown", this.prevent);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.refreshRect);
  }

  private prevent = (e: Event) => e.preventDefault();
  private refreshRect = () => (this.rect = this.el.getBoundingClientRect());

  private sample(e: PointerEvent): Sample {
    return {
      x: e.clientX - this.rect.left,
      y: e.clientY - this.rect.top,
      // Mouse reporta 0.5 com botão pressionado; caneta reporta pressão real.
      pressure: e.pressure > 0 ? e.pressure : 0.5,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      pointerType: e.pointerType,
      time: e.timeStamp,
      eraserTip: e.pointerType === "pen" && ((e.buttons & 32) !== 0 || e.button === 5),
      shift: e.shiftKey,
      alt: e.altKey,
    };
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Space" && !(e.target instanceof HTMLInputElement)) {
      this.spaceDown = true;
      e.preventDefault();
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Space") this.spaceDown = false;
  };

  private onDown = (e: PointerEvent) => {
    this.refreshRect();
    const s = this.sample(e);

    if (e.pointerType === "pen") this.lastPenTime = e.timeStamp;

    if (e.pointerType === "touch") {
      // Rejeição de palma: se a caneta acabou de ser usada, toque é ignorado.
      if (e.timeStamp - this.lastPenTime < PALM_REJECT_MS && this.mode !== "pinch") return;
      this.el.setPointerCapture(e.pointerId);
      this.touches.set(e.pointerId, { x: s.x, y: s.y });

      if (this.touches.size >= 2) {
        // Segundo dedo: vira gesto de pinça/pan e cancela qualquer traço em andamento.
        if (this.mode === "draw") this.h.drawCancel();
        this.mode = "pinch";
        return;
      }
      if (this.cfg.getFingerDraws() && this.cfg.getTool() !== "hand") {
        this.beginDraw(e, s);
      } else {
        this.beginPan(e, s);
      }
      return;
    }

    // Mouse / caneta
    this.el.setPointerCapture(e.pointerId);
    this.rightStart = e.button === 2 ? { x: e.clientX, y: e.clientY } : null;
    const wantsPan =
      e.button === 1 || e.button === 2 || this.spaceDown || this.cfg.getTool() === "hand";
    if (wantsPan) this.beginPan(e, s);
    else if (e.button === 0 || e.pointerType === "pen") this.beginDraw(e, s);
  };

  private beginDraw(e: PointerEvent, s: Sample) {
    this.mode = "draw";
    this.drawPointerId = e.pointerId;
    this.h.drawStart(s);
  }

  private beginPan(e: PointerEvent, s: Sample) {
    this.mode = "pan";
    this.panPointerId = e.pointerId;
    this.lastPan = { x: s.x, y: s.y };
  }

  private onMove = (e: PointerEvent) => {
    if (e.pointerType === "pen") this.lastPenTime = e.timeStamp;

    if (this.mode === "pinch" && this.touches.has(e.pointerId)) {
      this.handlePinch(e);
      return;
    }
    if (this.mode === "draw" && e.pointerId === this.drawPointerId) {
      // Eventos "coalesced" = todos os pontos entre frames → traço de caneta mais fiel.
      const list = e.getCoalescedEvents?.() ?? [];
      const events = list.length ? list : [e];
      // Previsão só para caneta: tira ~1 frame de latência visual. Mouse/dedo ficam exatos.
      const ahead = e.pointerType === "pen" ? (e.getPredictedEvents?.() ?? []).slice(0, 2) : [];
      this.h.drawMove(events.map((ev) => this.sample(ev)), ahead.map((ev) => this.sample(ev)));
      return;
    }
    if (this.mode === "pan" && e.pointerId === this.panPointerId) {
      const s = this.sample(e);
      this.h.pan(s.x - this.lastPan.x, s.y - this.lastPan.y);
      this.lastPan = { x: s.x, y: s.y };
      return;
    }
    if (this.mode === "idle" && e.pointerType !== "touch") this.h.hover?.(this.sample(e));
  };

  private onLeave = (e: PointerEvent) => {
    if (this.mode === "idle" && e.pointerType !== "touch") this.h.hoverEnd?.();
  };

  private handlePinch(e: PointerEvent) {
    const prev = new Map(this.touches);
    const s = this.sample(e);
    this.touches.set(e.pointerId, { x: s.x, y: s.y });
    if (this.touches.size < 2) return;

    const pts = [...this.touches.values()];
    const old = [...prev.values()];
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);
    const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    });

    const d1 = dist(pts[0], pts[1]);
    const d0 = dist(old[0], old[1]);
    const m1 = mid(pts[0], pts[1]);
    const m0 = mid(old[0], old[1]);

    this.h.pan(m1.x - m0.x, m1.y - m0.y);
    if (d0 > 0 && d1 > 0) this.h.zoom(d1 / d0, m1.x, m1.y);
  }

  private onUp = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    if (this.mode === "draw" && e.pointerId === this.drawPointerId) {
      this.h.drawEnd(this.sample(e));
      this.reset();
    } else if (this.mode === "pan" && e.pointerId === this.panPointerId) {
      const rs = this.rightStart;
      this.rightStart = null;
      if (e.button === 2 && rs && Math.hypot(e.clientX - rs.x, e.clientY - rs.y) < 5) this.h.contextTap?.(this.sample(e));
      this.reset();
    } else if (this.mode === "pinch" && this.touches.size < 2) {
      this.reset();
      // Dedo restante não vira pan automaticamente: evita "pulo" ao soltar a pinça.
    }
  };

  private onCancel = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    if (this.mode === "draw") this.h.drawCancel();
    if (this.mode !== "pinch" || this.touches.size < 2) this.reset();
  };

  private reset() {
    this.mode = "idle";
    this.drawPointerId = null;
    this.panPointerId = null;
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.refreshRect();
    const cx = e.clientX - this.rect.left;
    const cy = e.clientY - this.rect.top;
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+scroll e pinça do trackpad chegam como wheel com ctrlKey.
      this.h.zoom(Math.exp(-e.deltaY * 0.01), cx, cy);
    } else {
      this.h.pan(-e.deltaX, -e.deltaY);
    }
  };
}
