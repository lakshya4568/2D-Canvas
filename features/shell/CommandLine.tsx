"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Terminal, ChevronRight, CornerDownLeft, Sparkles, X } from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import { Point } from "@/lib/geometry/types";
import { CadCommandRegistry } from "@/lib/commands/CommandRegistry";
import { CommandCompletion, CommandExecutionResult } from "@/lib/commands/types";

interface CommandLineProps {
  cursorPos: Point | null;
  onOpenTemplates?: () => void;
  onOpenHelp?: () => void;
  onNotification?: (msg: { text: string; type: "success" | "error" | "info" }) => void;
}

interface LogEntry {
  id: string;
  text: string;
  type: "input" | "output" | "error";
  timestamp: number;
}

export function CommandLine({
  cursorPos,
  onOpenTemplates,
  onOpenHelp,
  onNotification,
}: CommandLineProps) {
  const {
    state,
    dispatch,
    setTool,
    undo,
    redo,
    clearAll,
  } = useDrawing();

  const [inputVal, setInputVal] = useState("");
  const [prompt, setPrompt] = useState("Command:");
  const [activeCommand, setActiveCommand] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [completions, setCompletions] = useState<CommandCompletion[]>([]);
  const [selectedCompletionIdx, setSelectedCompletionIdx] = useState<number>(0);
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: "init",
      text: "UPCE CAD Command Terminal initialized. Type 'L' for Line, 'REC' for Rectangle, or 'HELP' for guide.",
      type: "output",
      timestamp: Date.now(),
    },
  ]);
  const [isExpanded, setIsExpanded] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const lastPointRef = useRef<Point | null>(null);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Update autocomplete completions on input
  useEffect(() => {
    if (!inputVal.trim()) {
      setCompletions([]);
      setSelectedCompletionIdx(0);
      return;
    }
    const comps = CadCommandRegistry.getCompletions(inputVal);
    setCompletions(comps);
    setSelectedCompletionIdx(0);
  }, [inputVal]);

  const addLog = useCallback((text: string, type: "input" | "output" | "error" = "output") => {
    setLogs((prev) => [
      ...prev.slice(-30),
      { id: `${Date.now()}_${Math.random()}`, text, type, timestamp: Date.now() },
    ]);
  }, []);

  const executeInput = useCallback(
    (rawInput: string) => {
      const text = rawInput.trim();
      if (!text) return;

      addLog(`Command: ${text}`, "input");

      // Save to history
      setHistory((prev) => [text, ...prev.filter((item) => item !== text)].slice(0, 50));
      setHistoryIndex(-1);

      const ctx = {
        state,
        shapes: state.shapes,
        selectedIds: state.selectedIds,
        lastPoint: lastPointRef.current,
        cursorPos,
        dispatch,
        setTool,
        undo,
        redo,
        clearAll,
        openHelp: onOpenHelp,
        openTemplates: onOpenTemplates,
        notify: onNotification,
      };

      const result: CommandExecutionResult = CadCommandRegistry.execute(text, ctx);

      if (result.success) {
        if (result.message) {
          addLog(result.message, "output");
        }
        if (result.nextPrompt) {
          setPrompt(result.nextPrompt);
        } else {
          setPrompt("Command:");
        }
        setActiveCommand(result.activeCommand ?? null);
      } else {
        addLog(result.message || "Unknown error executing command", "error");
        setPrompt("Command:");
        setActiveCommand(null);
      }

      setInputVal("");
      setCompletions([]);
    },
    [state.shapes, state.selectedIds, cursorPos, dispatch, setTool, undo, redo, clearAll, onOpenHelp, onOpenTemplates, onNotification, addLog]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (completions.length > 0 && selectedCompletionIdx >= 0 && selectedCompletionIdx < completions.length && !inputVal.includes(",")) {
        const chosen = completions[selectedCompletionIdx];
        executeInput(chosen.alias);
      } else {
        executeInput(inputVal);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (completions.length > 0) {
        setSelectedCompletionIdx((prev) => (prev > 0 ? prev - 1 : completions.length - 1));
      } else if (history.length > 0) {
        const nextIdx = Math.min(history.length - 1, historyIndex + 1);
        setHistoryIndex(nextIdx);
        setInputVal(history[nextIdx]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (completions.length > 0) {
        setSelectedCompletionIdx((prev) => (prev < completions.length - 1 ? prev + 1 : 0));
      } else if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setInputVal(history[nextIdx]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInputVal("");
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setInputVal("");
      setCompletions([]);
      setPrompt("Command:");
      setActiveCommand(null);
      setTool("select");
      dispatch({ type: "SELECT", id: null });
      addLog("*Cancel*", "output");
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (completions.length > 0) {
        setInputVal(completions[selectedCompletionIdx].commandName);
      }
    }
  };

  // Global hotkey: typing while canvas is active auto-focuses command line
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key.length === 1 && !e.repeat) {
        inputRef.current?.focus();
      } else if (e.key === "`" || (e.ctrlKey && e.key === "`")) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  return (
    <div className="w-full bg-(--ink-raised) border-t border-(--rule) flex flex-col transition-all duration-150 z-20 select-none">
      {/* Expandable History Log Drawer */}
      {isExpanded && (
        <div className="h-32 px-3 py-1.5 overflow-y-auto font-mono text-[11px] flex flex-col gap-0.5 bg-(--ink-sunken) border-b border-(--rule)">
          {logs.map((log) => (
            <div
              key={log.id}
              className={`leading-tight ${
                log.type === "input"
                  ? "text-(--pen) font-semibold"
                  : log.type === "error"
                  ? "text-(--crit)"
                  : "text-(--fg-muted)"
              }`}
            >
              {log.text}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}

      {/* Autocomplete Popup */}
      {completions.length > 0 && (
        <div className="absolute bottom-10 left-3 bg-(--ink-panel) border border-(--rule) rounded-md shadow-2xl overflow-hidden z-50 min-w-[280px] max-w-sm backdrop-blur-md">
          <div className="px-2 py-1 text-[9.5px] uppercase tracking-wider text-(--fg-muted) border-b border-(--rule) flex items-center gap-1 font-mono">
            <Sparkles className="w-2.5 h-2.5 text-(--pen)" />
            <span>Command Suggestions</span>
          </div>
          <div className="flex flex-col py-1">
            {completions.map((c, i) => (
              <button
                key={c.commandName}
                onClick={() => executeInput(c.alias)}
                className={`px-2.5 py-1 text-left flex items-center justify-between text-[11px] font-mono cursor-pointer transition-colors ${
                  i === selectedCompletionIdx
                    ? "bg-(--pen-soft) text-(--pen) font-bold"
                    : "text-(--fg-secondary) hover:bg-(--ink-raised)"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-(--fg-primary)">{c.alias}</span>
                  <span className="text-[10px] text-(--fg-muted)">({c.commandName})</span>
                </div>
                <span className="text-[10px] text-(--fg-muted) font-sans truncate max-w-[140px]">
                  {c.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Primary Input Bar */}
      <div className="h-[30px] px-3 flex items-center gap-2 text-xs font-mono">
        <button
          onClick={() => setIsExpanded((v) => !v)}
          title="Toggle Command Log Drawer"
          className="p-1 text-(--fg-muted) hover:text-(--fg-primary) rounded transition-colors cursor-pointer"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>

        <span className="text-[11.5px] font-medium text-(--fg-secondary) shrink-0 flex items-center gap-0.5">
          {prompt}
        </span>

        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type command, alias (L, C, REC), or coordinates (@dX,dY, Dist<Angle)..."
          className="flex-1 bg-transparent border-none outline-none text-(--fg-primary) text-[11.5px] placeholder-(--fg-muted)/60 font-mono tracking-wide"
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
        />

        {inputVal && (
          <button
            onClick={() => setInputVal("")}
            className="p-1 text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        )}

        <button
          onClick={() => executeInput(inputVal)}
          disabled={!inputVal.trim()}
          title="Execute Command (Enter)"
          className="p-1 text-(--fg-muted) hover:text-(--pen) disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          <CornerDownLeft className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
