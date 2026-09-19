"use client";

/**
 * Author mode: the parametric model of a component on the drawing, laid open.
 *
 *   values       what is typed — change it here, in Run Mode, or by
 *                double-clicking the dimension that drives it
 *   worked out   name = expression = result; what it reads, what reads it,
 *                what it moves; rewrite the expression, or unlink it into a
 *                typed value (the drawing's own components)
 *   constraints  what every edit must keep, and whether it holds now
 *   dimensions   which value each one drives, or that it is a result
 *   entities     every outline, circle, dimension and callout: the expressions
 *                of its points and the values that move it; click to select
 *
 * All of it is read from the definition and one evaluation (lib/components/
 * model.ts) — the same dependency graph the engine regenerates from. Selection
 * is shared with the canvas both ways. Edits are all-or-nothing: a change that
 * would break the drawing is refused with the reason and nothing moves.
 */

import React from "react";
import { Link2Off, MousePointerClick, Check, TriangleAlert, Sigma, Ruler, Shapes, ArrowRight } from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import { definitionFor, evaluateInstance } from "@/lib/cad/document";
import { componentModel, entityOfGenerated, type ComponentModel, type ModelEntity, type ModelValue } from "@/lib/components/model";
import type { ComponentInstance } from "@/lib/components/types";

/** A focus request made before the Author panel was on screen (e.g. from Run Mode). */
let pendingFocus: { instanceId: string; name: string } | null = null;

/** Ask the Author panel to show one value of one component (from Run Mode, the inspector…). */
export function focusModelValue(instanceId: string, name: string) {
  pendingFocus = { instanceId, name };
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("parametric-focus", { detail: { instanceId, name } }));
}

const fmt = (v: number, unit?: string) => {
  if (!Number.isFinite(v)) return "—";
  const r = unit === "m" ? v.toFixed(3) : Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
  return r;
};
const unitText = (u?: string) => (!u || u === "-" ? "" : u === "m2" ? "m²" : u);

function useModel(instanceId: string | undefined) {
  const { state } = useDrawing();
  const cad = state.cad;
  const inst = cad.components.find((c) => c.id === instanceId);
  const def = inst ? definitionFor(cad, inst.definitionId) : undefined;
  const out = React.useMemo(() => (inst ? evaluateInstance(inst, cad) : null), [inst, cad]);
  const model = React.useMemo<ComponentModel | null>(() => (inst && def && out ? componentModel(def, inst, out.evaluation) : null), [inst, def, out]);
  return { inst, def, out, model };
}

/** Selects, on the canvas, everything generated for these definition entities. */
function useSelectEntities(inst: ComponentInstance | undefined) {
  const { state, dispatch } = useDrawing();
  return React.useCallback(
    (entities: string[]) => {
      if (!inst) return;
      const want = new Set(entities);
      const ids = [
        ...state.shapes.filter((s) => s.componentInstanceId === inst.id && want.has(entityOfGenerated(s.id, inst.id) ?? "")).map((s) => s.id),
        ...state.cad.annotations.filter((a) => a.componentInstanceId === inst.id && want.has(entityOfGenerated(a.id, inst.id) ?? "")).map((a) => a.id),
      ];
      dispatch({ type: "SELECT_MULTIPLE", ids });
    },
    [inst, state.shapes, state.cad.annotations, dispatch]
  );
}

/** The definition entities currently selected on the canvas, for one component. */
export function selectedEntitiesOf(state: ReturnType<typeof useDrawing>["state"], instanceId: string): string[] {
  const sel = new Set(state.selectedIds);
  const out = new Set<string>();
  for (const s of state.shapes) if (s.componentInstanceId === instanceId && sel.has(s.id)) out.add(entityOfGenerated(s.id, instanceId) ?? "");
  for (const a of state.cad.annotations) if (a.componentInstanceId === instanceId && sel.has(a.id)) out.add(entityOfGenerated(a.id, instanceId) ?? "");
  out.delete("");
  return [...out];
}

function Chip({ children, onClick, title, tone = "plain" }: { children: React.ReactNode; onClick?: () => void; title?: string; tone?: "plain" | "pen" | "ok" | "crit" }) {
  const color = tone === "pen" ? "text-(--pen) border-(--pen-line)" : tone === "ok" ? "text-(--ok) border-(--ok)" : tone === "crit" ? "text-(--crit) border-(--crit)" : "text-(--fg-secondary) border-(--rule)";
  const cls = `inline-flex items-center gap-0.5 h-[17px] px-1.5 rounded-[3px] border text-[9.5px] font-mono ${color}`;
  return onClick ? (
    <button type="button" onClick={onClick} title={title} className={`${cls} cursor-pointer hover:bg-(--ink-raised)`}>
      {children}
    </button>
  ) : (
    <span title={title} className={cls}>
      {children}
    </span>
  );
}

function NumberInput({ value, onCommit, disabled }: { value: number; onCommit: (v: number) => void; disabled?: boolean }) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const shown = draft ?? (Number.isFinite(value) ? String(Number(value.toFixed(6))) : "");
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft.trim());
    setDraft(null);
    if (Number.isFinite(v) && v !== value) onCommit(v);
  };
  return (
    <input
      disabled={disabled}
      value={shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(null);
      }}
      className="num w-[78px] h-[22px] px-1.5 rounded-[4px] border border-(--rule) bg-(--ink-app) text-right text-[11px] text-(--fg-primary) disabled:opacity-60"
    />
  );
}

function ExprInput({ value, onCommit, disabled }: { value: string; onCommit: (v: string) => void; disabled?: boolean }) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = draft.trim();
    setDraft(null);
    if (v && v !== value) onCommit(v);
  };
  return (
    <input
      disabled={disabled}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(null);
      }}
      spellCheck={false}
      className="flex-1 min-w-0 h-[22px] px-1.5 rounded-[4px] border border-(--rule) bg-(--ink-app) font-mono text-[10.5px] text-(--fg-primary) disabled:opacity-70"
    />
  );
}

function Section({ icon: Icon, title, count, children }: { icon: typeof Sigma; title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="label inline-flex items-center gap-1">
        <Icon className="w-[11px] h-[11px]" />
        {title}
        {count !== undefined && <span className="text-(--fg-muted) font-normal">{count}</span>}
      </h4>
      {children}
    </section>
  );
}

/** What a selected entity is, how it was made, and what moves it. */
export function EntityInspector({ instanceId, entities }: { instanceId: string; entities: string[] }) {
  const { state, dispatch } = useDrawing();
  const { inst, def, model } = useModel(instanceId);
  if (!inst || !def || !model || !entities.length) return null;
  const own = def.origin?.kind === "drawn";
  const tags = def.origin?.construction?.tags ?? {};
  const picked = model.entities.filter((e) => entities.includes(e.id));
  return (
    <div className="flex flex-col gap-2">
      {picked.map((e) => (
        <EntityCard key={e.id} e={e} feature={tags[e.id]} model={model} onFocus={(n) => focusModelValue(inst.id, n)} />
      ))}
      <div className="flex flex-wrap gap-1.5">
        {own && (
          <button
            type="button"
            onClick={() => dispatch({ type: "CAD_EDIT_DEFINITION", instanceId: inst.id, edit: { op: "remove", ids: picked.map((e) => e.id) } })}
            className="h-[22px] px-2 rounded-[4px] border border-(--rule) text-[10.5px] text-(--fg-secondary) hover:bg-(--ink-raised) cursor-pointer"
          >
            Delete {picked.length === 1 ? picked[0].id : `${picked.length} entities`}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "SET_USER_MODE", mode: "author" });
            focusModelValue(inst.id, picked[0]?.roots[0] ?? "");
          }}
          className="h-[22px] px-2 rounded-[4px] border border-(--rule) text-[10.5px] text-(--fg-secondary) hover:bg-(--ink-raised) cursor-pointer inline-flex items-center gap-1"
        >
          Open the model in Author <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      {!own && <p className="text-[10px] text-(--fg-muted)">A library part: change its values; its entities cannot be edited one by one (Edit shape turns it into your own geometry).</p>}
      {state.selectedIds.length === 0 && null}
    </div>
  );
}

function EntityCard({ e, feature, model, onFocus }: { e: ModelEntity; feature?: string; model: ComponentModel; onFocus: (name: string) => void }) {
  const kind = { loop: "closed outline", path: "open line", circle: "circle", dimension: "dimension", level: "level callout", leader: "callout", text: "text", hatch: "hatch" }[e.kind];
  return (
    <div className="rounded-[6px] border border-(--rule) p-2 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-(--pen) truncate">{e.id}</span>
        <span className="text-[10px] text-(--fg-muted)">
          {kind}
          {feature ? ` · ${feature}` : ""}
        </span>
      </div>
      {e.text && <p className="text-[10.5px] text-(--fg-secondary) truncate">“{e.text}”</p>}
      {e.boundary && <p className="text-[10.5px] text-(--fg-secondary)">fills {e.boundary}</p>}
      {e.points.length > 0 && (
        <div className="flex flex-col gap-0.5 max-h-[120px] overflow-y-auto">
          {e.points.slice(0, 12).map((p, i) => (
            <code key={i} className="text-[9.5px] text-(--fg-secondary) font-mono truncate" title={`x = ${p.x}\ny = ${p.y}`}>
              {e.kind === "circle" ? "centre" : e.kind === "dimension" ? (i ? "to" : "from") : `p${i + 1}`} x = {p.x} · y = {p.y}
            </code>
          ))}
          {e.points.length > 12 && <span className="text-[9.5px] text-(--fg-muted)">… {e.points.length - 12} more points</span>}
          {e.r && <code className="text-[9.5px] text-(--fg-secondary) font-mono">r = {e.r}</code>}
        </div>
      )}
      {e.kind === "dimension" && (
        <p className="text-[10.5px] text-(--fg-secondary)">
          {e.drives ? (
            <>
              drives <Chip tone="pen" onClick={() => onFocus(e.drives!)}>{e.drives}</Chip> — double-click it on the canvas to change it
            </>
          ) : (
            "a result: it measures a combination of values, so it follows them"
          )}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] text-(--fg-muted)">{e.roots.length ? "moved by" : "fixed: moved by no value"}</span>
        {e.roots.map((r) => (
          <Chip key={r} tone="pen" onClick={() => onFocus(r)} title={`${model.values.find((v) => v.name === r)?.label ?? r} — show it`}>
            {r}
          </Chip>
        ))}
      </div>
    </div>
  );
}

export function ParametricModel() {
  const { state, dispatch } = useDrawing();
  const comps = state.cad.components;
  const selectedInstance = React.useMemo(() => {
    const sel = new Set(state.selectedIds);
    return state.shapes.find((s) => sel.has(s.id) && s.componentInstanceId)?.componentInstanceId ?? state.cad.annotations.find((a) => sel.has(a.id) && a.componentInstanceId)?.componentInstanceId;
  }, [state.selectedIds, state.shapes, state.cad.annotations]);
  const [chosen, setChosen] = React.useState("");
  const [focus, setFocus] = React.useState<string | null>(null);
  const id = (chosen && comps.some((c) => c.id === chosen) ? chosen : selectedInstance) ?? comps[comps.length - 1]?.id;
  const { inst, def, out, model } = useModel(id);
  const selectEntities = useSelectEntities(inst);
  const rows = React.useRef(new Map<string, HTMLDivElement>());

  React.useEffect(() => {
    const show = (d: { instanceId: string; name: string }) => {
      pendingFocus = null;
      setChosen(d.instanceId);
      setFocus(d.name);
      setTimeout(() => rows.current.get(d.name)?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
    };
    if (pendingFocus) show(pendingFocus);
    const on = (e: Event) => show((e as CustomEvent<{ instanceId: string; name: string }>).detail);
    window.addEventListener("parametric-focus", on);
    return () => window.removeEventListener("parametric-focus", on);
  }, []);

  if (!inst || !def || !out || !model) return null;
  const own = def.origin?.kind === "drawn";
  const tags = def.origin?.construction?.tags ?? {};
  const selected = selectedEntitiesOf(state, inst.id);
  const typed = model.values.filter((v) => v.kind === "typed" || v.kind === "custom");
  const derived = model.values.filter((v) => v.kind !== "typed" && v.kind !== "custom");
  const dims = model.entities.filter((e) => e.kind === "dimension");
  const edit = (edit: Parameters<typeof dispatchEdit>[0]) => dispatchEdit(edit);
  function dispatchEdit(e: { op: "unlink"; name: string; value: number } | { op: "formula"; name: string; expr: string }) {
    dispatch({ type: "CAD_EDIT_DEFINITION", instanceId: inst!.id, edit: e });
  }
  const notice = state.cad.componentNotice?.instanceId === inst.id ? state.cad.componentNotice : null;

  const ref = (name: string) => (el: HTMLDivElement | null) => {
    if (el) rows.current.set(name, el);
  };
  const hl = (name: string) => (focus === name ? "bg-(--pen-soft)" : "");
  const valueChip = (n: string) => (
    <Chip key={n} tone="pen" onClick={() => setFocus(n)} title="Show it">
      {n}
    </Chip>
  );
  const movesChip = (v: ModelValue) =>
    v.drives.length ? (
      <Chip onClick={() => selectEntities(v.drives)} title="Select on the canvas what it moves">
        <MousePointerClick className="w-[9px] h-[9px]" /> moves {v.drives.length}
      </Chip>
    ) : (
      <Chip tone="crit" title="Nothing on the drawing reads it">moves nothing</Chip>
    );

  const byFeature = new Map<string, ModelEntity[]>();
  for (const e of model.entities) {
    const f = tags[e.id] ?? (e.kind === "dimension" || e.kind === "level" || e.kind === "leader" || e.kind === "text" ? "Annotation" : "Geometry");
    byFeature.set(f, [...(byFeature.get(f) ?? []), e]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {comps.length > 1 ? (
          <select value={inst.id} onChange={(e) => setChosen(e.target.value)} className="h-[24px] flex-1 min-w-0 px-1.5 rounded-[4px] border border-(--rule) bg-(--ink-app) text-[11px]">
            {comps.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[11.5px] font-semibold text-(--fg-primary) truncate flex-1">{inst.name}</span>
        )}
        <Chip tone={own ? "ok" : "plain"} title={own ? "Built on this drawing: every part is yours to edit" : "From the library: values and relationships only"}>
          {own ? (def.origin?.construction ? "built by the agent" : "made from this drawing") : "library part"}
        </Chip>
      </div>
      <p className="text-[10.5px] leading-[1.5] text-(--fg-muted)">
        {typed.length} values drive {derived.length} worked-out values and {model.entities.length} entities{model.constraints.length ? `, guarded by ${model.constraints.length} constraint(s)` : ""}. Change a value and everything that reads it regenerates; an edit that would break the drawing is refused whole.
      </p>

      {notice && (
        <p role="status" className={`text-[10.5px] leading-snug rounded-[5px] border px-2 py-1 ${notice.ok ? "text-(--ok) border-(--ok) bg-(--ok-soft)" : "text-(--crit) border-(--crit) bg-(--crit-soft)"}`}>
          {notice.message}
        </p>
      )}

      {selected.length > 0 && (
        <Section icon={MousePointerClick} title="Selected on the canvas" count={selected.length}>
          <EntityInspector instanceId={inst.id} entities={selected} />
        </Section>
      )}

      <Section icon={Ruler} title="Values" count={typed.length}>
        <div className="rounded-[6px] border border-(--rule) divide-y divide-(--rule)">
          {typed.map((v) => (
            <div key={v.name} ref={ref(v.name)} className={`px-2 py-1.5 flex flex-col gap-1 ${hl(v.name)}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex flex-col">
                  <span className="font-mono text-[11px] text-(--fg-primary) truncate">{v.name}</span>
                  {v.label && v.label !== v.name && <span className="text-[10px] text-(--fg-muted) truncate">{v.label}</span>}
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  <NumberInput value={v.value} onCommit={(n) => dispatch({ type: "CAD_SET_COMPONENT_VALUES", instanceId: inst.id, values: { [v.name]: n } })} />
                  <span className="text-[9.5px] text-(--fg-muted) w-[20px]">{unitText(v.unit)}</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {v.provenance === "required" && (
                  <Chip tone="crit" title="Not provided: the drawing uses a placeholder. Enter the approved value.">
                    required input
                  </Chip>
                )}
                {v.provenance === "scaled" && <Chip title="Not written on the reference: measured off the image">scaled</Chip>}
                {v.provenance === "drafting" && <Chip title="A drawing-layout choice, not a size of the structure">layout</Chip>}
                {movesChip(v)}
                {v.usedBy.length > 0 && <span className="text-[9.5px] text-(--fg-muted)">read by</span>}
                {v.usedBy.map(valueChip)}
                {dims.filter((d) => d.drives === v.name).map((d) => (
                  <Chip key={d.id} onClick={() => selectEntities([d.id])} title="The dimension that drives it — double-click it on the canvas">
                    {d.id}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {derived.length > 0 && (
        <Section icon={Sigma} title="Worked out (formulas)" count={derived.length}>
          <div className="rounded-[6px] border border-(--rule) divide-y divide-(--rule)">
            {derived.map((v) => {
              const editable = own && v.kind === "formula";
              return (
                <div key={v.name} ref={ref(v.name)} className={`px-2 py-1.5 flex flex-col gap-1 ${hl(v.name)}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-(--fg-primary) shrink-0">{v.name} =</span>
                    <ExprInput value={v.expr ?? ""} disabled={!editable} onCommit={(expr) => edit({ op: "formula", name: v.name, expr })} />
                    <span className="num text-[11px] text-(--fg-primary) shrink-0">
                      {fmt(v.value, v.unit)}
                      <span className="text-(--fg-muted) text-[9.5px] ml-0.5">{unitText(v.unit)}</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[9.5px] text-(--fg-muted)">{v.kind === "related" ? "your relationship · reads" : v.kind === "auto" ? "automatic until typed · reads" : "reads"}</span>
                    {v.dependsOn.map(valueChip)}
                    {v.usedBy.length > 0 && <span className="text-[9.5px] text-(--fg-muted)">· read by</span>}
                    {v.usedBy.map(valueChip)}
                    {movesChip(v)}
                    {editable && (
                      <Chip onClick={() => edit({ op: "unlink", name: v.name, value: v.value })} title="Stop working it out: it becomes a typed value at its current number">
                        <Link2Off className="w-[9px] h-[9px]" /> unlink
                      </Chip>
                    )}
                  </div>
                  {v.roots.length > 0 && (
                    <p className="text-[9.5px] text-(--fg-muted)">
                      To change it, change {v.roots.join(", ")}
                      {editable ? ", rewrite the formula, or unlink it" : ""}.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {model.constraints.length > 0 && (
        <Section icon={Check} title="Constraints" count={model.constraints.length}>
          <div className="rounded-[6px] border border-(--rule) divide-y divide-(--rule)">
            {model.constraints.map((c) => (
              <div key={c.id} className="px-2 py-1 flex items-center gap-1.5 text-[10.5px]">
                {c.ok ? <Check className="w-3 h-3 text-(--ok) shrink-0" /> : <TriangleAlert className="w-3 h-3 text-(--crit) shrink-0" />}
                <code className="font-mono text-(--fg-primary) truncate" title={c.message}>
                  {c.expr} {c.op} {c.than}
                </code>
              </div>
            ))}
          </div>
          <p className="text-[9.5px] text-(--fg-muted)">Every edit is checked against these; one that breaks any is refused and nothing changes.</p>
        </Section>
      )}

      <Section icon={Shapes} title="Entities" count={model.entities.length}>
        <div className="flex flex-col gap-1.5">
          {[...byFeature.entries()].map(([f, es]) => (
            <details key={f} className="rounded-[6px] border border-(--rule)" open={es.some((e) => selected.includes(e.id))}>
              <summary className="px-2 h-[24px] flex items-center justify-between cursor-pointer text-[11px] text-(--fg-secondary)">
                <span>{f}</span>
                <span className="text-[10px] text-(--fg-muted)">{es.length}</span>
              </summary>
              <div className="divide-y divide-(--rule) border-t border-(--rule)">
                {es.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => selectEntities([e.id])}
                    className={`w-full text-left px-2 py-1 flex items-center justify-between gap-2 cursor-pointer hover:bg-(--ink-raised) ${selected.includes(e.id) ? "bg-(--pen-soft)" : ""}`}
                  >
                    <span className="font-mono text-[10.5px] text-(--fg-primary) truncate">{e.id}</span>
                    <span className="text-[9.5px] text-(--fg-muted) truncate">
                      {e.kind}
                      {e.drives ? ` → ${e.drives}` : ""}
                      {e.roots.length ? ` · ${e.roots.slice(0, 3).join(", ")}${e.roots.length > 3 ? "…" : ""}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            </details>
          ))}
        </div>
        <p className="text-[9.5px] text-(--fg-muted)">
          {own
            ? "Click an entity to select it; on the canvas, select it and press Delete to remove it, or Move it — it gets its own shift values and stays parametric."
            : "Library part: its entities are selected together; change its values instead."}
        </p>
      </Section>
    </div>
  );
}
