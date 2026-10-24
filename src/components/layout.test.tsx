// Fumaça das barras personalizáveis: onde cada botão cai no layout padrão e o menu de configurações.
// Renderização no servidor (sem DOM): o zustand lê o estado inicial, então aqui valem os padrões.
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BLOCKS, DEFAULT_LAYOUT, Layout, placeBlock } from "../core/layout";
import { LayoutSettingsView } from "./LayoutSettings";
import { Toolbar } from "./Toolbar";

// No servidor o zustand ignora setState e lê sempre o estado INICIAL; por isso o hook do layout é trocado por um que lê daqui.
const mock = vi.hoisted(() => ({ layout: undefined as Layout | undefined }));
vi.mock("../core/layout", async (importOriginal) => {
  const real = await importOriginal<typeof import("../core/layout")>();
  const useLayout = (sel: (s: unknown) => unknown) => sel({ layout: mock.layout ?? real.DEFAULT_LAYOUT, setSide() {}, move() {}, reset() {} });
  return { ...real, useLayout };
});

afterEach(() => { mock.layout = undefined; });

const at = (html: string, needle: string) => {
  const i = html.indexOf(needle);
  expect(i, `não achei ${needle}`).toBeGreaterThanOrEqual(0);
  return i;
};

describe("Toolbar em blocos", () => {
  it("no padrão: ferramentas e formas embaixo, mapa/papel na esquerda, pincéis/cor/espessura na direita", () => {
    const html = renderToString(<Toolbar />);
    const left = at(html, "rail-left");
    const right = at(html, "rail-right");
    const dock = at(html, 'class="dock"');
    expect(left).toBeLessThan(right);
    expect(right).toBeLessThan(dock);
    // esquerda: mapa mental e papel
    expect(at(html, 'aria-label="Mapa mental"')).toBeGreaterThan(left);
    expect(at(html, 'aria-label="Mapa mental"')).toBeLessThan(right);
    expect(at(html, 'aria-label="Papel"')).toBeLessThan(right);
    // direita: pincéis, cores e espessura
    expect(at(html, 'aria-label="Pincéis"')).toBeGreaterThan(right);
    expect(at(html, 'aria-label="Pincéis"')).toBeLessThan(dock);
    expect(at(html, 'aria-label="Mais cores"')).toBeLessThan(dock);
    expect(at(html, "Espessura do traço")).toBeLessThan(dock);
    // embaixo: ferramentas, formas e histórico
    for (const nome of ["Selecionar", "Caneta", "Borracha", "Texto", "Mover tela", "Retângulo", "Seta", "Desfazer", "Refazer"]) {
      expect(at(html, `aria-label="${nome}"`), nome).toBeGreaterThan(dock);
    }
  });

  it("bloco oculto some da tela; lado vazio não gera barra", () => {
    mock.layout = placeBlock(placeBlock(placeBlock(DEFAULT_LAYOUT, "brush", "hidden"), "colors", "hidden"), "size", "hidden");
    const html = renderToString(<Toolbar />);
    expect(html).not.toContain("rail-right");
    expect(html).not.toContain('aria-label="Pincéis"');
    expect(html).not.toContain('aria-label="Mais cores"');
  });

  it("mover um bloco para a esquerda coloca os botões dele na barra da esquerda", () => {
    mock.layout = placeBlock(DEFAULT_LAYOUT, "history", "left");
    const html = renderToString(<Toolbar />);
    expect(at(html, 'aria-label="Desfazer"')).toBeLessThan(at(html, "rail-right"));
  });

  it("a engrenagem de configurações sempre existe, mesmo com tudo oculto", () => {
    let l = DEFAULT_LAYOUT;
    for (const b of BLOCKS) l = placeBlock(l, b.id, "hidden");
    mock.layout = l;
    const html = renderToString(<Toolbar />);
    expect(html).toContain('aria-label="Configurações"');
    expect(html).not.toContain("rail-left");
  });
});

describe("blocos flutuantes e alças", () => {
  const countGrips = (html: string) => (html.match(/class="grip"/g) ?? []).length;

  it("cada bloco visível tem uma alça de 6 pontos (2 colunas × 3 linhas)", () => {
    const html = renderToString(<Toolbar />);
    expect(countGrips(html)).toBe(BLOCKS.length);
    expect((html.match(/class="grip"[^>]*>((?:<i><\/i>){6})<\/div>/g) ?? []).length).toBe(BLOCKS.length);
  });

  it("travar as posições esconde todas as alças", () => {
    mock.layout = { ...DEFAULT_LAYOUT, locked: true };
    expect(countGrips(renderToString(<Toolbar />))).toBe(0);
  });

  it("bloco oculto não tem alça", () => {
    mock.layout = placeBlock(DEFAULT_LAYOUT, "colors", "hidden");
    expect(countGrips(renderToString(<Toolbar />))).toBe(BLOCKS.length - 1);
  });

  it("bloco flutuante vira barra solta na posição guardada, com os botões dele", () => {
    mock.layout = placeBlock(DEFAULT_LAYOUT, "colors", "float", { x: 320, y: 111, vertical: false });
    const html = renderToString(<Toolbar />);
    expect(html).toContain('class="float-layer"');
    expect(html).toMatch(/data-fbar="colors" class="toolbar fbar"[^>]*style="left:320px;top:111px"/);
    expect(html.indexOf('aria-label="Mais cores"')).toBeGreaterThan(html.indexOf('class="float-layer"'));
    expect(html).toContain("Barra flutuante: Cores");
  });

  it("bloco flutuante girado usa a barra vertical", () => {
    mock.layout = placeBlock(DEFAULT_LAYOUT, "history", "float", { x: 20, y: 200, vertical: true });
    expect(renderToString(<Toolbar />)).toMatch(/data-fbar="history" class="toolbar fbar vbar"/);
  });

  it("sem blocos flutuantes não existe a camada", () => {
    expect(renderToString(<Toolbar />)).not.toContain("float-layer");
  });

  it("os botões do bloco flutuante saem da barra de origem (sem duplicar)", () => {
    mock.layout = placeBlock(DEFAULT_LAYOUT, "history", "float", { x: 20, y: 200, vertical: false });
    const html = renderToString(<Toolbar />);
    expect((html.match(/aria-label="Desfazer"/g) ?? []).length).toBe(1);
  });
});

describe("LayoutSettingsView", () => {
  const view = (layout = DEFAULT_LAYOUT) =>
    renderToString(<LayoutSettingsView layout={layout} onSide={vi.fn()} onMove={vi.fn()} onRotate={vi.fn()} onLocked={vi.fn()} onReset={vi.fn()} onClose={vi.fn()} />);

  it("lista todos os blocos, cada um com as quatro posições, e o botão de restaurar", () => {
    const html = view();
    for (const b of BLOCKS) expect(html).toContain(b.label);
    for (const lado of ["Embaixo", "Esquerda", "Direita", "Flutuante", "Oculto"]) expect((html.match(new RegExp(`>${lado}<`, "g")) ?? []).length).toBe(BLOCKS.length);
    expect(html).toContain("Restaurar padrão");
    expect(html).toContain('role="dialog"');
  });

  it("marca a posição atual de cada bloco", () => {
    const html = view(placeBlock(DEFAULT_LAYOUT, "colors", "hidden"));
    expect(html).toMatch(/aria-label="Onde fica: Cores"[^>]*>(?:(?!<\/div>).)*aria-checked="true" class="chip on"[^>]*>Oculto</s);
  });

  it("não deixa mover para cima o primeiro bloco de um lado, nem bloco oculto", () => {
    const html = view(placeBlock(DEFAULT_LAYOUT, "colors", "hidden"));
    expect(html).toMatch(/disabled=""[^>]*aria-label="Mover Ferramentas para antes"/);
    expect(html).toMatch(/disabled=""[^>]*aria-label="Mover Cores para antes"/);
    expect(html).toMatch(/disabled=""[^>]*aria-label="Mover Cores para depois"/);
  });
});

describe("LayoutSettingsView: flutuante e trava", () => {
  const view = (layout: Layout) =>
    renderToString(<LayoutSettingsView layout={layout} onSide={vi.fn()} onMove={vi.fn()} onRotate={vi.fn()} onLocked={vi.fn()} onReset={vi.fn()} onClose={vi.fn()} />);

  it("mostra 'Girar' só para os blocos que flutuam", () => {
    expect(view(DEFAULT_LAYOUT)).not.toContain("Girar ");
    const html = view(placeBlock(DEFAULT_LAYOUT, "colors", "float", { x: 10, y: 10, vertical: false }));
    expect(html).toContain('aria-label="Girar Cores"');
    expect((html.match(/aria-label="Girar /g) ?? []).length).toBe(1);
  });

  it("o botão de travar reflete o estado", () => {
    expect(view(DEFAULT_LAYOUT)).toMatch(/aria-pressed="false"[^>]*>Travar posições</);
    expect(view({ ...DEFAULT_LAYOUT, locked: true })).toMatch(/aria-pressed="true"[^>]*>Posições travadas</);
  });
});

