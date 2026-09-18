"use client";

/**
 * "What is this?" — the editor's understanding of a bridge drawn by hand.
 *
 * RolePicker tags the selected geometry with a term from the bridge
 * vocabulary; SemanticChip puts that question on the canvas next to the
 * selection; UnderstandingSection lists what the editor recognised (to accept
 * or reject), what it already understands with the values it reads from the
 * geometry, and the vocabulary itself.
 */

import React from "react";
import { Check, X, Sparkles, BookOpen, Tag, Search } from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import type { Shape } from "@/lib/geometry/types";
import { BRIDGE_TERMS, TERM_GROUPS, termFor } from "@/lib/bridge/glossary";
import { recognizeBridge, type RoleCandidate } from "@/lib/bridge/recognize";
import { drawnFacts } from "@/lib/bridge/drawnFacts";
import { Pill } from "@/features/panels/ui/Disclosure";

function useFreeSelection(): Shape[] {
  const { state } = useDrawing();
  return React.useMemo(() => {
    const ids = new Set(state.selectedIds);
    return state.shapes.filter((s) => ids.has(s.id) && !s.componentInstanceId);
  }, [state.selectedIds, state.shapes]);
}

export function RolePicker({ compact }: { compact?: boolean }) {
  const { dispatch } = useDrawing();
  const sel = useFreeSelection();
  if (sel.length === 0) return null;
  const roles = [...new Set(sel.map((s) => s.semanticRole ?? ""))];
  const current = roles.length === 1 ? roles[0] : "__mixed";
  const term = termFor(current);
  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label="What is this?"
        value={current}
        onChange={(e) => dispatch({ type: "CAD_CLASSIFY", ids: sel.map((s) => s.id), role: e.target.value })}
        className={`${compact ? "h-[26px] text-[11px]" : "h-[28px] text-[11.5px]"} rounded-[5px] bg-(--ink-raised) border border-(--rule) focus:border-(--pen) px-1.5 text-(--fg-primary) cursor-pointer`}
      >
        {current === "__mixed" && <option value="__mixed">Several roles…</option>}
        <option value="">{sel.length > 1 ? `What are these ${sel.length}?` : "What is this?"}</option>
        {TERM_GROUPS.map((g) => (
          <optgroup key={g} label={g}>
            {BRIDGE_TERMS.filter((t) => t.group === g).map((t) => (
              <option key={t.role} value={t.role}>
                {t.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {term && !compact && <p className="text-[10.5px] leading-snug text-(--fg-muted)">{term.definition}</p>}
    </div>
  );
}

/** Floating on the canvas while free geometry is selected. */
export function SemanticChip() {
  const sel = useFreeSelection();
  const { state } = useDrawing();
  if (sel.length === 0 || state.tool !== "select") return null;
  const term = termFor(sel[0].semanticRole);
  return (
    <div className="absolute top-10 left-3 z-20 flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-[7px] bg-(--ink-panel)/95 border border-(--rule-strong) shadow-md backdrop-blur-sm max-w-[330px]">
      <Tag className="w-3.5 h-3.5 text-(--pen) shrink-0" />
      <div className="min-w-0 flex-1">
        <RolePicker compact />
      </div>
      {term && (
        <span className="text-[10px] text-(--fg-muted) max-w-[120px] truncate" title={term.definition}>
          {term.group}
        </span>
      )}
    </div>
  );
}

export function UnderstandingSection() {
  const { state, dispatch } = useDrawing();
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const [q, setQ] = React.useState("");
  const candidates = React.useMemo(
    () => recognizeBridge(state.shapes, state.cad.annotations, state.cad.settings).filter((c) => !dismissed.has(c.id)),
    [state.shapes, state.cad.annotations, state.cad.settings, dismissed]
  );
  const facts = React.useMemo(() => drawnFacts(state.shapes, state.cad.settings), [state.shapes, state.cad.settings]);
  const tagged = React.useMemo(() => {
    const m = new Map<string, { role: string; ids: string[] }>();
    for (const s of state.shapes) {
      if (!s.semanticRole || s.componentInstanceId) continue;
      const key = `${s.semanticRole}|${s.groupId ?? s.id}`;
      const e = m.get(key) ?? { role: s.semanticRole, ids: [] };
      e.ids.push(s.id);
      m.set(key, e);
    }
    return [...m.values()];
  }, [state.shapes]);

  const accept = (c: RoleCandidate) => dispatch({ type: "CAD_CLASSIFY", ids: c.shapeIds, role: c.role });
  const show = (ids: string[]) => dispatch({ type: "SELECT_MULTIPLE", ids });
  const free = state.shapes.filter((s) => !s.componentInstanceId).length;
  const factText = (k: string, v: number) => (k.endsWith("_m") ? `${v >= 0 ? "+" : ""}${v.toFixed(3)} m` : k.endsWith("_m2") ? `${v.toFixed(2)} m²` : `${Math.round(v)} mm`);
  const FACT_LABEL: Record<string, string> = {
    bed_level_m: "Bed level",
    hfl_m: "HFL",
    lwl_m: "LWL",
    formation_level_m: "Formation",
    rail_level_m: "Rail level",
    foundation_level_m: "Foundation level",
    soffit_level_m: "Soffit",
    danger_level_m: "Danger level",
    scour_level_m: "Scour level",
    ground_level_m: "Ground level",
    cushion_mm: "Earth cushion",
    clear_opening_mm: "Clear span",
    clear_height_mm: "Clear height",
    linear_waterway_mm: "Linear waterway",
    waterway_area_m2: "Waterway area",
    freeboard_mm: "Free board (formation − HFL)",
    vertical_clearance_mm: "Vertical clearance (soffit − HFL)",
    headroom_mm: "Headroom (soffit − bed)",
    pile_diameter_mm: "Pile diameter",
    pile_min_spacing_mm: "Pile spacing (min)",
  };

  return (
    <div className="flex flex-col gap-3">
      {free === 0 ? (
        <p className="text-[11px] text-(--fg-muted) leading-relaxed">
          Draw your bridge with the pen — lines, polylines, rectangles — then say what each part is (select it and choose from “What is this?”), or accept what the editor recognises below. Labels you write (HFL, BED LEVEL, EARTH CUSHION…) are read too.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <p className="label">Selected</p>
            <RolePicker />
            {state.selectedIds.length === 0 && <p className="text-[10.5px] text-(--fg-muted)">Select a line or outline to say what it is.</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <p className="label inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-(--pen)" /> Recognised ({candidates.length})
              </p>
              {candidates.some((c) => c.confidence >= 0.6) && (
                <button
                  onClick={() => candidates.filter((c) => c.confidence >= 0.6).forEach(accept)}
                  className="h-[20px] px-1.5 rounded-[4px] text-[10px] text-(--pen) hover:bg-(--pen-soft) cursor-pointer"
                >
                  Accept all ≥ 60 %
                </button>
              )}
            </div>
            {candidates.length === 0 && <p className="text-[10.5px] text-(--fg-muted)">Nothing new to propose.</p>}
            {candidates.slice(0, 20).map((c) => (
              <div key={c.id} className="rounded-[6px] border border-(--rule) px-2 py-1.5 flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <button onClick={() => show(c.shapeIds)} className="text-[11.5px] font-medium text-(--fg-primary) hover:text-(--pen) cursor-pointer text-left flex-1 truncate" title="Select it on the drawing">
                    {c.label}
                  </button>
                  <Pill tone={c.confidence >= 0.8 ? "good" : c.confidence >= 0.55 ? "neutral" : "attention"}>{Math.round(c.confidence * 100)} %</Pill>
                  <button onClick={() => accept(c)} aria-label={`Accept ${c.label}`} title="Accept" className="w-[20px] h-[20px] grid place-items-center rounded text-(--ok) hover:bg-(--ok-soft) cursor-pointer">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDismissed((d) => new Set([...d, c.id]))} aria-label={`Reject ${c.label}`} title="Reject" className="w-[20px] h-[20px] grid place-items-center rounded text-(--fg-muted) hover:text-(--crit) cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {c.evidence.map((e, i) => (
                  <p key={i} className="text-[10.5px] leading-snug text-(--fg-secondary)">
                    · {e}
                  </p>
                ))}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            <p className="label">Understood ({tagged.length})</p>
            {tagged.length === 0 && <p className="text-[10.5px] text-(--fg-muted)">Nothing tagged yet.</p>}
            {tagged.map((t) => (
              <button key={t.ids[0]} onClick={() => show(t.ids)} className="text-left flex items-center justify-between gap-2 text-[11px] hover:text-(--pen) cursor-pointer" title={termFor(t.role)?.definition}>
                <span className="text-(--fg-primary) truncate">{termFor(t.role)?.label ?? t.role}</span>
                <span className="text-[10px] text-(--fg-muted)">{t.ids.length > 1 ? `${t.ids.length} edges` : "1 entity"}</span>
              </button>
            ))}
            {facts.length > 0 && (
              <div className="mt-1 rounded-[6px] border border-(--rule) overflow-hidden">
                {facts
                  .filter((f) => FACT_LABEL[f.key])
                  .map((f, i) => (
                    <div key={`${f.key}${i}`} className={`flex items-center justify-between px-2 h-[24px] text-[11px] ${i ? "border-t border-(--rule)" : ""}`}>
                      <span className="text-(--fg-secondary)">{FACT_LABEL[f.key]}</span>
                      <span className="num text-(--fg-primary)">{factText(f.key, f.value)}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <p className="label inline-flex items-center gap-1">
          <BookOpen className="w-3 h-3" /> Bridge terms
        </p>
        <label className="flex items-center gap-1.5 h-[26px] px-2 rounded-[5px] bg-(--ink-raised) border border-(--rule)">
          <Search className="w-3 h-3 text-(--fg-muted)" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="bed level, cushion, HFL…" aria-label="Search bridge terms" className="flex-1 bg-transparent outline-none text-[11px] text-(--fg-primary)" />
        </label>
        {q.trim() &&
          BRIDGE_TERMS.filter((t) => `${t.label} ${t.aliases.join(" ")} ${t.definition}`.toLowerCase().includes(q.trim().toLowerCase()))
            .slice(0, 8)
            .map((t) => (
              <div key={t.role} className="rounded-[6px] border border-(--rule) px-2 py-1.5">
                <p className="text-[11.5px] font-medium text-(--fg-primary)">
                  {t.label} <span className="text-[10px] text-(--fg-muted) font-normal">· {t.group}</span>
                </p>
                <p className="text-[10.5px] leading-snug text-(--fg-secondary)">{t.definition}</p>
                <p className="text-[9.5px] text-(--fg-muted) mt-0.5">Written as: {t.aliases.slice(0, 5).join(", ")}</p>
              </div>
            ))}
      </div>
    </div>
  );
}
