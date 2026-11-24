import { describe, expect, it } from "vitest";
import { useTool } from "./store";
import { applyPreset, cleanKit, describe as describeSettings, familyOf, savePreset, snapshot, startRecording, stopRecording, noteCommand, useToolKit } from "./toolKit";

describe("kit de ferramentas", () => {
  it("preset guarda só os ajustes da família e volta tudo", () => {
    const t = useTool.getState();
    t.setTool("pen");
    t.set({ width: 12, opacity: 0.8, color: "#2F4B8F", smoothing: 0.3 });
    const p = savePreset("Marca azul");
    expect(p.settings).toMatchObject({ width: 12, opacity: 0.8, color: "#2F4B8F", smoothing: 0.3 });
    expect("eraserSize" in p.settings).toBe(false);
    t.setTool("eraser");
    t.set({ width: 2 });
    applyPreset(p.id);
    expect(useTool.getState()).toMatchObject({ tool: "pen", width: 12, color: "#2F4B8F" });
    expect(describeSettings("pen", p.settings)).toContain("80%");
    expect(familyOf("diamond")).toBe("shape");
    expect(Object.keys(snapshot("laser"))).toEqual(["laserColor", "laserTrail", "laserHold"]);
  });
  it("macro grava os comandos e ignora os de ajuda", () => {
    startRecording();
    noteCommand("edit.duplicate");
    noteCommand("help.palette");
    noteCommand("align.left");
    const m = stopRecording("Dup + alinhar");
    expect(m?.steps).toEqual(["edit.duplicate", "align.left"]);
    expect(useToolKit.getState().macros.at(-1)?.name).toBe("Dup + alinhar");
  });
  it("saneia o que vem do armazenamento", () => {
    const k = cleanKit({ presets: [{ id: 1 }], favorites: ["tool.pen", 3], macros: [{ id: "m", name: "x", steps: ["a", 2] }], ctrlSelect: false });
    expect(k).toMatchObject({ presets: [], favorites: ["tool.pen"], macros: [{ id: "m", name: "x", steps: ["a"] }], ctrlSelect: false, tempTools: true });
  });
});
