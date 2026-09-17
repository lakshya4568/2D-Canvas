"use client";

import React from "react";
import { Bot, PanelLeftClose, Columns, AppWindow } from "lucide-react";
import { AssistantPanel } from "../panels/AssistantPanel";
import { useAgentPreview } from "../agent/agentPreview";

/**
 * Dedicated left-side panel for the CAD Agent (left top).
 *
 * Placed on the left side of the canvas workspace, leaving the right side
 * dedicated to the UPCE Persona Dock (Draftsman, Author, Run, Properties).
 *
 * Supports:
 * - Docked mode (full height left sidebar pushing canvas)
 * - Floating mode (card pinned to top-left of canvas)
 * - Horizontal drag resize from the right edge
 * - Collapse / Expand with live drawing execution indicators
 */

const MIN_WIDTH = 290;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 350;
const CAD_AGENT_DOCK_WIDTH_KEY = "cad.agent.dock.width";
const CAD_AGENT_DOCK_MODE_KEY = "cad.agent.dock.mode";

export function CadAgentDock({
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
  const agentPreview = useAgentPreview();
  const isRunning = Boolean(agentPreview?.running);
  const draggingRef = React.useRef(false);

  const [dockMode, setDockMode] = React.useState<"docked" | "floating">(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(CAD_AGENT_DOCK_MODE_KEY);
      if (saved === "floating" || saved === "docked") return saved;
    }
    return "docked";
  });

  const handleToggleMode = () => {
    const nextMode = dockMode === "docked" ? "floating" : "docked";
    setDockMode(nextMode);
    try {
      window.localStorage.setItem(CAD_AGENT_DOCK_MODE_KEY, nextMode);
    } catch {
      /* ignore */
    }
  };

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      // Resizing from the left side dock: width increases as cursor moves right
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
      onWidthChange(next);
      try {
        window.localStorage.setItem(CAD_AGENT_DOCK_WIDTH_KEY, String(next));
      } catch {
        /* preference only */
      }
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

  const headerContent = (
    <div className="h-[30px] border-b border-(--rule) bg-(--ink-app)/60 flex items-center justify-between px-2.5 text-[11px] shrink-0">
      <div className="flex items-center gap-1.5">
        <Bot className="w-[13px] h-[13px] text-(--pen)" strokeWidth={2} />
        <span className="font-semibold text-(--fg-primary)">CAD Agent</span>
        {isRunning ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            drawing
          </span>
        ) : (
          <span className="text-[10px] text-(--fg-muted)">copilot</span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={handleToggleMode}
          title={dockMode === "docked" ? "Float panel to top-left" : "Dock panel to left sidebar"}
          aria-label={dockMode === "docked" ? "Float panel to top-left" : "Dock panel to left sidebar"}
          className="w-[22px] h-[22px] rounded grid place-items-center text-(--fg-muted) hover:bg-(--ink-raised) hover:text-(--fg-primary) shrink-0 cursor-pointer"
        >
          {dockMode === "docked" ? (
            <AppWindow className="w-[12px] h-[12px]" strokeWidth={1.9} />
          ) : (
            <Columns className="w-[12px] h-[12px]" strokeWidth={1.9} />
          )}
        </button>

        <button
          onClick={onToggleCollapse}
          title="Collapse CAD Agent panel"
          aria-label="Collapse CAD Agent panel"
          className="w-[22px] h-[22px] rounded grid place-items-center text-(--fg-muted) hover:bg-(--ink-raised) hover:text-(--fg-primary) shrink-0 cursor-pointer"
        >
          <PanelLeftClose className="w-[13px] h-[13px]" strokeWidth={1.9} />
        </button>
      </div>
    </div>
  );

  const panelBody = (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <AssistantPanel />
    </div>
  );

  return (
    <>
      {/* Floating reopen button at top-left of canvas when collapsed */}
      {collapsed && (
        <button
          onClick={onToggleCollapse}
          title="Open CAD Agent panel (Left top)"
          aria-label="Open CAD Agent panel (Left top)"
          className="absolute top-16 left-3 z-20 h-[28px] px-2.5 rounded-[5px] flex items-center gap-1.5 bg-(--ink-panel)/95 border border-(--rule) text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer shadow-md text-[11px] backdrop-blur-xs"
        >
          <Bot className="w-[14px] h-[14px] text-(--pen)" strokeWidth={2} />
          <span className="font-semibold text-(--fg-primary)">CAD Agent</span>
          {isRunning && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
        </button>
      )}

      {dockMode === "docked" ? (
        <aside
          style={{ width: collapsed ? 0 : width, display: collapsed ? "none" : undefined }}
          className="shrink-0 h-full bg-(--ink-panel) border-r border-(--rule) flex flex-col relative z-20 shadow-lg"
        >
          {/* Drag handle on right edge */}
          <div
            onMouseDown={() => {
              draggingRef.current = true;
              document.body.style.cursor = "col-resize";
            }}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize CAD Agent panel"
            className="absolute right-[-3px] top-0 bottom-0 w-[6px] cursor-col-resize hover:bg-(--pen-line) transition-colors duration-100 z-10"
          />

          {headerContent}
          {panelBody}
        </aside>
      ) : (
        /* Floating mode: Top-left overlay card */
        !collapsed && (
          <div
            style={{ width }}
            className="absolute top-8.5 left-3 z-30 h-[calc(100%-54px)] max-h-[820px] bg-(--ink-panel) border border-(--rule) rounded-lg shadow-2xl flex flex-col backdrop-blur-md overflow-hidden"
          >
            {/* Drag handle on right edge */}
            <div
              onMouseDown={() => {
                draggingRef.current = true;
                document.body.style.cursor = "col-resize";
              }}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize CAD Agent panel"
              className="absolute right-[-3px] top-0 bottom-0 w-[6px] cursor-col-resize hover:bg-(--pen-line) transition-colors duration-100 z-10"
            />

            {headerContent}
            {panelBody}
          </div>
        )
      )}
    </>
  );
}
