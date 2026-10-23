import { useEffect } from "react";
import { CanvasView } from "./components/CanvasView";
import { TextEditor } from "./components/TextEditor";
import { LabelEditor } from "./components/LabelEditor";
import { UpdateBanner } from "./components/UpdateBanner";
import { WebGLNotice } from "./components/WebGLNotice";
import { initAutosave } from "./core/autosave";
import { initUpdates } from "./core/updater";
import { PageNav, Sidebar, Toast } from "./components/Pages";
import { Toolbar } from "./components/Toolbar";
import {
  copySelection, cutSelection, deleteSelection, duplicateSelection, editSelectedText,
  goPage, nudgeSelection, pasteClipboard, selectAll,
} from "./core/actions";
import {
  addChildToSelection, addSiblingToSelection, collapseMap, connectSelection, editSelectedLabel, fitToSelection,
  selectNeighbor, toggleCollapseSelection, ungroupSelection, wrapSelectionInFrame,
} from "./core/mapActions";
import { selectActivePage } from "./core/store";
import { initPageViewSync } from "./core/pageView";
import { ToolId, useDoc, useSel, useTool } from "./core/store";

const TOOL_KEYS: Record<string, ToolId> = {
  v: "select", l: "lasso", p: "pen", e: "eraser", h: "hand", r: "rect", o: "ellipse", d: "diamond", a: "arrow", t: "text", m: "mindmap", f: "frame",
  // numeração igual à do Excalidraw
  "1": "select", "2": "rect", "3": "diamond", "4": "ellipse", "5": "arrow", "6": "line", "7": "pen", "8": "text", "0": "eraser",
};

export default function App() {
  useEffect(() => initPageViewSync(), []);
  useEffect(() => initAutosave(), []);
  useEffect(() => initUpdates(), []);

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
        else if (k === "g") run(() => (e.shiftKey ? ungroupSelection() : wrapSelectionInFrame()));
        else if (k === "enter") run(() => addChildToSelection());
        return;
      }

      const oneNode = (() => {
        const ids = useSel.getState().ids;
        if (ids.length !== 1) return false;
        const el = selectActivePage(useDoc.getState()).elements.find((x) => x.id === ids[0]);
        return el?.type === "node";
      })();

      if (k === "tab" && !e.shiftKey) {
        if (addChildToSelection()) e.preventDefault();
      } else if (k === "f2") {
        if (editSelectedLabel()) e.preventDefault();
      } else if (k === "enter" && oneNode) {
        e.preventDefault();
        addSiblingToSelection(e.shiftKey);
      } else if (oneNode && !e.shiftKey && k.startsWith("arrow")) {
        e.preventDefault();
        selectNeighbor(k === "arrowleft" ? "left" : k === "arrowright" ? "right" : k === "arrowup" ? "up" : "down");
      } else if (k === "c" && useSel.getState().ids.length) {
        if (e.shiftKey) collapseMap(true);
        else toggleCollapseSelection();
      } else if (k === "k") {
        connectSelection();
      } else if (k === "!") {
        fitToSelection(true);
      } else if (k === "@") {
        fitToSelection(false);
      } else if (k === "delete" || k === "backspace") {
        e.preventDefault();
        deleteSelection();
      } else if (k === "pageup" || k === "pagedown") {
        e.preventDefault();
        goPage(k === "pageup" ? -1 : 1);
      } else if (k === "escape") {
        useSel.getState().clear();
        if (useTool.getState().picking) useTool.getState().set({ picking: false });
      } else if (k.startsWith("arrow") && useSel.getState().ids.length) {
        e.preventDefault();
        const n = e.shiftKey ? 10 : 1;
        nudgeSelection(k === "arrowleft" ? -n : k === "arrowright" ? n : 0, k === "arrowup" ? -n : k === "arrowdown" ? n : 0);
      } else if (k === "enter") {
        if (editSelectedText() || editSelectedLabel()) e.preventDefault(); // Enter edita o texto selecionado
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
      <LabelEditor />
      <Toast />
      <UpdateBanner />
      <WebGLNotice />
    </>
  );
}
