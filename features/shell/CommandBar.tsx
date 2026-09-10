"use client";

import React from "react";
import {
  Undo2,
  Redo2,
  Grid3x3,
  Magnet,
  Ruler,
  Sun,
  Moon,
  Trash2,
  LayoutTemplate,
} from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import { ModeSwitch } from "./ModeSwitch";
import { ExportMenu } from "../toolbar/ExportMenu";

/**
 * The command bar. One row, three zones: identity, mode, controls.
 *
 * Toggles that change how the pointer behaves (grid snap, object snap, dimension
 * display) sit together and read their state from the model, so what is on is
 * visible without hovering — a drafting tool is operated, not read.
 */

function BarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
  danger,
}: {
  icon: typeof Undo2;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={[
        "w-[28px] h-[26px] rounded-[5px] grid place-items-center transition-colors duration-100",
        disabled
          ? "opacity-25 cursor-not-allowed text-(--fg-muted)"
          : active
            ? "bg-(--pen-soft) text-(--pen) cursor-pointer"
            : danger
              ? "text-(--fg-muted) hover:bg-(--crit-soft) hover:text-(--crit) cursor-pointer"
              : "text-(--fg-muted) hover:bg-(--ink-raised) hover:text-(--fg-primary) cursor-pointer",
      ].join(" ")}
    >
      <Icon className="w-[14px] h-[14px]" strokeWidth={1.9} />
    </button>
  );
}

function Divider() {
  return <div className="w-px h-[18px] bg-(--rule)" aria-hidden="true" />;
}

export function CommandBar({ onOpenTemplates }: { onOpenTemplates: () => void }) {
  const {
    state,
    undo,
    redo,
    canUndo,
    canRedo,
    toggleGrid,
    toggleGridSnap,
    toggleObjectSnap,
    toggleDimensions,
    setThemeMode,
    clearAll,
  } = useDrawing();

  const isDark = state.themeMode !== "light";

  return (
    <header className="h-[44px] shrink-0 bg-(--ink-panel) border-b border-(--rule) px-3 flex items-center gap-3 z-30">
      {/* Identity */}
      <div className="flex items-baseline gap-2 pr-1 select-none">
        <span className="text-[13px] font-semibold tracking-tight text-(--fg-primary)">
          Aagento
        </span>
        <span className="text-[10.5px] text-(--fg-muted) hidden md:inline">
          Drafting Table
        </span>
      </div>

      <Divider />
      <ModeSwitch />
      <Divider />

      <div className="flex items-center gap-0.5">
        <BarButton icon={Undo2} label="Undo" onClick={undo} disabled={!canUndo} />
        <BarButton icon={Redo2} label="Redo" onClick={redo} disabled={!canRedo} />
      </div>

      <Divider />

      <div className="flex items-center gap-0.5">
        <BarButton
          icon={Grid3x3}
          label="Show grid"
          onClick={toggleGrid}
          active={state.showGrid}
        />
        <BarButton
          icon={Magnet}
          label="Snap to objects"
          onClick={toggleObjectSnap}
          active={state.objectSnapEnabled}
        />
        <BarButton
          icon={Ruler}
          label="Show dimensions"
          onClick={toggleDimensions}
          active={state.showDimensions}
        />
        <button
          title="Snap to grid"
          aria-pressed={state.gridSnapEnabled}
          onClick={toggleGridSnap}
          className={[
            "h-[26px] px-2 rounded-[5px] text-[10.5px] font-medium transition-colors duration-100 cursor-pointer",
            state.gridSnapEnabled
              ? "bg-(--pen-soft) text-(--pen)"
              : "text-(--fg-muted) hover:bg-(--ink-raised) hover:text-(--fg-primary)",
          ].join(" ")}
        >
          GRID
        </button>
      </div>

      <div className="flex-1" />

      <button
        onClick={onOpenTemplates}
        className="h-[26px] px-2.5 rounded-[5px] flex items-center gap-1.5 text-[11px] font-medium text-(--fg-secondary) hover:bg-(--ink-raised) hover:text-(--fg-primary) transition-colors duration-100 cursor-pointer"
      >
        <LayoutTemplate className="w-[13px] h-[13px]" strokeWidth={1.9} />
        Templates
      </button>

      {/* ExportMenu owns its own trigger and dropdown. */}
      <ExportMenu direction="down" />

      <Divider />

      <BarButton
        icon={isDark ? Sun : Moon}
        label={isDark ? "Light theme" : "Dark theme"}
        onClick={() => setThemeMode(isDark ? "light" : "dark")}
      />
      <BarButton icon={Trash2} label="Clear drawing" onClick={clearAll} danger />
    </header>
  );
}
