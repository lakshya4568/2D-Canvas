"use client";

import React from "react";
import { Bot, PanelRightClose, PanelRightOpen } from "lucide-react";
import { AssistantPanel } from "../panels/AssistantPanel";
import { useAgentPreview } from "../agent/agentPreview";

/**
 * Dedicated right-side panel for the CAD Agent.
 *
 * Separated from the Persona Dock (§3) so that the autonomous CAD Agent
 * operates as an independent actor across personas (Drafting, Authoring, Run)
 * without competing for tab space against Properties or Persona views.
 */

const MIN_WIDTH = 290;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 350;
const CAD_AGENT_DOCK_WIDTH_KEY = "cad.agent.dock.width";

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

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX));
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

  return (
    <>
      {collapsed && (
        <button
          onClick={onToggleCollapse}
          title="Open CAD Agent panel"
          aria-label="Open CAD Agent panel"
          className="absolute top-2 right-11 z-20 h-[28px] px-2 rounded-[5px] flex items-center gap-1.5 bg-(--ink-panel) border border-(--rule) text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer shadow-sm text-[11px]"
        >
          <Bot className="w-[14px] h-[14px] text-(--pen)" strokeWidth={2} />
          <span className="font-medium">CAD Agent</span>
          {isRunning && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
        </button>
      )}

      <aside
        style={{ width: collapsed ? 0 : width, display: collapsed ? "none" : undefined }}
        className="shrink-0 h-full bg-(--ink-panel) border-l border-(--rule) flex flex-col relative z-20 shadow-xl"
      >
        {/* Drag handle */}
        <div
          onMouseDown={() => {
            draggingRef.current = true;
            document.body.style.cursor = "col-resize";
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize CAD Agent panel"
          className="absolute left-[-3px] top-0 bottom-0 w-[6px] cursor-col-resize hover:bg-(--pen-line) transition-colors duration-100 z-10"
        />

        {/* Header Bar */}
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

          <button
            onClick={onToggleCollapse}
            title="Collapse CAD Agent panel"
            aria-label="Collapse CAD Agent panel"
            className="w-[22px] h-[22px] rounded grid place-items-center text-(--fg-muted) hover:bg-(--ink-raised) hover:text-(--fg-primary) shrink-0 cursor-pointer"
          >
            <PanelRightClose className="w-[13px] h-[13px]" strokeWidth={1.9} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
          <AssistantPanel />
        </div>
      </aside>
    </>
  );
}
