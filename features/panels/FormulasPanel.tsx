"use client";

import React from "react";
import {
  Sigma,
  Bot,
  Stamp,
  Sparkles,
  Boxes,
  Copy,
  Check,
  X,
  Link2Off,
  Search,
  ArrowRight,
  Pencil,
} from "lucide-react";
import { useUpce } from "../parametric/upceContext";
import { useDrawing } from "@/lib/state/drawingContext";
import type { SketchParameter, DerivedCandidate } from "@/lib/upce/types";
import { verifyProposedFormula } from "@/lib/upce/formulaCheck";

interface FormulasPanelProps {
  context?: "agent" | "author";
  onSwitchToDraw?: () => void;
}

export function FormulasPanel({ context = "author", onSwitchToDraw }: FormulasPanelProps) {
  const {
    sketch,
    derived,
    linkValue,
    unlinkValue,
    acceptDerivedCandidate,
    rejectDerivedCandidate,
    dependentsFor,
  } = useUpce();

  const { state } = useDrawing();

  const [activeFilter, setActiveFilter] = React.useState<"all" | "agent" | "author" | "candidates">("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [copiedName, setCopiedName] = React.useState<string | null>(null);

  // Inline edit state
  const [editingName, setEditingName] = React.useState<string | null>(null);
  const [editExpr, setEditExpr] = React.useState("");

  // Extract all parameters that have a formula or are derived
  const allParameters = React.useMemo(() => Object.values(sketch.parameters), [sketch.parameters]);

  const formulas = React.useMemo(() => {
    return allParameters.filter(
      (p) => p.role === "DERIVED" || (p.expr !== undefined && p.expr.trim().length > 0)
    );
  }, [allParameters]);

  const drivingParameters = React.useMemo(() => {
    return allParameters.filter((p) => p.role === "DRIVING");
  }, [allParameters]);

  // Counts by origin
  const agentFormulas = React.useMemo(() => {
    return formulas.filter(
      (f) =>
        f.provenance?.origin === "completion-assistant" ||
        f.provenance?.detail?.toLowerCase().includes("agent") ||
        f.description?.toLowerCase().includes("agent")
    );
  }, [formulas]);

  const authorFormulas = React.useMemo(() => {
    return formulas.filter(
      (f) =>
        f.provenance?.origin === "user" ||
        f.provenance?.origin === "inference-accepted" ||
        f.provenance?.origin === "template" ||
        !agentFormulas.includes(f)
    );
  }, [formulas, agentFormulas]);

  const candidates = derived ?? [];

  // Filtered list based on tab and search
  const filteredFormulas = React.useMemo(() => {
    let list = formulas;
    if (activeFilter === "agent") list = agentFormulas;
    else if (activeFilter === "author") list = authorFormulas;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          (f.expr && f.expr.toLowerCase().includes(q)) ||
          (f.description && f.description.toLowerCase().includes(q))
      );
    }
    return list;
  }, [formulas, agentFormulas, authorFormulas, activeFilter, searchQuery]);

  // Live validation for edit formula
  const editFormulaValidation = React.useMemo(() => {
    if (!editingName || !editExpr.trim()) return null;
    const namesOfShapes = Object.fromEntries(state.shapes.map((s) => [s.id, s.name || s.id]));
    return verifyProposedFormula(sketch, editingName, editExpr.trim(), {
      shapes: state.shapes,
      shapeNames: namesOfShapes,
    });
  }, [sketch, editingName, editExpr, state.shapes]);

  const handleCopy = (formula: SketchParameter) => {
    const text = `${formula.name} = ${formula.expr ?? ""}`;
    navigator.clipboard?.writeText(text);
    setCopiedName(formula.name);
    setTimeout(() => setCopiedName(null), 1500);
  };

  const handleSaveEditFormula = (paramName: string) => {
    if (!editExpr.trim() || !editFormulaValidation?.ok) return;
    linkValue(paramName, editExpr.trim());
    setEditingName(null);
    setEditExpr("");
  };

  const handleUnlink = (paramName: string) => {
    unlinkValue(paramName);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-(--ink-panel) text-[11px] overflow-hidden">
      {/* 1. Header Toolbar */}
      <div className="px-3 py-2.5 border-b border-(--rule) bg-(--ink-app)/40 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sigma className="w-3.5 h-3.5 text-(--pen)" strokeWidth={2.2} />
            <span className="font-semibold text-(--fg-primary)">Formulas & Expressions</span>
            <span className="px-1.5 py-0.5 rounded-full text-[9.5px] font-mono font-medium bg-(--pen-soft) text-(--pen)">
              {formulas.length}
            </span>
          </div>

          <span className="text-[10px] text-(--fg-muted) font-mono">
            Viewer & Store
          </span>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveFilter("all")}
            className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition-colors cursor-pointer ${
              activeFilter === "all"
                ? "bg-(--ink-raised) text-(--fg-primary) font-semibold shadow-xs"
                : "text-(--fg-muted) hover:text-(--fg-secondary)"
            }`}
          >
            All ({formulas.length})
          </button>
          <button
            onClick={() => setActiveFilter("agent")}
            className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1 ${
              activeFilter === "agent"
                ? "bg-(--ink-raised) text-purple-600 dark:text-purple-400 font-semibold shadow-xs"
                : "text-(--fg-muted) hover:text-(--fg-secondary)"
            }`}
          >
            <Bot className="w-3 h-3" />
            <span>Agent ({agentFormulas.length})</span>
          </button>
          <button
            onClick={() => setActiveFilter("author")}
            className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1 ${
              activeFilter === "author"
                ? "bg-(--ink-raised) text-blue-600 dark:text-blue-400 font-semibold shadow-xs"
                : "text-(--fg-muted) hover:text-(--fg-secondary)"
            }`}
          >
            <Stamp className="w-3 h-3" />
            <span>Author ({authorFormulas.length})</span>
          </button>
          {candidates.length > 0 && (
            <button
              onClick={() => setActiveFilter("candidates")}
              className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1 ${
                activeFilter === "candidates"
                  ? "bg-(--ink-raised) text-amber-600 dark:text-amber-400 font-semibold shadow-xs"
                  : "text-(--fg-muted) hover:text-(--fg-secondary)"
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>Candidates ({candidates.length})</span>
            </button>
          )}
        </div>

        {/* Guidance tip explaining where formulas are authored */}
        <div className="text-[9.5px] text-(--fg-muted) bg-(--ink-raised)/60 px-2 py-1 rounded border border-(--rule)/60 flex items-center justify-between gap-1">
          <span>Formula viewer & store</span>
          <span className="text-(--fg-secondary)">Add in <strong className="text-(--pen) font-medium">Author Mode → Relationships → Formula</strong></span>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2 top-2 text-(--fg-muted)" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search variable name, formula expression..."
            className="w-full h-[24px] pl-6 pr-2 rounded-[4px] bg-(--ink-sunken) border border-(--rule) text-[10.5px] text-(--fg-primary) outline-none focus:border-(--pen)"
          />
        </div>
      </div>

      {/* 3. Formulas List */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-(--rule)">
        {activeFilter === "candidates" ? (
          /* Candidates View */
          candidates.length === 0 ? (
            <div className="p-6 text-center text-(--fg-muted)">No pending formula candidates.</div>
          ) : (
            candidates.map((c) => (
              <div key={c.id} className="p-3 flex flex-col gap-1.5 bg-(--ink-raised)/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span className="font-semibold text-(--fg-primary)">{c.name}</span>
                  </div>
                  <span className="font-mono text-(--pen) font-semibold">
                    {c.value.toFixed(1)} mm
                  </span>
                </div>

                <div className="p-1.5 rounded bg-(--ink-sunken) font-mono text-[10.5px] text-(--fg-primary) border border-(--rule)">
                  {c.name} = {c.expr}
                </div>

                <p className="text-[10.5px] text-(--fg-secondary)">{c.headline}</p>

                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    onClick={() => acceptDerivedCandidate(c.id)}
                    className="h-[22px] px-2.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[10.5px] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3 h-3" />
                    <span>Accept Formula</span>
                  </button>
                  <button
                    onClick={() => rejectDerivedCandidate(c.id)}
                    className="h-[22px] px-2 rounded border border-(--rule) text-(--fg-muted) hover:text-(--fg-primary) text-[10.5px] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    <span>Discard</span>
                  </button>
                </div>
              </div>
            ))
          )
        ) : filteredFormulas.length === 0 ? (
          <div className="p-6 flex flex-col items-center justify-center text-center gap-2">
            <div className="w-9 h-9 rounded-full bg-(--ink-sunken) grid place-items-center text-(--fg-muted)">
              <Sigma className="w-5 h-5" strokeWidth={1.8} />
            </div>
            <p className="font-medium text-(--fg-primary)">No formulas found</p>
            <p className="text-[10.5px] text-(--fg-muted) max-w-[28ch] leading-relaxed">
              {searchQuery
                ? `No formulas match "${searchQuery}".`
                : context === "agent"
                  ? "As the CAD Agent draws or specifies relationships, formulas like 'TopWidth = ClearSpan + 2 * WallThickness' will appear here automatically."
                  : "Formulas created in Author mode or generated by the CAD Agent will appear here."}
            </p>
            {context === "agent" && onSwitchToDraw && (
              <button
                onClick={onSwitchToDraw}
                className="mt-2 h-[24px] px-2.5 rounded-[5px] bg-(--pen) text-white font-medium text-[10.5px] inline-flex items-center gap-1 cursor-pointer"
              >
                <Bot className="w-3 h-3" />
                <span>Go to Drafter</span>
              </button>
            )}
          </div>
        ) : (
          filteredFormulas.map((f) => {
            const isAgent =
              f.provenance?.origin === "completion-assistant" ||
              f.provenance?.detail?.toLowerCase().includes("agent") ||
              f.description?.toLowerCase().includes("agent");

            const isAuthor = f.provenance?.origin === "user";
            const isInferred = f.provenance?.origin === "inference-accepted";
            const isTemplate = f.provenance?.origin === "template";

            const dependents = dependentsFor(f.name);
            const isEditing = editingName === f.name;

            return (
              <div key={f.name} className="p-3 flex flex-col gap-2 hover:bg-(--ink-app)/20 transition-colors">
                {/* Header: Variable Name + Origin Badge + Evaluated Value */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-[12px] text-(--fg-primary)">{f.name}</span>

                    {isAgent ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                        <Bot className="w-2.5 h-2.5" />
                        <span>CAD Agent</span>
                      </span>
                    ) : isAuthor ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        <Stamp className="w-2.5 h-2.5" />
                        <span>Author</span>
                      </span>
                    ) : isInferred ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>Inferred</span>
                      </span>
                    ) : isTemplate ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/20">
                        <Boxes className="w-2.5 h-2.5" />
                        <span>Template</span>
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1 text-right shrink-0">
                    <span className="text-[12px] font-mono font-semibold text-(--pen)">
                      {f.value.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-(--fg-muted)">{f.unit}</span>
                  </div>
                </div>

                {/* Formula Expression Box */}
                {isEditing ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-(--fg-muted)">{f.name} =</span>
                      <input
                        value={editExpr}
                        onChange={(e) => setEditExpr(e.target.value)}
                        className="flex-1 min-w-0 h-[24px] px-1.5 rounded font-mono text-[11px] bg-(--ink-sunken) border border-(--pen) text-(--fg-primary) outline-none"
                      />
                    </div>

                    {/* Operands */}
                    <div className="flex flex-wrap gap-1 max-h-[60px] overflow-y-auto pr-0.5">
                      {allParameters
                        .filter((p) => p.name !== f.name)
                        .map((p) => (
                          <button
                            key={p.name}
                            type="button"
                            onClick={() => setEditExpr((prev) => (prev ? `${prev} ${p.name}` : p.name))}
                            title={`${p.role} · ${p.value.toFixed(2)} ${p.unit}`}
                            className="px-1.5 h-[19px] rounded text-[9.5px] border border-(--rule) bg-(--ink-raised) text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>{p.name}</span>
                            <span className="num opacity-60 font-mono text-[8.5px]">{p.value.toFixed(0)}</span>
                          </button>
                        ))}
                    </div>

                    {editFormulaValidation && (
                      <p
                        className={`text-[9.5px] ${
                          editFormulaValidation.ok ? "text-emerald-500" : "text-rose-500"
                        }`}
                      >
                        {editFormulaValidation.ok
                          ? `Valid: = ${editFormulaValidation.predicted?.toFixed(1)} mm`
                          : editFormulaValidation.reason}
                      </p>
                    )}

                    <div className="flex items-center justify-end gap-1 pt-1">
                      <button
                        onClick={() => setEditingName(null)}
                        className="h-[20px] px-1.5 rounded text-[10px] text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEditFormula(f.name)}
                        disabled={!editFormulaValidation?.ok}
                        className="h-[20px] px-2 rounded bg-(--pen) text-white text-[10px] font-medium disabled:opacity-40 cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="group relative rounded-[4px] bg-(--ink-sunken) border border-(--rule) px-2.5 py-1.5 flex items-center justify-between gap-2">
                    <code className="font-mono text-[11px] text-(--fg-primary) truncate">
                      {f.name} = {f.expr}
                    </code>

                    <button
                      onClick={() => handleCopy(f)}
                      title="Copy formula"
                      className="opacity-60 group-hover:opacity-100 transition-opacity text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer p-0.5"
                    >
                      {copiedName === f.name ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                )}

                {/* Description if present */}
                {(f.description || f.provenance?.detail) && (
                  <p className="text-[10.5px] text-(--fg-secondary) leading-snug">
                    {f.description ?? f.provenance?.detail}
                  </p>
                )}

                {/* Input Dependencies (Variables that feed into this formula) */}
                {f.dependencies && f.dependencies.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[9.5px] text-(--fg-muted)">Inputs:</span>
                    {f.dependencies.map((depName) => {
                      const depParam = sketch.parameters[depName];
                      const val = depParam ? `${depParam.value.toFixed(1)} ${depParam.unit}` : "unknown";
                      return (
                        <span
                          key={depName}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-mono bg-(--ink-raised) border border-(--rule) text-(--fg-secondary)"
                          title={`Input variable ${depName}: ${val}`}
                        >
                          <span className="font-medium text-(--fg-primary)">{depName}</span>
                          <span className="text-(--pen)">({val})</span>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Downstream Dependents (Formulas or constraints that read this) */}
                {dependents.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap text-[9.5px] text-(--fg-muted)">
                    <ArrowRight className="w-2.5 h-2.5 shrink-0" />
                    <span>Feeds into:</span>
                    {dependents.map((dep) => (
                      <span key={dep} className="font-mono text-(--fg-secondary)">
                        {dep}
                      </span>
                    ))}
                  </div>
                )}

                {/* Bottom Actions Toolbar */}
                <div className="flex items-center justify-between pt-1 border-t border-(--rule)/50 text-[10px]">
                  <div className="flex items-center gap-2 text-(--fg-muted)">
                    <span>Role: {f.role}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingName(f.name);
                        setEditExpr(f.expr ?? "");
                      }}
                      className="inline-flex items-center gap-1 text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer"
                      title="Edit this formula expression"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                      <span>Edit</span>
                    </button>

                    <button
                      onClick={() => handleUnlink(f.name)}
                      className="inline-flex items-center gap-1 text-(--fg-muted) hover:text-amber-500 cursor-pointer"
                      title="Unlink formula and revert to manual driving dimension"
                    >
                      <Link2Off className="w-2.5 h-2.5" />
                      <span>Unlink</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
