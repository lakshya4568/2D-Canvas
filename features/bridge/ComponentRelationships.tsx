"use client";

/**
 * Author mode: your own relationships on a placed component.
 *
 * A relationship is `Name = expression`. If Name is one of the component's
 * values, that value stops being typed and follows the expression (e.g.
 * RailLevel = FormationLevel + 0.762); any other name makes a new worked-out
 * value (e.g. CushionRatio = EarthCushion / ClearSpan) reported beside the
 * component's own. Values you add ("inputs") can be used in them.
 *
 * This is the Author persona's surface for formulas (§3, §64): Run mode shows
 * the results and the names they follow, never the expressions. Every change
 * goes through the same all-or-nothing edit as a typed value — a relationship
 * that breaks the component, names something unknown or goes round in a
 * circle is refused with the reason and nothing changes.
 */

import React from "react";
import { Link2, Link2Off, Plus, Trash2, Check, TriangleAlert } from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import { definitionFor, evaluateInstance } from "@/lib/cad/document";
import type { ComponentInstance, CustomValue, Relationship, ValueUnit } from "@/lib/components/types";

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const UNITS: ValueUnit[] = ["mm", "m", "-", "deg", "m2"];

function useInstance(): [ComponentInstance | undefined, (id: string) => void, ComponentInstance[]] {
  const { state } = useDrawing();
  const comps = state.cad.components;
  const selectedComp = React.useMemo(() => {
    const ids = new Set(state.selectedIds.length ? state.selectedIds : state.selectedId ? [state.selectedId] : []);
    return state.shapes.find((s) => ids.has(s.id) && s.componentInstanceId)?.componentInstanceId;
  }, [state.selectedIds, state.selectedId, state.shapes]);
  const [chosen, setChosen] = React.useState<string>("");
  const id = chosen && comps.some((c) => c.id === chosen) ? chosen : selectedComp ?? comps[0]?.id;
  return [comps.find((c) => c.id === id), setChosen, comps];
}

export function ComponentRelationships() {
  const { state, dispatch } = useDrawing();
  const cad = state.cad;
  const [inst, choose, comps] = useInstance();
  const def = inst ? definitionFor(cad, inst.definitionId) : undefined;
  const [target, setTarget] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [expr, setExpr] = React.useState("");
  const [cvName, setCvName] = React.useState("");
  const [cvValue, setCvValue] = React.useState("");
  const [cvUnit, setCvUnit] = React.useState<ValueUnit>("mm");
  const exprRef = React.useRef<HTMLInputElement>(null);

  const out = React.useMemo(() => (inst ? evaluateInstance(inst, cad) : null), [inst, cad]);
  const relations = React.useMemo(() => inst?.relations ?? [], [inst]);
  const customs = inst?.customValues ?? [];
  const name = target === "__new" ? newName.trim() : target;

  // What the candidate would do, before anything is applied.
  const preview = React.useMemo(() => {
    if (!inst || !name || !expr.trim()) return null;
    if (!NAME.test(name)) return { ok: false, text: "A name is letters, digits and _ , starting with a letter." };
    const candidate: ComponentInstance = { ...inst, relations: [...relations.filter((r) => r.name !== name), { name, expr: expr.trim() }] };
    const ev = evaluateInstance(candidate, cad);
    if (!ev) return null;
    const errs = ev.evaluation.issues.filter((i) => i.severity === "error");
    if (errs.length) return { ok: false, text: errs.map((e) => e.message).join(" ") };
    const v = ev.evaluation.scope[name];
    return { ok: true, text: `${name} = ${Number.isFinite(v) ? Number(v.toFixed(4)) : "—"} with the current values.` };
  }, [inst, name, expr, relations, cad]);

  if (!inst || !def || !out) {
    return <p className="text-[11px] text-(--fg-muted) leading-relaxed">Place a component (or make your drawing parametric) to relate its values.</p>;
  }

  const scope = out.evaluation.scope;
  const operands = [
    ...def.parameters.map((p) => ({ name: p.name, unit: p.unit, kind: "value" })),
    ...(def.formulas ?? []).filter((f) => f.report).map((f) => ({ name: f.name, unit: f.unit ?? "", kind: "result" })),
    ...customs.map((c) => ({ name: c.name, unit: c.unit, kind: "added" })),
    ...relations.filter((r) => !def.parameters.some((p) => p.name === r.name)).map((r) => ({ name: r.name, unit: r.unit ?? "", kind: "yours" })),
  ];
  const setRelations = (next: Relationship[]) => dispatch({ type: "CAD_EDIT_COMPONENT_INPUTS", instanceId: inst.id, relations: next });
  const setCustoms = (next: CustomValue[]) => dispatch({ type: "CAD_EDIT_COMPONENT_INPUTS", instanceId: inst.id, customValues: next });
  const notice = cad.componentNotice?.instanceId === inst.id ? cad.componentNotice : null;

  const apply = () => {
    if (!preview?.ok) return;
    const unit = def.parameters.find((p) => p.name === name)?.unit;
    setRelations([...relations.filter((r) => r.name !== name), { name, expr: expr.trim(), unit: unit as ValueUnit | undefined }]);
    setExpr("");
    setTarget("");
    setNewName("");
  };

  return (
    <div className="flex flex-col gap-2.5">
      {comps.length > 1 && (
        <select
          value={inst.id}
          onChange={(e) => choose(e.target.value)}
          className="h-[24px] px-1.5 text-[11px] rounded-[4px] bg-(--ink-raised) border border-(--rule) text-(--fg-primary)"
        >
          {comps.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      {notice && !notice.ok && (
        <div role="status" className="rounded-[6px] border border-(--crit) bg-(--crit-soft) p-2 flex items-start gap-1.5">
          <TriangleAlert className="w-[13px] h-[13px] mt-0.5 text-(--crit) shrink-0" />
          <p className="text-[11px] leading-snug text-(--crit)">{notice.message}</p>
        </div>
      )}

      {relations.length > 0 ? (
        <div className="rounded-[6px] border border-(--rule) overflow-hidden">
          {relations.map((r, i) => (
            <div key={r.name} className={`flex items-center gap-1.5 px-2 min-h-[28px] py-1 ${i ? "border-t border-(--rule)" : ""}`}>
              <Link2 className="w-[11px] h-[11px] text-(--pen) shrink-0" />
              <button
                onClick={() => {
                  setTarget(def.parameters.some((p) => p.name === r.name) ? r.name : "__new");
                  setNewName(r.name);
                  setExpr(r.expr);
                  exprRef.current?.focus();
                }}
                title="Edit"
                className="num flex-1 min-w-0 text-left text-[11px] text-(--fg-primary) break-all cursor-pointer"
              >
                {r.name} = {r.expr}
              </button>
              <span className="num text-[10.5px] text-(--fg-muted) shrink-0">{Number.isFinite(scope[r.name]) ? Number(scope[r.name].toFixed(3)) : "—"}</span>
              <button onClick={() => setRelations(relations.filter((x) => x.name !== r.name))} aria-label={`Remove ${r.name}`} title="Remove — the value is typed again" className="w-[18px] h-[18px] grid place-items-center text-(--fg-muted) hover:text-(--crit) cursor-pointer">
                <Link2Off className="w-[11px] h-[11px]" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10.5px] text-(--fg-muted) leading-relaxed">No relationships yet. Example: RailLevel = FormationLevel + 0.762, or a new value CushionRatio = EarthCushion / ClearSpan.</p>
      )}

      <div className="rounded-[6px] border border-(--rule) overflow-hidden">
        <div className="px-2.5 h-[26px] flex items-center gap-1.5 bg-(--ink-raised) border-b border-(--rule)">
          <Link2 className="w-[12px] h-[12px] text-(--fg-muted)" strokeWidth={2.1} />
          <span className="text-[11px] text-(--fg-secondary)">Make a value follow others</span>
        </div>
        <div className="px-2.5 py-2 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <select
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                const existing = relations.find((r) => r.name === e.target.value);
                setExpr(existing?.expr ?? "");
              }}
              aria-label="Which value"
              className="w-[128px] h-[24px] px-1.5 text-[11px] rounded-[4px] bg-(--ink-raised) border border-(--rule) outline-none focus:border-(--pen) text-(--fg-primary)"
            >
              <option value="">Which value…</option>
              <option value="__new">New value…</option>
              {def.parameters.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            {target === "__new" && (
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" aria-label="New value name" className="w-[96px] h-[24px] px-1.5 text-[11px] rounded-[4px] bg-(--ink-raised) border border-(--rule) outline-none focus:border-(--pen) text-(--fg-primary)" />
            )}
            <span className="text-(--fg-muted) text-[11px]">=</span>
          </div>
          <input
            ref={exprRef}
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            placeholder="FormationLevel + RailOverFormation / 1000"
            aria-label="Expression"
            className="num h-[24px] px-1.5 text-[11px] rounded-[4px] bg-(--ink-raised) border border-(--rule) outline-none focus:border-(--pen) text-(--fg-primary)"
          />
          <div className="flex flex-wrap gap-1 max-h-[96px] overflow-y-auto">
            {operands
              .filter((o) => o.name !== name)
              .map((o) => (
                <button
                  key={o.name}
                  onClick={() => setExpr((e) => (e ? `${e} ${o.name}` : o.name))}
                  title={`${o.kind} · ${Number.isFinite(scope[o.name]) ? Number(scope[o.name].toFixed(3)) : "—"} ${o.unit === "-" ? "" : o.unit}`}
                  className={`px-1.5 h-[20px] rounded-[4px] text-[10px] border cursor-pointer ${o.kind === "result" ? "border-dashed border-(--rule) text-(--fg-muted)" : "border-(--rule) text-(--fg-secondary)"} hover:text-(--fg-primary) hover:border-(--rule-strong)`}
                >
                  {o.name}
                </button>
              ))}
          </div>
          <p className="text-[9.5px] text-(--fg-muted) leading-snug">Levels are in m, lengths in mm. Functions: min, max, abs, round, floor, ceil, sqrt, hypot, if(c, a, b), gt, ge, lt, le; sin/cos/tan/atan in degrees.</p>
          {preview && <p className={`text-[10.5px] leading-snug ${preview.ok ? "text-(--fg-muted)" : "text-(--crit)"}`}>{preview.text}</p>}
          <button
            onClick={apply}
            disabled={!preview?.ok}
            className="self-start h-[24px] px-2.5 rounded-[5px] bg-(--pen) text-white text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            <Check className="w-3 h-3" /> {relations.some((r) => r.name === name) ? "Update relationship" : "Link it"}
          </button>
        </div>
      </div>

      <div className="rounded-[6px] border border-(--rule) overflow-hidden">
        <div className="px-2.5 h-[26px] flex items-center gap-1.5 bg-(--ink-raised) border-b border-(--rule)">
          <Plus className="w-[12px] h-[12px] text-(--fg-muted)" strokeWidth={2.1} />
          <span className="text-[11px] text-(--fg-secondary)">Add an input of your own</span>
        </div>
        <div className="px-2.5 py-2 flex flex-col gap-1.5">
          {customs.map((c) => (
            <div key={c.name} className="flex items-center gap-1.5 text-[11px]">
              <span className="num flex-1 text-(--fg-primary)">
                {c.name} = {c.value} {c.unit === "-" ? "" : c.unit}
              </span>
              <button
                onClick={() => setCustoms(customs.filter((x) => x.name !== c.name))}
                aria-label={`Remove ${c.name}`}
                className="w-[18px] h-[18px] grid place-items-center text-(--fg-muted) hover:text-(--crit) cursor-pointer"
              >
                <Trash2 className="w-[11px] h-[11px]" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <input value={cvName} onChange={(e) => setCvName(e.target.value)} placeholder="SlopeRatio" aria-label="Input name" className="flex-1 min-w-0 h-[24px] px-1.5 text-[11px] rounded-[4px] bg-(--ink-raised) border border-(--rule) outline-none focus:border-(--pen) text-(--fg-primary)" />
            <input value={cvValue} onChange={(e) => setCvValue(e.target.value)} placeholder="1.5" inputMode="decimal" aria-label="Input value" className="num w-[64px] h-[24px] px-1.5 text-right text-[11px] rounded-[4px] bg-(--ink-raised) border border-(--rule) outline-none focus:border-(--pen) text-(--fg-primary)" />
            <select value={cvUnit} onChange={(e) => setCvUnit(e.target.value as ValueUnit)} aria-label="Unit" className="h-[24px] text-[11px] rounded-[4px] bg-(--ink-raised) border border-(--rule) text-(--fg-primary)">
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <button
              disabled={!NAME.test(cvName.trim()) || !Number.isFinite(Number(cvValue)) || cvValue.trim() === ""}
              onClick={() => {
                setCustoms([...customs.filter((c) => c.name !== cvName.trim()), { name: cvName.trim(), value: Number(cvValue), unit: cvUnit }]);
                setCvName("");
                setCvValue("");
              }}
              className="h-[24px] px-2 rounded-[5px] border border-(--rule) text-[11px] text-(--fg-secondary) hover:bg-(--ink-raised) cursor-pointer disabled:opacity-40 disabled:cursor-default"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
