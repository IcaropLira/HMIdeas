// O gesto de arrastar um bloco pela alça, simulado sem navegador: window/document falsos e eventos de ponteiro.
import type { PointerEvent as ReactPointerEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LAYOUT, useLayout } from "../core/layout";
import { rotateBlock, startBlockDrag } from "./BlockHandle";

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });

let win: EventTarget & { innerWidth: number; innerHeight: number };
const body = { classList: { add: vi.fn(), remove: vi.fn() } };
let fbarSize = { w: 264, h: 58 };

beforeEach(() => {
  win = Object.assign(new EventTarget(), { innerWidth: 1000, innerHeight: 700 });
  body.classList.add.mockClear();
  body.classList.remove.mockClear();
  fbarSize = { w: 264, h: 58 };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", {
    body,
    querySelector: (sel: string) => (sel.startsWith("[data-fbar") ? { getBoundingClientRect: () => rect(0, 0, fbarSize.w, fbarSize.h) } : null),
  });
  useLayout.setState({ layout: DEFAULT_LAYOUT });
});
afterEach(() => vi.unstubAllGlobals());

/** Clique na alça de um bloco que está na barra de baixo em (300, 620), 250×44; ponteiro a (17, 27) do canto. */
function press(opts: { pointerType?: string; button?: number; pointerId?: number } = {}) {
  const block = { getBoundingClientRect: () => rect(300, 620, 250, 44) };
  const e = {
    pointerType: opts.pointerType ?? "mouse",
    button: opts.button ?? 0,
    pointerId: opts.pointerId ?? 1,
    clientX: 317,
    clientY: 647,
    preventDefault: vi.fn(),
    currentTarget: { closest: () => block },
  };
  startBlockDrag(e as unknown as ReactPointerEvent<HTMLElement>, "tools");
  return e;
}
const fire = (type: "pointermove" | "pointerup" | "pointercancel", x: number, y: number, pointerId = 1) =>
  win.dispatchEvent(Object.assign(new Event(type), { clientX: x, clientY: y, pointerId }));
const state = () => useLayout.getState().layout;

describe("arrastar bloco pela alça", () => {
  it("um toque sem mover não muda nada", () => {
    const e = press();
    expect(e.preventDefault).toHaveBeenCalled();
    fire("pointerup", 317, 647);
    expect(state()).toBe(DEFAULT_LAYOUT);
    expect(body.classList.remove).toHaveBeenCalledWith("dragging-ui");
  });

  it("tremor de poucos pixels não começa o arraste", () => {
    press();
    fire("pointermove", 319, 648);
    expect(state().side.tools).toBe("bottom");
    fire("pointerup", 319, 648);
    expect(state()).toBe(DEFAULT_LAYOUT);
  });

  it("ao mover, o bloco vira flutuante e acompanha o ponteiro mantendo o ponto que foi segurado", () => {
    press();
    fire("pointermove", 500, 300);
    expect(state().side.tools).toBe("float");
    // início = canto do bloco − margem da barra (7); deslocamento do ponteiro = (317−293, 647−613) = (24, 34)
    expect(state().floats.tools).toMatchObject({ x: 500 - 24, y: 300 - 34, vertical: false });
    fire("pointerup", 500, 300);
    expect(state().floats.tools).toMatchObject({ x: 476, y: 266, vertical: false });
    expect(state().order.length).toBe(DEFAULT_LAYOUT.order.length);
    expect(body.classList.add).toHaveBeenCalledWith("dragging-ui");
  });

  it("soltar perto da borda esquerda gruda nela e vira vertical", () => {
    press();
    // o ímã mede a borda do BLOCO, não o ponteiro: ponteiro em x=40 deixa o bloco em x=16, a 8px da borda
    fire("pointermove", 40, 300);
    fire("pointerup", 40, 300);
    expect(state().floats.tools).toMatchObject({ x: 8, vertical: true });
  });

  it("longe da borda (fora do alcance do ímã) fica onde foi solto", () => {
    press();
    fire("pointermove", 90, 300); // bloco em x=66, a 58px da borda
    fire("pointerup", 90, 300);
    expect(state().floats.tools).toMatchObject({ x: 66, vertical: false });
  });

  it("soltar perto da borda de baixo gruda e continua horizontal", () => {
    press();
    fire("pointermove", 500, 690);
    fire("pointerup", 500, 690);
    expect(state().floats.tools).toMatchObject({ y: 700 - 58 - 8, vertical: false });
  });

  it("arrastar para fora da janela nunca deixa o bloco fora dela", () => {
    press();
    fire("pointermove", 9000, 9000);
    expect(state().floats.tools!.x + fbarSize.w).toBeLessThanOrEqual(1000 - 8);
    expect(state().floats.tools!.y + fbarSize.h).toBeLessThanOrEqual(700 - 8);
    fire("pointermove", -9000, -9000);
    expect(state().floats.tools!.x).toBeGreaterThanOrEqual(8);
    expect(state().floats.tools!.y).toBeGreaterThanOrEqual(8);
    fire("pointerup", -9000, -9000);
    expect(state().floats.tools!.x).toBeGreaterThanOrEqual(8);
  });

  it("se o sistema cancela o gesto, o bloco volta para onde estava", () => {
    press();
    fire("pointermove", 500, 300);
    expect(state().side.tools).toBe("float");
    fire("pointercancel", 500, 300);
    expect(state().side.tools).toBe("bottom");
    expect(state().floats.tools).toBeUndefined();
  });

  it("botão direito do mouse não arrasta", () => {
    press({ button: 2 });
    fire("pointermove", 500, 300);
    expect(state()).toBe(DEFAULT_LAYOUT);
    expect(body.classList.add).not.toHaveBeenCalled();
  });

  it("outro dedo/ponteiro durante o gesto é ignorado", () => {
    press({ pointerType: "touch", pointerId: 7 });
    fire("pointermove", 500, 300, 9);
    expect(state().side.tools).toBe("bottom");
    fire("pointermove", 500, 300, 7);
    expect(state().side.tools).toBe("float");
    fire("pointerup", 500, 300, 9); // não é o dedo do arraste: não termina
    expect(body.classList.remove).not.toHaveBeenCalled();
    fire("pointerup", 500, 300, 7);
    expect(body.classList.remove).toHaveBeenCalledWith("dragging-ui");
  });

  it("depois de soltar, movimentos soltos não mexem mais no bloco", () => {
    press();
    fire("pointermove", 500, 300);
    fire("pointerup", 500, 300);
    const parado = state().floats.tools;
    fire("pointermove", 100, 100);
    expect(state().floats.tools).toEqual(parado);
  });

  it("reabrir um bloco que já flutua continua de onde ele estava", () => {
    useLayout.getState().setFloat("tools", { x: 200, y: 100, vertical: false }, false);
    press();
    fire("pointermove", 400, 400);
    // deslocamento = ponteiro (317,647) − posição guardada (200,100) = (117, 547): x = 400−117, e y = 400−547 sai da tela e é limitado a 8
    expect(state().floats.tools).toMatchObject({ x: 283, y: 8 });
  });
});

describe("girar bloco flutuante", () => {
  it("alterna horizontal ↔ vertical só se o bloco flutua", () => {
    rotateBlock("tools");
    expect(state()).toBe(DEFAULT_LAYOUT);
    useLayout.getState().setFloat("tools", { x: 50, y: 60, vertical: false }, false);
    rotateBlock("tools");
    expect(state().floats.tools).toEqual({ x: 50, y: 60, vertical: true });
    rotateBlock("tools");
    expect(state().floats.tools!.vertical).toBe(false);
  });
});
