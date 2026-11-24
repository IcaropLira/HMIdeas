import { ExportDialog, initBackups } from "./components/ExportDialog";
import { NewDocumentDialog } from "./components/NewDocumentDialog";
import { useDoc } from "./core/store";
import { GraphView, OrgBar, OutlineModal } from "./components/Organize";
import { AudioDock, ExamBar, PomodoroClock, Presenter, ReviewModal } from "./components/Study";
import { ZoomWriter } from "./components/ZoomWriter";
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
import { NotebookManager } from "./components/NotebookManager";
import { TemplateGallery } from "./components/TemplateGallery";
import { AlgoPlayer } from "./components/AlgoPlayer";
import { BlockEditor } from "./components/BlockEditor";
import { BlockInlineEditor } from "./components/BlockInlineEditor";
import { PageEditor } from "./components/PageEditor";
import { BlockLibrary } from "./components/BlockGallery";
import { EdgeLabelEditor } from "./components/EdgeLabelEditor";
import { useTheme } from "./core/theme";
import { initPaste } from "./components/clipboard";
import { initPageViewSync } from "./core/pageView";
import { initWorkspaces } from "./core/workspace";
import { handleKey, handleKeyUp, handleModifierDown } from "./components/commands";
import { initToolKit } from "./core/toolKit";
import { WindowChrome } from "./components/DockHost";
import { ContextBar } from "./components/ContextBar";
import { CommandPalette } from "./components/CommandPalette";

function FocusExit() {
  const focus = useTheme((s) => s.focus);
  if (!focus) return null;
  return <button className="focus-exit" onClick={() => useTheme.getState().setFocus(false)} title="Sair do modo foco (Ctrl+.)">Sair do foco</button>;
}

export default function App() {
  useEffect(() => initPageViewSync(), []);
  useEffect(() => initAutosave(false), []);
  useEffect(() => initUpdates(), []);
  useEffect(() => initPaste(), []);

  useEffect(() => initWorkspaces(), []);
  // Modo de cor do documento (0.18): escala de cinza deixa a tela em cinza (as exportações também saem em cinza).
  const gray = useDoc((s) => s.doc.meta?.colorMode === "gray");
  useEffect(() => { document.documentElement.classList.toggle("doc-gray", gray); }, [gray]);
  useEffect(() => {
    // Todo o teclado passa pelo registro de comandos (atalhos personalizáveis: components/commands.ts + core/keymap.ts).
    const onKey = (e: KeyboardEvent) => { handleModifierDown(e); handleKey(e); };
    const onUp = (e: KeyboardEvent) => handleKeyUp(e);
    // trocar de janela com a tecla segurada não pode deixar a ferramenta temporária presa
    const onBlur = () => { handleKeyUp(new KeyboardEvent("keyup", { key: "Control" })); handleKeyUp(new KeyboardEvent("keyup", { key: "Alt" })); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    const stopKit = initToolKit(), stopBackups = initBackups();
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onUp); window.removeEventListener("blur", onBlur); stopKit(); stopBackups(); };
  }, []);

  return (
    <>
      <CanvasView />
      <WindowChrome />
      <PageNav />
      <NotebookManager />
      <Sidebar />
      <Toolbar />
      <TemplateGallery />
      <BlockLibrary />
      <FocusExit />
      <AlgoPlayer />
      <ZoomWriter />
      <PomodoroClock />
      <ReviewModal />
      <ExamBar />
      <Presenter />
      <AudioDock />
      <OrgBar />
      <OutlineModal />
      <GraphView />
      <ExportDialog />
      <NewDocumentDialog />
      <BlockEditor />
      <BlockInlineEditor />
      <PageEditor />
      <EdgeLabelEditor />
      <TextEditor />
      <LabelEditor />
      <ContextBar />
      <CommandPalette />
      <Toast />
      <UpdateBanner />
      <WebGLNotice />
    </>
  );
}
