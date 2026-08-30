"use client";

import React from "react";
import { X, Keyboard } from "lucide-react";

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUT_GROUPS = [
  {
    category: "Drawing & Tools",
    items: [
      { key: "V", desc: "Select & Move tool" },
      { key: "L", desc: "Line tool (click & drag)" },
      { key: "R", desc: "Rectangle tool (click & drag)" },
      { key: "C", desc: "Circle tool (click & drag)" },
      { key: "H", desc: "Pan canvas tool" },
    ],
  },
  {
    category: "Canvas Navigation",
    items: [
      { key: "Space + Drag", desc: "Pan viewport across canvas" },
      { key: "Middle Click", desc: "Drag to pan viewport" },
      { key: "Mouse Wheel", desc: "Cursor-anchored Zoom In / Out" },
    ],
  },
  {
    category: "Actions & History",
    items: [
      { key: "Ctrl / ⌘ + Z", desc: "Undo last change" },
      { key: "Ctrl / ⌘ + ⇧ + Z", desc: "Redo change" },
      { key: "Delete / ⌫", desc: "Delete selected shape" },
      { key: "Escape", desc: "Cancel draft / deselect" },
    ],
  },
];

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-3xl glass-panel shadow-2xl p-6 flex flex-col gap-5 border border-[var(--border-subtle)] text-[var(--fg-primary)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2.5">
            <Keyboard className="w-5 h-5 text-blue-500" />
            <h2 className="font-bold text-base tracking-tight">Keyboard Shortcuts & Gestures</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.category} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-[var(--fg-secondary)] uppercase tracking-wider">
                {group.category}
              </h3>
              <div className="flex flex-col gap-1.5 bg-[var(--bg-panel-subtle)] p-2.5 rounded-2xl border border-[var(--border-subtle)]">
                {group.items.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-[var(--bg-panel)] transition-colors"
                  >
                    <span className="text-[var(--fg-secondary)] font-medium">{item.desc}</span>
                    <kbd className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-[var(--bg-panel)] border border-[var(--border-strong)] text-[var(--fg-primary)] shadow-sm">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-[var(--border-subtle)]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-semibold shadow transition-all cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
