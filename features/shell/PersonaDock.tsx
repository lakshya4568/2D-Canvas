"use client";

import React from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import { useUpce } from "../parametric/upceContext";
import { DraftPanel } from "../panels/DraftPanel";
import { AuthorPanel } from "../panels/AuthorPanel";
import { RunPanel } from "../panels/RunPanel";
import { PropertiesPalette } from "../panels/PropertiesPalette";
import { FormulasPanel } from "../panels/FormulasPanel";

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
  const upce = useUpce();
  const [activeTab, setActiveTab] = React.useState<"properties" | "parametric" | "formulas">(
    "parametric"
  );
  const heading = HEADINGS[state.userMode] ?? HEADINGS.draftsman;
  const draggingRef = React.useRef(false);

  const formulaCount = React.useMemo(() => {
    return Object.values(upce.sketch.parameters).filter(
      (p) => p.role === "DERIVED" || (p.expr !== undefined && p.expr.trim().length > 0)
    ).length;
  }, [upce.sketch.parameters]);

  React.useEffect(() => {
    if (state.userMode !== "author" && activeTab === "formulas") {
      setActiveTab("parametric");
    }
  }, [state.userMode, activeTab]);

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

  return (
    <>
      {collapsed && (
        <button
          onClick={onToggleCollapse}
          title="Show Persona / Properties panel"
          aria-label="Show Persona / Properties panel"
          className="absolute top-8.5 right-24 z-20 h-[28px] px-2.5 rounded-[5px] flex items-center gap-1.5 bg-(--ink-panel)/95 border border-(--rule) text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer shadow-md text-[11px] backdrop-blur-xs"
        >
          <PanelRightOpen className="w-[14px] h-[14px] text-(--pen)" strokeWidth={1.9} />
          <span className="font-semibold text-(--fg-primary)">
            {state.userMode === "draftsman" ? "Drafting" : state.userMode === "author" ? "Author" : "Run"}
          </span>
        </button>
      )}

      <aside
        style={{ width: collapsed ? 0 : width, display: collapsed ? "none" : undefined }}
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
              {state.userMode === "draftsman" ? "Drafting" : state.userMode === "author" ? "Author" : "Run"}
            </button>
            {state.userMode === "author" && (
              <button
                onClick={() => setActiveTab("formulas")}
                className={`px-2 py-0.5 rounded font-medium transition-colors cursor-pointer inline-flex items-center gap-1 ${
                  activeTab === "formulas"
                    ? "bg-(--ink-panel) text-(--pen) font-semibold shadow-xs"
                    : "text-(--fg-muted) hover:text-(--fg-primary)"
                }`}
                title="Formulas made or used in this drawing"
              >
                <span>Formulas</span>
                {formulaCount > 0 && (
                  <span className="text-[9.5px] px-1 rounded-full bg-(--pen-soft) text-(--pen) font-mono">
                    {formulaCount}
                  </span>
                )}
              </button>
            )}
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

        <div className={activeTab === "properties" ? "flex flex-1 min-h-0 flex-col" : "hidden"}>
          <PropertiesPalette />
        </div>
        <div className={activeTab === "formulas" ? "flex flex-1 min-h-0 flex-col" : "hidden"}>
          <FormulasPanel context="author" />
        </div>
        <div className={activeTab === "parametric" ? "flex flex-1 min-h-0 flex-col" : "hidden"}>
          <div className="px-3.5 pt-2.5 pb-2 border-b border-(--rule)">
            <h2 className="text-[12px] font-semibold text-(--fg-primary)">{heading.title}</h2>
            <p className="text-[10.5px] leading-snug text-(--fg-muted) mt-0.5 max-w-[34ch]">
              {heading.sub}
            </p>
          </div>

          <div className={state.userMode === "draftsman" ? "flex flex-1 min-h-0 flex-col" : "hidden"}>
            <DraftPanel />
          </div>
          <div className={state.userMode === "author" ? "flex flex-1 min-h-0 flex-col" : "hidden"}>
            <AuthorPanel />
          </div>
          <div className={state.userMode === "user" ? "flex flex-1 min-h-0 flex-col" : "hidden"}>
            <RunPanel />
          </div>
        </div>
      </aside>
    </>
  );
}
