"use client";

import React from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import { DraftPanel } from "../panels/DraftPanel";
import { AuthorPanel } from "../panels/AuthorPanel";
import { RunPanel } from "../panels/RunPanel";

/**
 * The right dock. Its ENTIRE contents are a function of the active persona —
 * this is the §3 boundary made structural rather than conditional-per-widget.
 *
 * A resizable dock, because dimension names in civil work are long
 * ("BottomSlabThickness", "IntermediateWebThickness") and a fixed narrow column
 * would truncate exactly the information the panel exists to show.
 */

const HEADINGS: Record<string, { title: string; sub: string }> = {
  draftsman: {
    title: "Drafting",
    sub: "Dimensions of what you selected. Click any dimension on the sheet to retype it.",
  },
  author: {
    title: "Design intent",
    sub: "Detected relationships arrive as candidates. Nothing is applied until you accept it.",
  },
  user: {
    title: "Parameters",
    sub: "Type site conditions. The drawing rebuilds and its invariants are re-checked.",
  },
};

const MIN_WIDTH = 268;
const MAX_WIDTH = 480;

export function PersonaDock({
  width,
  onWidthChange,
  collapsed,
  onToggleCollapse,
}: {
  width: number;
  onWidthChange: (w: number) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const { state } = useDrawing();
  const heading = HEADINGS[state.userMode] ?? HEADINGS.draftsman;
  const draggingRef = React.useRef(false);

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX));
      onWidthChange(next);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onWidthChange]);

  if (collapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        title="Show panel"
        aria-label="Show panel"
        className="absolute top-2 right-2 z-20 w-[28px] h-[28px] rounded-[5px] grid place-items-center bg-(--ink-panel) border border-(--rule) text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer"
      >
        <PanelRightOpen className="w-[14px] h-[14px]" strokeWidth={1.9} />
      </button>
    );
  }

  return (
    <aside
      style={{ width }}
      className="shrink-0 h-full bg-(--ink-panel) border-l border-(--rule) flex flex-col relative z-20"
    >
      {/* Drag handle */}
      <div
        onMouseDown={() => {
          draggingRef.current = true;
          document.body.style.cursor = "col-resize";
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        className="absolute left-[-3px] top-0 bottom-0 w-[6px] cursor-col-resize hover:bg-(--pen-line) transition-colors duration-100 z-10"
      />

      <div className="px-3.5 pt-3 pb-2.5 border-b border-(--rule) flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[12.5px] font-semibold text-(--fg-primary)">{heading.title}</h2>
          <p className="text-[11px] leading-snug text-(--fg-muted) mt-0.5 max-w-[34ch]">
            {heading.sub}
          </p>
        </div>
        <button
          onClick={onToggleCollapse}
          title="Hide panel"
          aria-label="Hide panel"
          className="w-[24px] h-[24px] rounded-[4px] grid place-items-center text-(--fg-muted) hover:bg-(--ink-raised) hover:text-(--fg-primary) shrink-0 cursor-pointer"
        >
          <PanelRightClose className="w-[13px] h-[13px]" strokeWidth={1.9} />
        </button>
      </div>

      {state.userMode === "draftsman" && <DraftPanel />}
      {state.userMode === "author" && <AuthorPanel />}
      {state.userMode === "user" && <RunPanel />}
    </aside>
  );
}
