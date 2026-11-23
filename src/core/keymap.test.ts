import { describe, expect, it } from "vitest";
import {
  KeyedCommand, assignKey, buildIndex, cleanOverrides, comboFromEvent, findConflicts, keysFor, normalizeCombo, removeKey, resetKey, usersOf,
} from "./keymap";

const cmds: KeyedCommand[] = [
  { id: "tool.pen", label: "Caneta", keys: ["P"] },
  { id: "tool.brush", label: "Pincel", keys: [] },
  { id: "lib", label: "Biblioteca", keys: ["B"] },
  { id: "edit", label: "Editar", keys: ["Enter"], scope: "selection" },
  { id: "sib", label: "Irmão", keys: ["Enter"], scope: "node" },
];

describe("combinações de teclas", () => {
  it("normaliza o texto digitado", () => {
    expect(normalizeCombo("shift+ctrl+z")).toBe("Ctrl+Shift+Z");
    expect(normalizeCombo("Cmd + K")).toBe("Ctrl+K");
    expect(normalizeCombo("alt+arrowleft")).toBe("Alt+Left");
    expect(normalizeCombo("Ctrl++")).toBe("Ctrl++");
    expect(normalizeCombo("f2")).toBe("F2");
    expect(normalizeCombo("a+b")).toBe("");
    expect(normalizeCombo("ctrl")).toBe("");
  });
  it("lê o evento pela posição física (Shift+1 não vira !)", () => {
    expect(comboFromEvent({ key: "!", code: "Digit1", shiftKey: true })).toBe("Shift+1");
    expect(comboFromEvent({ key: "z", code: "KeyZ", ctrlKey: true, shiftKey: true })).toBe("Ctrl+Shift+Z");
    expect(comboFromEvent({ key: "]", code: "BracketRight", metaKey: true })).toBe("Ctrl+]");
    expect(comboFromEvent({ key: "Shift", code: "ShiftLeft", shiftKey: true })).toBe("");
    expect(comboFromEvent({ key: "ArrowUp", code: "ArrowUp" })).toBe("Up");
  });
});

describe("mapa de teclas", () => {
  it("trocar P por B na caneta tira o B da biblioteca (mesmo contexto)", () => {
    let o = assignKey(cmds, {}, "tool.pen", "B", true);
    expect(keysFor(cmds[0], o)).toEqual(["B"]);
    expect(keysFor(cmds[2], o)).toEqual([]);
    o = resetKey(o, "tool.pen");
    expect(keysFor(cmds[0], o)).toEqual(["P"]);
  });
  it("somar uma tecla mantém as que já existiam; remover tira só aquela", () => {
    let o = assignKey(cmds, {}, "tool.pen", "Shift+P");
    expect(keysFor(cmds[0], o)).toEqual(["P", "Shift+P"]);
    o = removeKey(cmds, o, "tool.pen", "P");
    expect(keysFor(cmds[0], o)).toEqual(["Shift+P"]);
  });
  it("sobreposição igual ao padrão não é guardada", () => {
    const o = assignKey(cmds, {}, "tool.pen", "P");
    expect(o).toEqual({});
  });
  it("contextos diferentes podem dividir a tecla; o mais específico vem primeiro", () => {
    expect(findConflicts(cmds, {})).toEqual([]);
    expect(buildIndex(cmds, {}).get("Enter")!.map((c) => c.id)).toEqual(["sib", "edit"]);
    expect(usersOf(cmds, {}, "Enter", "selection").map((c) => c.id)).toEqual(["edit"]);
    const o = { "tool.brush": ["P"] };
    expect(findConflicts(cmds, o)).toEqual([{ combo: "P", ids: ["tool.pen", "tool.brush"] }]);
  });
  it("arquivo importado é saneado", () => {
    expect(cleanOverrides({ keys: { "tool.pen": ["shift+p", 3, "a+b"], bad: "x" } })).toEqual({ "tool.pen": ["Shift+P"] });
    expect(cleanOverrides(null)).toEqual({});
  });
});
