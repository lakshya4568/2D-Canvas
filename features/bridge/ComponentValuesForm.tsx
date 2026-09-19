"use client";

/**
 * The values of one component instance, as a form.
 *
 * Driving values are inputs; derived values are read-only results with no
 * expression shown (§64: the project engineer never sees a formula). A value
 * that follows a relationship shows its result and the names it follows, not
 * the expression; an "auto" value shows its current result until someone
 * types over it, and can be handed back. An edit either regenerates the
 * component or is refused with the reason, and a refused value snaps back in
 * the box so the form never shows a number the drawing does not have.
 * Out-of-range values are accepted and flagged (§26), never silently clamped.
 */

import React from "react";
import { Lock, TriangleAlert, Undo2, X, CircleAlert, Link2, RotateCcw, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import type { ComponentInstance, ComponentParameter, TableDef, TableRow } from "@/lib/components/types";
import { focusModelValue } from "./ParametricModel";
import { definitionFor, evaluateInstance } from "@/lib/cad/document";
import { exprDependencies } from "@/lib/components/expr";

const shown = (v: number) => String(Number(v.toFixed(4)));

function NumberBox({ value, onCommit, warn, width = 82, id }: { value: number; onCommit: (v: number) => void; warn?: boolean; width?: number; id?: string }) {
  const [draft, setDraft] = React.useState(shown(value));
  const [focused, setFocused] = React.useState(false);
  React.useEffect(() => {
    if (!focused) setDraft(shown(value));
  }, [value, focused]);
  return (
    <input
      id={id}
      value={draft}
      inputMode="decimal"
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const v = Number(draft);
        if (Number.isFinite(v) && draft !== shown(value)) onCommit(v);
        else setDraft(shown(value));
      }}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(shown(value));
          (e.target as HTMLInputElement).blur();
        }
      }}
      style={{ width }}
      className={`num h-[24px] px-1.5 text-right text-[11.5px] rounded-[5px] bg-(--ink-raised) text-(--fg-primary) border outline-none ${
        warn ? "border-(--warn)" : "border-(--rule) focus:border-(--pen)"
      }`}
    />
  );
}

function ValueField({
  p,
  value,
  source,
  follows,
  onCommit,
  onReset,
}: {
  p: ComponentParameter;
  value: number;
  source: string | undefined;
  follows: string[];
  onCommit: (v: number) => void;
  onReset: () => void;
}) {
  const out = (p.min !== undefined && value < p.min) || (p.max !== undefined && value > p.max);
  const id = `cv-${p.name}`;
  const unit = <span className="text-[9.5px] text-(--fg-muted) w-[22px]">{p.unit === "-" ? "" : p.unit}</span>;

  if (p.kind === "choice" && p.options?.length) {
    return (
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[11px] text-(--fg-secondary) truncate" title={p.description ?? p.name}>
          {p.label ?? p.name}
        </label>
        <select
          id={id}
          value={value}
          disabled={source === "related"}
          onChange={(e) => onCommit(Number(e.target.value))}
          className="h-[24px] max-w-[150px] rounded-[5px] bg-(--ink-raised) border border-(--rule) text-[11px] px-1 text-(--fg-primary)"
        >
          {p.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (source === "related") {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-(--fg-secondary) truncate inline-flex items-center gap-1" title={p.description ?? p.name}>
            <Link2 className="w-[10px] h-[10px] text-(--pen) shrink-0" />
            {p.label ?? p.name}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <span className="num text-[11.5px] text-(--fg-primary)">{Number.isFinite(value) ? shown(value) : "—"}</span>
            {unit}
          </span>
        </div>
        <p className="text-[9.5px] text-(--fg-muted) text-right">follows {follows.join(", ") || "a relationship"} · change it in Author mode</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[11px] text-(--fg-secondary) truncate" title={`${p.name}${p.description ? " — " + p.description : ""}`}>
          {p.label ?? p.name}
        </label>
        <div className="flex items-center gap-1 shrink-0">
          {source === "auto" && (
            <span className="text-[9px] uppercase tracking-wide text-(--pen) border border-(--pen-line) rounded-[3px] px-1" title={`Worked out from ${follows.join(", ")} until you type a value`}>
              auto
            </span>
          )}
          {source === "typed" && p.defaultExpr !== undefined && (
            <button onClick={onReset} title={`Work it out from ${follows.join(", ")} again`} aria-label="Back to automatic" className="w-[18px] h-[18px] grid place-items-center rounded-[3px] text-(--fg-muted) hover:text-(--pen) cursor-pointer">
              <RotateCcw className="w-[11px] h-[11px]" />
            </button>
          )}
          <NumberBox id={id} value={value} onCommit={onCommit} warn={out} />
          {unit}
        </div>
      </div>
      {(p.min !== undefined || p.max !== undefined) && (
        <p className={`text-[9.5px] text-right ${out ? "text-(--warn)" : "text-(--fg-muted)"}`}>
          {out ? "outside the usual range " : ""}
          {p.min ?? "…"} – {p.max ?? "…"} {p.unit === "-" ? "" : p.unit}
        </p>
      )}
    </div>
  );
}

/** A table value (foundation layers, strata…) as an editable list of rows. */
function TableEditor({ t, rows, onCommit }: { t: TableDef; rows: TableRow[]; onCommit: (rows: TableRow[]) => void }) {
  const blank = (): TableRow => Object.fromEntries(t.columns.map((c) => [c.name, c.default]));
  const set = (i: number, col: string, v: number | string) => onCommit(rows.map((r, k) => (k === i ? { ...r, [col]: v } : r)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onCommit(next);
  };
  const full = t.maxRows !== undefined && rows.length >= t.maxRows;
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <h4 className="label">{t.label ?? t.name}</h4>
        <button
          onClick={() => onCommit([...rows, blank()])}
          disabled={full}
          className="h-[20px] px-1.5 rounded-[4px] text-[10px] text-(--pen) hover:bg-(--pen-soft) inline-flex items-center gap-0.5 cursor-pointer disabled:opacity-40 disabled:cursor-default"
        >
          <Plus className="w-3 h-3" /> Add row
        </button>
      </div>
      {t.description && <p className="text-[10px] text-(--fg-muted) leading-snug">{t.description}</p>}
      {rows.length === 0 && <p className="text-[10.5px] text-(--fg-muted)">No rows.</p>}
      <div className="flex flex-col gap-1">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-col gap-1 rounded-[5px] border border-(--rule) px-1.5 py-1.5">
            {/* Text columns get the whole width; numbers and choices share the second line. */}
            {t.columns
              .filter((c) => c.kind === "text")
              .map((c) => (
                <input
                  key={`${c.name}-${String(r[c.name])}`}
                  aria-label={`${c.label ?? c.name} ${i + 1}`}
                  defaultValue={String(r[c.name] ?? "")}
                  onBlur={(e) => e.target.value !== String(r[c.name] ?? "") && set(i, c.name, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className="w-full h-[22px] px-1.5 text-[10.5px] rounded-[4px] bg-(--ink-raised) border border-(--rule) outline-none focus:border-(--pen) text-(--fg-primary)"
                />
              ))}
            <div className="flex items-center gap-1">
              {t.columns
                .filter((c) => c.kind !== "text")
                .map((c) =>
                  c.kind === "choice" ? (
                    <select
                      key={c.name}
                      aria-label={`${c.label ?? c.name} ${i + 1}`}
                      value={Number(r[c.name])}
                      onChange={(e) => set(i, c.name, Number(e.target.value))}
                      className="flex-1 min-w-0 h-[22px] rounded-[4px] bg-(--ink-raised) border border-(--rule) text-[10px] px-0.5 text-(--fg-primary)"
                    >
                      {c.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span key={c.name} className="inline-flex items-center gap-0.5 shrink-0">
                      <NumberBox value={Number(r[c.name])} onCommit={(v) => set(i, c.name, v)} width={60} />
                      <span className="text-[9px] text-(--fg-muted)">{c.unit === "-" ? "" : c.unit}</span>
                    </span>
                  )
                )}
              <button onClick={() => move(i, -1)} aria-label="Move up" className="w-[16px] h-[18px] grid place-items-center text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer">
                <ArrowUp className="w-[10px] h-[10px]" />
              </button>
              <button onClick={() => move(i, 1)} aria-label="Move down" className="w-[16px] h-[18px] grid place-items-center text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer">
                <ArrowDown className="w-[10px] h-[10px]" />
              </button>
              <button onClick={() => onCommit(rows.filter((_, k) => k !== i))} aria-label="Remove row" className="w-[16px] h-[18px] grid place-items-center text-(--fg-muted) hover:text-(--crit) cursor-pointer">
                <Trash2 className="w-[10px] h-[10px]" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatResult(v: number, unit?: string): string {
  if (!Number.isFinite(v)) return "—";
  if (unit === "m") return v.toFixed(3);
  if (unit === "m2") return v.toFixed(2);
  return Number(v.toFixed(unit === "-" ? 3 : 1)).toString();
}

export function ComponentValuesForm({ instance, compact }: { instance: ComponentInstance; compact?: boolean }) {
  const { state, dispatch } = useDrawing();
  const cad = state.cad;
  const def = definitionFor(cad, instance.definitionId);
  const out = React.useMemo(() => evaluateInstance(instance, cad), [instance, cad]);
  const notice = cad.componentNotice?.instanceId === instance.id ? cad.componentNotice : null;
  if (!def || !out) return <p className="text-[11px] text-(--crit)">Unknown component {instance.definitionId}.</p>;

  const ev = out.evaluation;
  const known = new Set([...def.parameters.map((p) => p.name), ...(def.formulas ?? []).map((f) => f.name), ...(instance.customValues ?? []).map((c) => c.name), ...(instance.relations ?? []).map((r) => r.name)]);
  const relOf = new Map((instance.relations ?? []).map((r) => [r.name, r]));
  const followsOf = (p: ComponentParameter): string[] => {
    const e = relOf.get(p.name)?.expr ?? p.defaultExpr;
    if (e === undefined) return [];
    // Name the values behind it, never the expression (§64). Internal helpers are hidden.
    const params = new Set(def.parameters.map((q) => q.name));
    const reported = new Set((def.formulas ?? []).filter((f) => f.report).map((f) => f.name));
    const custom = new Set((instance.customValues ?? []).map((c) => c.name));
    return exprDependencies(e).filter((n) => known.has(n) && (params.has(n) || reported.has(n) || custom.has(n)));
  };

  const groups = new Map<string, ComponentParameter[]>();
  for (const p of def.parameters) {
    const g = p.group ?? "Values";
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  const derived = (def.formulas ?? []).filter((f) => f.report);
  const newRelations = (instance.relations ?? []).filter((r) => !def.parameters.some((p) => p.name === r.name));
  const issues = ev.issues;
  const commit = (name: string, v: number) => dispatch({ type: "CAD_SET_COMPONENT_VALUES", instanceId: instance.id, values: { [name]: v } });
  const reset = (name: string) => dispatch({ type: "CAD_EDIT_COMPONENT_INPUTS", instanceId: instance.id, clear: [name] });
  const commitTable = (name: string, rows: TableRow[]) => dispatch({ type: "CAD_EDIT_COMPONENT_INPUTS", instanceId: instance.id, tables: { [name]: rows } });

  return (
    <div className="flex flex-col gap-3">
      {notice && (
        <div
          role="status"
          className={`rounded-[6px] border p-2 flex flex-col gap-1.5 ${notice.ok ? "border-(--ok) bg-(--ok-soft)" : "border-(--crit) bg-(--crit-soft)"}`}
        >
          <div className="flex items-start gap-1.5">
            {notice.ok ? null : <TriangleAlert className="w-[13px] h-[13px] mt-0.5 text-(--crit) shrink-0" />}
            <p className={`text-[11px] leading-snug flex-1 ${notice.ok ? "text-(--ok)" : "text-(--crit)"}`}>{notice.message}</p>
            <button onClick={() => dispatch({ type: "CAD_CLEAR_NOTICE" })} aria-label="Dismiss" className="w-[16px] h-[16px] grid place-items-center cursor-pointer text-(--fg-muted)">
              <X className="w-3 h-3" />
            </button>
          </div>
          {notice.ok && (
            <button
              onClick={() => dispatch({ type: "UNDO" })}
              className="self-end h-[20px] px-2 rounded-[4px] border border-(--rule) text-[10px] text-(--fg-secondary) hover:bg-(--ink-raised) inline-flex items-center gap-1 cursor-pointer"
            >
              <Undo2 className="w-3 h-3" /> Undo
            </button>
          )}
        </div>
      )}

      {[...groups.entries()].map(([g, ps]) => (
        <section key={g} className="flex flex-col gap-1.5">
          <h4 className="label">{g}</h4>
          {ps.map((p) => (
            <ValueField
              key={p.name}
              p={p}
              value={ev.scope[p.name] ?? instance.values[p.name] ?? p.default}
              source={ev.sources[p.name]}
              follows={followsOf(p)}
              onCommit={(v) => commit(p.name, v)}
              onReset={() => reset(p.name)}
            />
          ))}
        </section>
      ))}

      {(instance.customValues ?? []).length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h4 className="label">Added values</h4>
          {(instance.customValues ?? []).map((c) => (
            <div key={c.name} className="flex items-center justify-between gap-2">
              <label className="text-[11px] text-(--fg-secondary) truncate">{c.label ?? c.name}</label>
              <span className="flex items-center gap-1">
                <NumberBox value={c.value} onCommit={(v) => commit(c.name, v)} />
                <span className="text-[9.5px] text-(--fg-muted) w-[22px]">{c.unit === "-" ? "" : c.unit === "m2" ? "m²" : c.unit}</span>
              </span>
            </div>
          ))}
        </section>
      )}

      {(def.tables ?? []).map((t) => (
        <TableEditor key={t.name} t={t} rows={ev.tables[t.name] ?? t.rows} onCommit={(rows) => commitTable(t.name, rows)} />
      ))}

      {(derived.length > 0 || newRelations.length > 0) && !compact && (
        <section className="flex flex-col gap-1">
          <h4 className="label">Worked out for you</h4>
          <div className="rounded-[6px] border border-(--rule) overflow-hidden">
            {[...derived.map((f) => ({ name: f.name, label: f.label ?? f.name, unit: f.unit, expr: (instance.relations ?? []).find((r) => r.name === f.name)?.expr ?? String(f.expr) })), ...newRelations.map((r) => ({ name: r.name, label: r.label ?? r.name, unit: r.unit, expr: r.expr }))].map((f, i) => {
              // Name what it is worked out from — never the expression (§64) — and
              // how to change it: its inputs here, or its formula in Author mode.
              const from = exprDependencies(f.expr).filter((n) => known.has(n));
              return (
                <div key={f.name} className={`flex flex-col gap-0.5 px-2 py-1 ${i ? "border-t border-(--rule)" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-(--fg-secondary) inline-flex items-center gap-1 min-w-0" title="Worked out from other values, so it cannot be typed here">
                      <Lock className="w-[9px] h-[9px] text-(--fg-muted) shrink-0" />
                      <span className="truncate">{f.label}</span>
                    </span>
                    <span className="num text-[11.5px] text-(--fg-primary) shrink-0">
                      {formatResult(ev.scope[f.name], f.unit)}
                      <span className="text-(--fg-muted) ml-1 text-[9.5px]">{f.unit === "m2" ? "m²" : f.unit === "-" || !f.unit ? "" : f.unit}</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9.5px] text-(--fg-muted) truncate" title={`Worked out from ${from.join(", ")}`}>
                      {from.length ? `from ${from.join(", ")}` : "a fixed result"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        focusModelValue(instance.id, f.name);
                        dispatch({ type: "SET_USER_MODE", mode: "author" });
                      }}
                      className="text-[9.5px] text-(--pen) hover:underline cursor-pointer shrink-0 inline-flex items-center gap-0.5"
                      title="See and change the formula in Author mode"
                    >
                      <Link2 className="w-[9px] h-[9px]" /> formula
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {issues.length > 0 && (
        <section className="flex flex-col gap-1">
          <h4 className="label">To review ({issues.length})</h4>
          <ul className="flex flex-col gap-1">
            {issues.slice(0, 12).map((i, k) => (
              <li key={k} className={`text-[10.5px] leading-snug flex items-start gap-1 ${i.severity === "error" ? "text-(--crit)" : "text-(--warn)"}`}>
                <CircleAlert className="w-[10px] h-[10px] mt-[2px] shrink-0" />
                <span>
                  {i.path ? <span className="font-mono text-[9.5px] opacity-80">{i.path} · </span> : null}
                  {i.message}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
