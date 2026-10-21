import { useEffect } from "react";
import { CanvasView } from "./components/CanvasView";
import { TextEditor } from "./components/TextEditor";
import { PageNav, Sidebar, Toast } from "./components/Pages";
import { Toolbar } from "./components/Toolbar";
import {
  copySelection, cutSelection, deleteSelection, duplicateSelection, editSelectedText,
  goPage, nudgeSelection, pasteClipboard, selectAll,
} from "./core/actions";
import { initPageViewSync } from "./core/pageView";
import { ToolId, useDoc, useSel, useTool } from "./core/store";

const TOOL_KEYS: Record<string, ToolId> = {
  v: "select", l: "lasso", p: "pen", e: "eraser", h: "hand", r: "rect", o: "ellipse", d: "diamond", a: "arrow", t: "text",
  // numeração igual à do Excalidraw
  "1": "select", "2": "rect", "3": "diamond", "4": "ellipse", "5": "arrow", "6": "line", "7": "pen", "8": "text", "0": "eraser",
};

export default function App() {
  useEffect(() => initPageViewSync(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();

      if (mod) {
        const run = (fn: () => void) => { e.preventDefault(); fn(); };
        if (k === "z") run(() => (e.shiftKey ? useDoc.getState().redo() : useDoc.getState().undo()));
        else if (k === "y") run(() => useDoc.getState().redo());
        else if (k === "a") run(selectAll);
        else if (k === "d") run(duplicateSelection);
        else if (k === "c") run(copySelection);
        else if (k === "x") run(cutSelection);
        else if (k === "v") run(pasteClipboard);
        return;
      }

      if (k === "delete" || k === "backspace") {
        e.preventDefault();
        deleteSelection();
      } else if (k === "pageup" || k === "pagedown") {
        e.preventDefault();
        goPage(k === "pageup" ? -1 : 1);
      } else if (k === "escape") {
        useSel.getState().clear();
      } else if (k.startsWith("arrow") && useSel.getState().ids.length) {
        e.preventDefault();
        const n = e.shiftKey ? 10 : 1;
        nudgeSelection(k === "arrowleft" ? -n : k === "arrowright" ? n : 0, k === "arrowup" ? -n : k === "arrowdown" ? n : 0);
      } else if (k === "enter") {
        if (editSelectedText()) e.preventDefault(); // Enter edita o texto selecionado
      } else if (TOOL_KEYS[k]) {
        useTool.getState().setTool(TOOL_KEYS[k]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <CanvasView />
      <PageNav />
      <Sidebar />
      <Toolbar />
      <TextEditor />
      <Toast />
    </>
  );
}
