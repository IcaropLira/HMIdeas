// Blocos nativos para inserir um a um (com prévia de verdade de cada tipo).
import { useMemo } from "react";
import { ElementsPreview } from "./ElementsPreview";
import { BLOCK_KINDS, BlockKind, defaultBlock } from "../core/blocks";
import { makeBlockElement, newBlock } from "../core/blockElement";
import { useBlockEdit } from "../core/blockView";
import { viewCenter } from "../core/mapActions";
import { useDoc, useSel, useTool } from "../core/store";

export function insertBlock(kind: BlockKind, at = viewCenter(), edit = false) {
  const el = newBlock(kind, at);
  useDoc.getState().addElement(el);
  useSel.getState().set([el.id]);
  useTool.getState().setTool("select");
  if (edit) useBlockEdit.getState().open(el.id);
  return el;
}

export function BlockTiles({ onPick }: { onPick?: () => void }) {
  const previews = useMemo(() => BLOCK_KINDS.map((k) => ({ ...k, el: { ...makeBlockElement(defaultBlock(k.id), { x: 0, y: 0 }), id: "pv-" + k.id } })), []);
  return (
    <div className="tiles three block-tiles" role="toolbar" aria-label="Blocos">
      {previews.map((k) => (
        <button key={k.id} className="tile" title={k.hint} onClick={() => { insertBlock(k.id, undefined, k.id !== "todo" && k.id !== "kanban" && k.id !== "timeline" && k.id !== "table"); onPick?.(); }}>
          <ElementsPreview elements={[k.el]} w={96} h={66} pad={6} />
          <span>{k.label}</span>
        </button>
      ))}
    </div>
  );
}
