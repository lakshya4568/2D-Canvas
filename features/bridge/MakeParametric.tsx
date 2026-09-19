"use client";

/**
 * "Make parametric" — turn what you drew into a component you can drive by
 * its values.
 *
 * The dialog shows the plan before anything changes: which levels are inputs,
 * which dimensions drive and which are results (a dimension that closes a
 * loop, like the earth cushion between formation and top of slab), which
 * callouts became values, and which notes will follow their numbers. Names
 * can be changed and a dimension can be switched between driving and result;
 * the plan is recomputed on every change. Create is refused while any vertex
 * would not come back where it was drawn.
 */

import React from "react";
import { X, Wand2, TriangleAlert, ChevronDown, ChevronRight } from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import { parametricSelection, planFor } from "@/lib/state/cadActions";

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function NameBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => (NAME.test(draft.trim()) && draft.trim() !== value ? onChange(draft.trim()) : setDraft(value))}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      aria-label="Name"
      className="num w-[150px] h-[24px] px-1.5 text-[11px] rounded-[4px] bg-(--ink-raised) border border-(--rule) outline-none focus:border-(--pen) text-(--fg-primary)"
    />
  );
}

export function MakeParametricDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useDrawing();
  const [name, setName] = React.useState("");
  const [rename, setRename] = React.useState<Record<string, string>>({});
  const [drive, setDrive] = React.useState<Record<string, boolean>>({});
  const [showOther, setShowOther] = React.useState(false);

  const selection = React.useMemo(() => {
    const ids = state.selectedIds.length ? state.selectedIds : state.selectedId ? [state.selectedId] : [];
    const free = state.shapes.filter((s) => ids.includes(s.id) && !s.componentInstanceId).map((s) => s.id);
    return free.length ? free : undefined;
  }, [state.selectedIds, state.selectedId, state.shapes]);

  React.useEffect(() => {
    if (!open) return;
    setName(`Drawn component ${(state.cad.definitions?.length ?? 0) + 1}`);
    setRename({});
    setDrive({});
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const plan = React.useMemo(() => {
    if (!open) return null;
    const sel = parametricSelection(state.shapes, state.cad, selection);
    if (!sel.shapes.length) return null;
    return planFor(state.shapes, state.cad, sel, { name, rename, drive });
  }, [open, state.shapes, state.cad, selection, name, rename, drive]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const setName2 = (key: string, v: string) => setRename((r) => ({ ...r, [key]: v }));
  const params = new Map(plan?.definition.parameters.map((p) => [p.name, p]) ?? []);
  const other = plan?.datums.filter((d) => !d.principal && !d.via) ?? [];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Make parametric" className="w-[min(760px,94vw)] max-h-[88vh] flex flex-col rounded-[8px] border border-(--rule) bg-(--ink-panel) shadow-2xl">
        <div className="h-[40px] px-3.5 flex items-center justify-between border-b border-(--rule)">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-(--pen)" />
            <h2 className="text-[13px] font-semibold text-(--fg-primary)">Make parametric</h2>
            <span className="text-[11px] text-(--fg-muted)">{selection ? `${selection.length} selected shape(s)` : "everything drawn freely"}</span>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-[26px] h-[26px] grid place-items-center rounded text-(--fg-muted) hover:bg-(--ink-raised) cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!plan ? (
          <p className="p-4 text-[12px] text-(--fg-muted)">Nothing drawn freely to convert. Draw the section (lines, polylines, rectangles), dimension it and mark its levels first.</p>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto p-3.5 flex flex-col gap-3.5">
            <p className="text-[11.5px] leading-relaxed text-(--fg-secondary) max-w-[80ch]">
              Every level you marked and every dimension you drew becomes a value. A dimension that closes a loop — the earth cushion between formation and top of slab — becomes a result. A callout such as <span className="num">150TH. WEARING COURSE</span> that points into a layer that thick becomes a value too. Anything else follows the nearest named line at a fixed offset.
            </p>
            <label className="flex items-center gap-2 text-[11.5px] text-(--fg-secondary)">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 max-w-[320px] h-[26px] px-2 text-[12px] rounded-[5px] bg-(--ink-raised) border border-(--rule) outline-none focus:border-(--pen) text-(--fg-primary)" />
            </label>

            {plan.levels.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <h3 className="label">Levels</h3>
                <div className="rounded-[6px] border border-(--rule) overflow-hidden">
                  {plan.levels.map((l, i) => (
                    <div key={l.key} className={`flex items-center gap-2 px-2 h-[32px] ${i ? "border-t border-(--rule)" : ""}`}>
                      <NameBox value={l.name} onChange={(v) => setName2(l.key, v)} />
                      <span className="num text-[11.5px] text-(--fg-primary) w-[80px] text-right">{l.value.toFixed(3)} m</span>
                      <span className={`text-[10.5px] ${l.input ? "text-(--pen)" : "text-(--fg-muted)"}`}>{l.input ? "input (site level)" : "follows from the sizes"}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="flex flex-col gap-1.5">
              <h3 className="label">Dimensions and callouts</h3>
              {plan.edges.length === 0 ? (
                <p className="text-[11px] text-(--fg-muted)">No dimensions yet. Without them the drawing can only move as a whole; dimension what should be changeable (DLI).</p>
              ) : (
                <div className="rounded-[6px] border border-(--rule) overflow-hidden">
                  {plan.edges.map((e, i) => (
                    <div key={e.key} className={`flex items-center gap-2 px-2 min-h-[32px] py-1 ${i ? "border-t border-(--rule)" : ""}`}>
                      <NameBox value={e.name} onChange={(v) => setName2(e.key, v)} />
                      <span className="num text-[11.5px] text-(--fg-primary) w-[80px] text-right">{Number(e.value.toFixed(1))} mm</span>
                      {e.from === "dimension" ? (
                        <select
                          value={e.role === "result" ? "result" : "drives"}
                          onChange={(ev) => setDrive((d) => ({ ...d, [e.key]: ev.target.value === "drives" }))}
                          aria-label="Driving or result"
                          className="h-[24px] text-[11px] rounded-[4px] bg-(--ink-raised) border border-(--rule) text-(--fg-primary)"
                        >
                          <option value="drives">{e.role === "symmetric" ? "drives (½ each side of ℄)" : "drives"}</option>
                          <option value="result">result (worked out)</option>
                        </select>
                      ) : (
                        <span className="text-[10.5px] text-(--pen)">from the callout</span>
                      )}
                      <span className="text-[10.5px] text-(--fg-muted) truncate flex-1" title={e.label}>
                        {e.label.replace(/\n/g, " ")}
                      </span>
                      {params.get(e.name) && plan.edges.filter((x) => x.name === e.name).length > 1 && <span className="text-[10px] text-(--fg-muted)">shared</span>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {plan.linkedTexts.length > 0 && (
              <section className="flex flex-col gap-1">
                <h3 className="label">Notes that will follow their values</h3>
                <ul className="flex flex-col gap-0.5">
                  {plan.linkedTexts.map((t) => (
                    <li key={t.id} className="num text-[11px] text-(--fg-secondary)">
                      {t.after.replace(/\n/g, " ")}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {other.length > 0 && (
              <section className="flex flex-col gap-1">
                <button onClick={() => setShowOther((v) => !v)} className="self-start inline-flex items-center gap-1 text-[11px] text-(--fg-secondary) cursor-pointer">
                  {showOther ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  {other.length} other position(s) follow a named line at a fixed offset — name one to make it a value
                </button>
                {showOther && (
                  <div className="rounded-[6px] border border-(--rule) overflow-hidden max-h-[200px] overflow-y-auto">
                    {other.map((d, i) => (
                      <div key={d.key} className={`flex items-center gap-2 px-2 h-[30px] ${i ? "border-t border-(--rule)" : ""}`}>
                        <span className="num text-[10.5px] text-(--fg-muted) w-[20px]">{d.axis.toUpperCase()}</span>
                        <span className="num text-[11px] text-(--fg-primary) w-[90px] text-right">{Number(d.offset.toFixed(1))} mm</span>
                        <span className="text-[10.5px] text-(--fg-muted) flex-1 truncate">{d.how}</span>
                        <input
                          placeholder="Name it…"
                          aria-label={`Name the offset at ${d.value.toFixed(0)}`}
                          onBlur={(e) => NAME.test(e.target.value.trim()) && setName2(d.key, e.target.value.trim())}
                          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                          className="w-[130px] h-[22px] px-1.5 text-[10.5px] rounded-[4px] bg-(--ink-raised) border border-(--rule) outline-none focus:border-(--pen) text-(--fg-primary)"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {plan.warnings.length > 0 && (
              <ul className="flex flex-col gap-0.5">
                {plan.warnings.map((w, i) => (
                  <li key={i} className="text-[11px] text-(--warn)">
                    {w}
                  </li>
                ))}
              </ul>
            )}
            {plan.mismatches.length > 0 && (
              <div className="rounded-[6px] border border-(--crit) bg-(--crit-soft) p-2 flex items-start gap-1.5">
                <TriangleAlert className="w-3.5 h-3.5 text-(--crit) shrink-0 mt-0.5" />
                <p className="text-[11px] text-(--crit) leading-snug">{plan.mismatches.join(" ")}</p>
              </div>
            )}
          </div>
        )}

        <div className="h-[46px] px-3.5 flex items-center justify-between border-t border-(--rule)">
          <p className="text-[10.5px] text-(--fg-muted)">
            {plan ? `${plan.definition.parameters.length} value(s), ${plan.definition.formulas?.filter((f) => f.report).length ?? 0} result(s). You can write your own relationships afterwards in Author mode.` : ""}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="h-[28px] px-3 rounded-[5px] border border-(--rule) text-[12px] text-(--fg-secondary) hover:bg-(--ink-raised) cursor-pointer">
              Cancel
            </button>
            <button
              disabled={!plan || plan.mismatches.length > 0}
              onClick={() => {
                dispatch({ type: "CAD_MAKE_PARAMETRIC", shapeIds: selection, options: { name, rename, drive } });
                onClose();
              }}
              className="h-[28px] px-3 rounded-[5px] bg-(--pen) text-white text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-default"
            >
              <Wand2 className="w-3.5 h-3.5" /> Make parametric
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
