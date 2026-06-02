import { useRef, useState } from "react";
import type { Tab } from "./tabs";

type Props = {
  tabs: Tab[];
  activeId: string;
  onSwitch: (id: string) => void;
  onClose: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  onRename: (id: string, name: string) => void;
  onNew: () => void;
  onDuplicate: (id: string) => void;
};

/**
 * Tab strip below the header. One pill per tab — circuit name, close button.
 * Double-click to rename, drag to reorder, "+" at the end opens a fresh
 * blank tab. Switching tabs persists each tab's UI state (selected gate,
 * step slider position, parameter values) via the tabs reducer, so coming
 * back finds everything where you left it.
 */
export function TabStrip({
  tabs,
  activeId,
  onSwitch,
  onClose,
  onReorder,
  onRename,
  onNew,
  onDuplicate,
}: Props) {
  const dragId = useRef<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  return (
    <div className="tabstrip" role="tablist">
      {tabs.map((t) => {
        const active = t.id === activeId;
        const name = t.versioned.present.name ?? "Untitled";
        return (
          <div
            key={t.id}
            className={"tab" + (active ? " tab--active" : "")}
            role="tab"
            aria-selected={active}
            draggable={renamingId !== t.id}
            onDragStart={() => { dragId.current = t.id; }}
            onDragOver={(e) => { if (dragId.current && dragId.current !== t.id) e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId.current && dragId.current !== t.id) {
                onReorder(dragId.current, t.id);
              }
              dragId.current = null;
            }}
            onClick={() => { if (!active) onSwitch(t.id); }}
            onDoubleClick={() => setRenamingId(t.id)}
            title={`${name} · double-click to rename · drag to reorder`}
          >
            {renamingId === t.id ? (
              <input
                className="tab__rename"
                defaultValue={name}
                autoFocus
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== name) onRename(t.id, v);
                  setRenamingId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setRenamingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="tab__label">{name}</span>
            )}
            {tabs.length > 1 && (
              <button
                className="tab__close"
                title="Close tab"
                onClick={(e) => {
                  e.stopPropagation();
                  const dirty = t.versioned.present.gates.length > 0;
                  if (dirty && !window.confirm(`Close "${name}"? Unsaved changes will be lost.`)) return;
                  onClose(t.id);
                }}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      <button className="tabstrip__add" onClick={onNew} title="New tab">+</button>
      <div className="tabstrip__spacer" />
      <button
        className="tabstrip__dup"
        onClick={() => onDuplicate(activeId)}
        title="Duplicate active tab"
      >
        Duplicate
      </button>
    </div>
  );
}
