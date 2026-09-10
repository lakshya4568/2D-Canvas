"use client";

import React from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import { DraftPanel } from "../panels/DraftPanel";
import { AuthorPanel } from "../panels/AuthorPanel";
import { RunPanel } from "../panels/RunPanel";
import { PropertiesPalette } from "../panels/PropertiesPalette";

/**
 * The right dock. Supports both AutoCAD Properties Inspector and UPCE Persona Views.
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
  const [activeTab, setActiveTab] = React.useState<"properties" | "parametric">("properties");
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
      className="shrink-0 h-full bg-(--ink-panel) border-l border-(--rule) flex flex-col relative z-20 shadow-lg"
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

      {/* Dock Mode Tabs: AutoCAD Properties vs Parametric Intent */}
      <div className="h-[30px] border-b border-(--rule) bg-(--ink-app)/60 flex items-center justify-between px-2 text-[11px]">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("properties")}
            className={`px-2 py-0.5 rounded font-medium transition-colors cursor-pointer ${
              activeTab === "properties"
                ? "bg-(--ink-panel) text-(--pen) font-semibold shadow-xs"
                : "text-(--fg-muted) hover:text-(--fg-primary)"
            }`}
          >
            Properties
          </button>
          <button
            onClick={() => setActiveTab("parametric")}
            className={`px-2 py-0.5 rounded font-medium transition-colors cursor-pointer ${
              activeTab === "parametric"
                ? "bg-(--ink-panel) text-(--pen) font-semibold shadow-xs"
                : "text-(--fg-muted) hover:text-(--fg-primary)"
            }`}
          >
            Parametric
          </button>
        </div>

        <button
          onClick={onToggleCollapse}
          title="Hide panel"
          aria-label="Hide panel"
          className="w-[22px] h-[22px] rounded grid place-items-center text-(--fg-muted) hover:bg-(--ink-raised) hover:text-(--fg-primary) shrink-0 cursor-pointer"
        >
          <PanelRightClose className="w-[13px] h-[13px]" strokeWidth={1.9} />
        </button>
      </div>

      {activeTab === "properties" ? (
        <PropertiesPalette />
      ) : (
        <>
          <div className="px-3.5 pt-2.5 pb-2 border-b border-(--rule)">
            <h2 className="text-[12px] font-semibold text-(--fg-primary)">{heading.title}</h2>
            <p className="text-[10.5px] leading-snug text-(--fg-muted) mt-0.5 max-w-[34ch]">
              {heading.sub}
            </p>
          </div>

          {state.userMode === "draftsman" && <DraftPanel />}
          {state.userMode === "author" && <AuthorPanel />}
          {state.userMode === "user" && <RunPanel />}
        </>
      )}
    </aside>
  );
}
