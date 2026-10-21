// Sessão de edição de texto (a <textarea> sobre o canvas). Fora do histórico: só a CONFIRMAÇÃO entra nele.
import { create } from "zustand";
import { FontFamily, ID, TextAlign, TextElement, newId } from "./model";
import { selectActivePage, useDoc, useTool } from "./store";
import { makeText, measureBlock } from "./text";

export interface TextSession {
  /** Identifica a sessão: um blur atrasado de uma sessão antiga não mexe na nova. */
  token: number;
  /** id do texto sendo editado, ou null para um texto novo. */
  id: ID | null;
  x: number;
  y: number;
  angle: number;
  text: string;
  fontSize: number;
  fontFamily: FontFamily;
  align: TextAlign;
  color: string;
}

interface EditState {
  session: TextSession | null;
  patch: (p: Partial<TextSession>) => void;
}

let counter = 0;

export const useEdit = create<EditState>((set) => ({
  session: null,
  patch: (p) => set((s) => (s.session ? { session: { ...s.session, ...p } } : s)),
}));

export function beginNewText(P: { x: number; y: number }) {
  commitText();
  const t = useTool.getState();
  useEdit.setState({
    session: { token: ++counter, id: null, x: P.x, y: P.y, angle: 0, text: "", fontSize: t.fontSize, fontFamily: t.fontFamily, align: t.textAlign, color: t.color },
  });
}

export function beginEditText(el: TextElement) {
  commitText();
  useEdit.setState({
    session: { token: ++counter, id: el.id, x: el.x, y: el.y, angle: el.angle, text: el.text, fontSize: el.fontSize, fontFamily: el.fontFamily, align: el.align, color: el.color },
  });
}

/** Confirma a edição. Com `token`, só age se a sessão ainda for aquela. Texto vazio apaga (ou não cria). */
export function commitText(token?: number) {
  const s = useEdit.getState().session;
  if (!s || (token !== undefined && token !== s.token)) return;
  useEdit.setState({ session: null });

  const text = s.text.replace(/\s+$/, "");
  const doc = useDoc.getState();

  if (s.id) {
    const el = selectActivePage(doc).elements.find((e) => e.id === s.id);
    if (!el || el.type !== "text") return;
    if (!text.trim()) {
      doc.removeElements([el.id]);
      return;
    }
    const m = measureBlock(text, s.fontFamily, s.fontSize);
    const changed = text !== el.text || s.fontFamily !== el.fontFamily || s.fontSize !== el.fontSize || s.align !== el.align || s.color !== el.color;
    if (changed) doc.updateElements([{ ...el, text, w: m.w, h: m.h, fontSize: s.fontSize, fontFamily: s.fontFamily, align: s.align, color: s.color }]);
    return;
  }
  if (!text.trim()) return;
  doc.addElement(makeText(newId(), s.x, s.y, text, { fontSize: s.fontSize, fontFamily: s.fontFamily, align: s.align, color: s.color }));
}
