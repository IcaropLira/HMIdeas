import { describe, expect, it } from "vitest";
import { findConflicts, keysFor } from "../core/keymap";
import { allCommands } from "./commands";

describe("registro de comandos", () => {
  it("ids únicos e nomes preenchidos", () => {
    const ids = allCommands().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of allCommands()) expect(c.label.length, c.id).toBeGreaterThan(1);
  });
  it("o mapa padrão não tem teclas repetidas no mesmo contexto", () => {
    expect(findConflicts(allCommands(), {})).toEqual([]);
  });
  it("toda ferramenta tem atalho e os de sempre continuam", () => {
    const k = (id: string) => keysFor(allCommands().find((c) => c.id === id)!, {});
    for (const c of allCommands().filter((x) => x.id.startsWith("tool.") && !["tool.sizeUp", "tool.sizeDown", "tool.fingerDraws"].includes(x.id))) expect(k(c.id).length, c.id).toBeGreaterThan(0);
    expect(k("tool.pen")).toContain("P");
    expect(k("edit.undo")).toContain("Ctrl+Z");
    expect(k("obj.group")).toContain("Ctrl+G");
    expect(k("insert.library")).toContain("B");
    expect(k("view.fitAll")).toContain("Shift+1");
  });
});
