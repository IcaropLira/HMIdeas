// Fumaça das barras de bloquinhos: onde cada botão cai e a aba de configurações.
// Renderização no servidor (sem DOM): o hook do layout é trocado por um que lê daqui.
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LAYOUT, Layout, hideItem, moveItems } from "../core/layout";
import { BarsPane } from "./LayoutSettings";
import { Toolbar } from "./Toolbar";

const mock = vi.hoisted(() => ({ layout: undefined as Layout | undefined }));
vi.mock("../core/layout", async (importOriginal) => {
  const real = await importOriginal<typeof import("../core/layout")>();
  const useLayout = Object.assign((sel: (s: unknown) => unknown) => sel({ layout: mock.layout ?? real.DEFAULT_LAYOUT }), { getState: () => ({ layout: mock.layout ?? real.DEFAULT_LAYOUT, update() {}, setLayout() {} }) });
  return { ...real, useLayout };
});
afterEach(() => { mock.layout = undefined; });

const at = (html: string, needle: string) => {
  const i = html.indexOf(needle);
  expect(i, `não achei ${needle}`).toBeGreaterThanOrEqual(0);
  return i;
};

describe("barras de bloquinhos", () => {
  it("padrão: criar à esquerda, cor à direita, ferramentas embaixo — sem alças", () => {
    const html = renderToString(<Toolbar />);
    const left = at(html, 'class="bars-side left"'), right = at(html, 'class="bars-side right"'), dock = at(html, 'class="dock"');
    expect(at(html, 'aria-label="Blocos"')).toBeGreaterThan(left);
    expect(at(html, 'aria-label="Blocos"')).toBeLessThan(right);
    expect(at(html, 'aria-label="Mais cores"')).toBeGreaterThan(right);
    for (const nome of ["Selecionar", "Caneta", "Texto", "Borracha de traço inteiro", "Desfazer"]) expect(at(html, `aria-label="${nome}"`), nome).toBeGreaterThan(dock);
    expect(html).not.toContain('class="grip"');
    expect(html).not.toContain("fdock");
  });

  it("cada bloquinho é um item arrastável", () => {
    const html = renderToString(<Toolbar />);
    for (const id of DEFAULT_LAYOUT.bars.flatMap((b) => b.items)) expect(html).toContain(`data-item="${id}"`);
  });

  it("bloquinho solto vira barra flutuante na posição dele", () => {
    mock.layout = moveItems(DEFAULT_LAYOUT, ["undo"], { kind: "float", x: 320, y: 111, vertical: true });
    const html = renderToString(<Toolbar />);
    expect(html).toContain('class="float-layer"');
    expect(html).toMatch(/class="toolbar tbar vbar"[^>]*style="left:320px;top:111px"/);
    expect((html.match(/aria-label="Desfazer"/g) ?? []).length).toBe(1);
  });

  it("bloquinho oculto some e a engrenagem continua", () => {
    mock.layout = hideItem(DEFAULT_LAYOUT, "colors");
    const html = renderToString(<Toolbar />);
    expect(html).not.toContain('aria-label="Mais cores"');
    expect(html).toContain('aria-label="Configurações"');
  });
});

describe("Configurações → Barras", () => {
  const view = (L: Layout) => renderToString(<BarsPane layout={L} onChange={vi.fn()} onLocked={vi.fn()} onReset={vi.fn()} />);
  it("lista as barras e oferece mostrar os ocultos", () => {
    const html = view(hideItem(DEFAULT_LAYOUT, "paper"));
    expect(html).toContain("Barra 1");
    expect(html).toContain("+ Papel");
    expect(html).toMatch(/aria-pressed="false"[^>]*>Travar barras</);
    expect(view({ ...DEFAULT_LAYOUT, locked: true })).toMatch(/aria-pressed="true"[^>]*>Barras travadas</);
  });
});
