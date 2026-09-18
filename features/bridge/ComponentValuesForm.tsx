"use client";

/**
 * The values of one component instance, as a form.
 *
 * Driving values are inputs; derived values are read-only results with no
 * expression shown (§64: the project engineer never sees a formula). An edit
 * either regenerates the component or is refused with the reason, and a
 * refused value snaps back in the box so the form never shows a number the
 * drawing does not have. Out-of-range values are accepted and flagged (§26),
 * never silently clamped.
 */

import React from "react";
import { Lock, TriangleAlert, Undo2, X, CircleAlert } from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import type { ComponentInstance, ComponentParameter } from "@/lib/components/types";
import { componentRegistry } from "@/lib/components/library";
import { evaluateInstance } from "@/lib/cad/document";

const shown = (v: number) => String(Number(v.toFixed(4)));

function ValueField({
  p,
  value,
  onCommit,
}: {
  p: ComponentParameter;
  value: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = React.useState(shown(value));
  const [focused, setFocused] = React.useState(false);
  React.useEffect(() => {
    if (!focused) setDraft(shown(value));
  }, [value, focused]);
  const out = (p.min !== undefined && value < p.min) || (p.max !== undefined && value > p.max);
  const id = `cv-${p.name}`;

  if (p.kind === "choice" && p.options?.length) {
    return (
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[11px] text-(--fg-secondary) truncate" title={p.description ?? p.name}>
          {p.label ?? p.name}
        </label>
        <select
          id={id}
          value={value}
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

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[11px] text-(--fg-secondary) truncate" title={`${p.name}${p.description ? " — " + p.description : ""}`}>
          {p.label ?? p.name}
        </label>
        <div className="flex items-center gap-1 shrink-0">
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
            className={`num w-[82px] h-[24px] px-1.5 text-right text-[11.5px] rounded-[5px] bg-(--ink-raised) text-(--fg-primary) border outline-none ${
              out ? "border-(--warn)" : "border-(--rule) focus:border-(--pen)"
            }`}
          />
          <span className="text-[9.5px] text-(--fg-muted) w-[22px]">{p.unit === "-" ? "" : p.unit}</span>
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

export function ComponentValuesForm({ instance, compact }: { instance: ComponentInstance; compact?: boolean }) {
  const { state, dispatch } = useDrawing();
  const cad = state.cad;
  const def = componentRegistry.get(instance.definitionId);
  const out = React.useMemo(() => evaluateInstance(instance, cad), [instance, cad]);
  const notice = cad.componentNotice?.instanceId === instance.id ? cad.componentNotice : null;
  if (!def || !out) return <p className="text-[11px] text-(--crit)">Unknown component {instance.definitionId}.</p>;

  const groups = new Map<string, ComponentParameter[]>();
  for (const p of def.parameters) {
    const g = p.group ?? "Values";
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  const derived = (def.formulas ?? []).filter((f) => f.report);
  const issues = out.evaluation.issues;
  const commit = (name: string, v: number) => dispatch({ type: "CAD_SET_COMPONENT_VALUES", instanceId: instance.id, values: { [name]: v } });

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
            <ValueField key={p.name} p={p} value={instance.values[p.name] ?? p.default} onCommit={(v) => commit(p.name, v)} />
          ))}
        </section>
      ))}

      {derived.length > 0 && !compact && (
        <section className="flex flex-col gap-1">
          <h4 className="label">Worked out for you</h4>
          <div className="rounded-[6px] border border-(--rule) overflow-hidden">
            {derived.map((f, i) => {
              const v = out.evaluation.scope[f.name];
              return (
                <div key={f.name} className={`flex items-center justify-between gap-2 px-2 h-[26px] ${i ? "border-t border-(--rule)" : ""}`}>
                  <span className="text-[11px] text-(--fg-secondary) inline-flex items-center gap-1 min-w-0">
                    <Lock className="w-[9px] h-[9px] text-(--fg-muted) shrink-0" />
                    <span className="truncate">{f.label ?? f.name}</span>
                  </span>
                  <span className="num text-[11.5px] text-(--fg-primary) shrink-0">
                    {Number.isFinite(v) ? (f.unit === "m" ? v.toFixed(3) : f.unit === "m2" ? v.toFixed(2) : Number(v.toFixed(1)).toString()) : "—"}
                    <span className="text-(--fg-muted) ml-1 text-[9.5px]">{f.unit === "m2" ? "m²" : f.unit === "-" ? "" : f.unit}</span>
                  </span>
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
