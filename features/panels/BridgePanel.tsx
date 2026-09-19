"use client";

/**
 * The bridge panel (railway guide §11.1): project identity, design basis with
 * the source and confidence of every value, the components on the drawing,
 * the audit, notes, assumptions and approvals.
 *
 * It is organised around the one question a reviewer asks first — can this
 * drawing be issued, and if not, what is missing — so the audit summary is
 * always at the top and never collapses.
 */

import React from "react";
import { Landmark, ClipboardCheck, ShieldAlert, ShieldCheck, Trash2, Focus, Plus, X, BookOpen } from "lucide-react";
import { useCad } from "@/features/bridge/useCad";
import { ComponentValuesForm } from "@/features/bridge/ComponentValuesForm";
import { UnderstandingSection } from "@/features/bridge/Understanding";
import { Group, Pill } from "./ui/Disclosure";
import { PanelBody } from "./DraftPanel";
import {
  DBR_FIELD_META,
  INPUT_STATUS_LABEL,
  type BridgeProject,
  type DbrFields,
  type DrawingStatus,
  type InputStatus,
  type Lifecycle,
  type StructureType,
} from "@/lib/bridge/project";
import { BUILTIN_SOURCES, citation, findSource } from "@/lib/bridge/sources";
import { definitionFor } from "@/lib/cad/document";
import { GATE_LABEL, type AuditResult, type Gate, type Severity } from "@/lib/bridge/audit";
import { computeMultiShapeBounds } from "@/lib/geometry/metrics";
import { fitViewportToBounds } from "@/lib/geometry/transform";

const SEV_TONE: Record<Severity, "bad" | "attention" | "neutral"> = { blocker: "bad", error: "bad", warning: "attention", info: "neutral" };
const STATUS_OPTIONS: InputStatus[] = ["CONFIRMED_APPROVED", "CONFIRMED_SURVEY", "PENDING_CONFIRMATION", "INFERRED", "ASSUMED_FOR_DRAFT", "NOT_AVAILABLE"];
const inputCls = "h-[24px] rounded-[5px] bg-(--ink-raised) border border-(--rule) focus:border-(--pen) outline-none px-1.5 text-[11px] text-(--fg-primary)";

function TextRow({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  return (
    <label className="flex items-center justify-between gap-2 text-[11px] text-(--fg-secondary)">
      <span className="shrink-0 w-[92px] truncate">{label}</span>
      <input value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onChange(v)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className={`${inputCls} flex-1 min-w-0`} />
    </label>
  );
}

function DbrRow({ field, project, onChange }: { field: keyof DbrFields; project: BridgeProject; onChange: (p: BridgeProject, d: string) => void }) {
  const meta = DBR_FIELD_META[field];
  const f = project.dbr[field];
  const [v, setV] = React.useState(f.value === undefined ? "" : String(f.value));
  React.useEffect(() => setV(f.value === undefined ? "" : String(f.value)), [f.value]);
  const set = (patch: Partial<typeof f>, desc: string) => onChange({ ...project, dbr: { ...project.dbr, [field]: { ...f, ...patch } } }, desc);
  const tone = f.status === "CONFIRMED_APPROVED" || f.status === "CONFIRMED_SURVEY" ? "text-(--ok)" : f.status === "NOT_AVAILABLE" ? "text-(--fg-muted)" : "text-(--warn)";
  const sources = [...BUILTIN_SOURCES.filter((s) => s.kind !== "manual" && s.kind !== "code"), ...project.sources];
  return (
    <div className="flex flex-col gap-1 py-1.5 border-b border-(--rule) last:border-b-0">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-(--fg-secondary) flex-1 min-w-0 truncate" title={meta.label}>
          {meta.label}
        </span>
        <input
          value={v}
          inputMode={meta.kind === "text" ? "text" : "decimal"}
          aria-label={meta.label}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => {
            const raw = v.trim();
            const value = meta.kind === "text" ? raw || undefined : raw === "" ? undefined : Number(raw);
            if (meta.kind !== "text" && raw !== "" && !Number.isFinite(value as number)) return setV(f.value === undefined ? "" : String(f.value));
            if (value === f.value) return;
            set({ value: value as never, status: value === undefined ? "NOT_AVAILABLE" : f.status === "NOT_AVAILABLE" ? "PENDING_CONFIRMATION" : f.status, setBy: "user" }, `${meta.label} = ${raw || "—"}`);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className={`${inputCls} ${meta.kind === "text" ? "w-[120px]" : "w-[76px] num text-right"}`}
        />
        <span className="text-[9.5px] text-(--fg-muted) w-[34px] truncate">{meta.unit}</span>
      </div>
      <div className="flex items-center gap-1.5 pl-1">
        <select
          aria-label={`${meta.label} status`}
          value={f.status}
          onChange={(e) => set({ status: e.target.value as InputStatus }, `${meta.label}: ${e.target.value}`)}
          className={`h-[20px] rounded-[4px] bg-(--ink-sunken) border border-(--rule) text-[9.5px] px-1 ${tone} max-w-[170px]`}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {INPUT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          aria-label={`${meta.label} source`}
          value={f.sourceId ?? ""}
          onChange={(e) => set({ sourceId: e.target.value || undefined }, `${meta.label} source`)}
          className="h-[20px] flex-1 min-w-0 rounded-[4px] bg-(--ink-sunken) border border-(--rule) text-[9.5px] px-1 text-(--fg-secondary)"
        >
          <option value="">No source</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
              {s.clause ? ` — ${s.clause}` : ""}
            </option>
          ))}
        </select>
        {f.setBy === "agent" && <Pill tone="attention" title="Set by the drafting agent — not a design input until someone confirms it">agent</Pill>}
      </div>
    </div>
  );
}

function AuditList({ results, onFocus }: { results: AuditResult[]; onFocus: (r: AuditResult) => void }) {
  const [showPass, setShowPass] = React.useState(false);
  const visible = results.filter((r) => showPass || r.status !== "pass");
  const byGate = new Map<Gate, AuditResult[]>();
  for (const r of visible) byGate.set(r.gate, [...(byGate.get(r.gate) ?? []), r]);
  const order: Severity[] = ["blocker", "error", "warning", "info"];
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-1.5 text-[10.5px] text-(--fg-muted) cursor-pointer">
        <input type="checkbox" checked={showPass} onChange={(e) => setShowPass(e.target.checked)} /> Show passed checks
      </label>
      {[...byGate.entries()].map(([gate, rs]) => (
        <div key={gate} className="flex flex-col gap-1">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-(--fg-muted)">{GATE_LABEL[gate]}</p>
          {rs
            .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
            .map((r, i) => (
              <button
                key={r.ruleId + i}
                onClick={() => onFocus(r)}
                className={`text-left rounded-[5px] border px-2 py-1.5 flex flex-col gap-0.5 cursor-pointer hover:brightness-110 ${
                  r.status === "pass" ? "border-(--rule)" : r.severity === "blocker" || r.severity === "error" ? "border-(--crit)/60 bg-(--crit-soft)" : r.severity === "warning" ? "border-(--warn)/60 bg-(--warn-soft)" : "border-(--rule) bg-(--ink-raised)"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Pill tone={r.status === "pass" ? "good" : SEV_TONE[r.severity]}>{r.status === "pass" ? "pass" : r.status === "requires_review" ? "review" : r.status === "not_evaluated" ? "not checked" : r.severity}</Pill>
                  <span className="text-[10px] font-mono text-(--fg-muted) truncate">{r.ruleId}</span>
                </span>
                <span className="text-[11px] leading-snug text-(--fg-primary)">{r.message}</span>
                {r.hint && <span className="text-[10.5px] text-(--fg-secondary)">→ {r.hint}</span>}
                {r.sourceIds.length > 0 && (
                  <span className="text-[9.5px] text-(--fg-muted) inline-flex items-center gap-1">
                    <BookOpen className="w-[9px] h-[9px]" />
                    {r.sourceIds.map((id) => citation(findSource([], id))).join("; ")}
                  </span>
                )}
              </button>
            ))}
        </div>
      ))}
      {visible.length === 0 && <p className="text-[11px] text-(--ok)">Nothing to report.</p>}
    </div>
  );
}

export function BridgePanel({ onOpenCatalog }: { onOpenCatalog?: () => void }) {
  const { state, cad, dispatch, audit, setProject, applyDbrLevels } = useCad();
  const P = cad.project;
  const [openInst, setOpenInst] = React.useState<string | null>(null);
  const [assumption, setAssumption] = React.useState("");

  const zoomTo = (instanceId: string) => {
    const shapes = state.shapes.filter((s) => s.componentInstanceId === instanceId);
    const b = computeMultiShapeBounds(shapes);
    if (b) dispatch({ type: "SET_VIEWPORT", viewport: fitViewportToBounds(b, state.canvasSize.width, state.canvasSize.height) });
    dispatch({ type: "SELECT_MULTIPLE", ids: shapes.map((s) => s.id) });
  };

  const focus = (r: AuditResult) => {
    const inst = r.entityIds?.find((id) => cad.components.some((c) => c.id === id));
    if (inst) {
      zoomTo(inst);
      setOpenInst(inst);
      return;
    }
    const ids = (r.entityIds ?? []).filter((id) => state.shapes.some((s) => s.id === id) || cad.annotations.some((a) => a.id === id));
    if (ids.length) dispatch({ type: "SELECT_MULTIPLE", ids });
  };

  const blocked = audit.issueBlocked;
  const groups = [...new Set(Object.values(DBR_FIELD_META).map((m) => m.group))];

  return (
    <PanelBody>
      <div className={`rounded-[7px] border p-2.5 flex flex-col gap-1.5 ${blocked ? "border-(--crit) bg-(--crit-soft)" : "border-(--ok) bg-(--ok-soft)"}`}>
        <div className="flex items-center gap-1.5">
          {blocked ? <ShieldAlert className="w-4 h-4 text-(--crit)" /> : <ShieldCheck className="w-4 h-4 text-(--ok)" />}
          <p className={`text-[12px] font-semibold ${blocked ? "text-(--crit)" : "text-(--ok)"}`}>{blocked ? "Not ready to issue" : "No blocking findings"}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Pill tone={audit.counts.blocker ? "bad" : "neutral"}>{audit.counts.blocker} blocker</Pill>
          <Pill tone={audit.counts.error ? "bad" : "neutral"}>{audit.counts.error} error</Pill>
          <Pill tone={audit.counts.warning ? "attention" : "neutral"}>{audit.counts.warning} warning</Pill>
          <Pill>{audit.counts.info} info</Pill>
          <Pill tone="neutral" title={audit.classification.reason}>
            suggested: {audit.classification.suggested}
          </Pill>
        </div>
        <label className="flex items-center justify-between gap-2 text-[11px] text-(--fg-secondary)">
          Drawing status
          <select
            value={P.drawingStatus}
            onChange={(e) => setProject({ ...P, drawingStatus: e.target.value as DrawingStatus }, `Status ${e.target.value}`)}
            className={inputCls}
          >
            {(["DRAFT", "FOR DESIGN REVIEW", "FOR APPROVAL", "APPROVED"] as DrawingStatus[]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[10px] leading-snug text-(--fg-muted)">A drawing that passes these checks is internally consistent. Only the competent authority can approve it.</p>
      </div>

      <div className="flex flex-col -mx-3.5 border-t border-(--rule)">
        <Group id="bridge-understanding" title="Your drawing, understood" defaultOpen>
          <UnderstandingSection />
        </Group>

        <Group id="bridge-components" title="Parametric components" count={cad.components.length} action={onOpenCatalog && (
          <button onClick={onOpenCatalog} className="h-[20px] px-1.5 rounded-[4px] text-[10px] text-(--pen) hover:bg-(--pen-soft) inline-flex items-center gap-0.5 cursor-pointer">
            <Plus className="w-3 h-3" /> Insert
          </button>
        )}>
          {cad.components.length === 0 && (
            <p className="text-[11px] text-(--fg-muted) leading-relaxed">
              Optional. Insert a ready-made one (RCC box half section, bridge GAD, culvert, pier, pile group, well), or draw it yourself and use Parametrize to make your drawing follow its dimensions and levels.
            </p>
          )}
          {cad.components.map((inst) => {
            const def = definitionFor(cad, inst.definitionId);
            const open = openInst === inst.id;
            const errs = audit.results.filter((r) => r.entityIds?.includes(inst.id) && r.status !== "pass" && (r.severity === "error" || r.severity === "blocker")).length;
            return (
              <div key={inst.id} className="rounded-[6px] border border-(--rule) overflow-hidden">
                <div className="flex items-center gap-1 px-2 h-[30px] bg-(--ink-raised)/50">
                  <Landmark className="w-3 h-3 text-(--pen) shrink-0" />
                  <button onClick={() => setOpenInst(open ? null : inst.id)} className="flex-1 min-w-0 text-left text-[11.5px] font-medium text-(--fg-primary) truncate cursor-pointer" title={def?.description}>
                    {inst.name}
                  </button>
                  {errs > 0 && <Pill tone="bad">{errs}</Pill>}
                  <button onClick={() => zoomTo(inst.id)} title="Zoom to and select" aria-label="Zoom to" className="w-[20px] h-[20px] grid place-items-center rounded text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer">
                    <Focus className="w-3 h-3" />
                  </button>
                  <button onClick={() => dispatch({ type: "CAD_DELETE_COMPONENT", instanceId: inst.id })} title="Delete component" aria-label="Delete component" className="w-[20px] h-[20px] grid place-items-center rounded text-(--fg-muted) hover:text-(--crit) cursor-pointer">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                {open && (
                  <div className="p-2 border-t border-(--rule)">
                    <p className="text-[10px] text-(--fg-muted) mb-2">{def?.name}</p>
                    <ComponentValuesForm instance={inst} />
                  </div>
                )}
              </div>
            );
          })}
        </Group>

        <Group id="bridge-audit" title="Audit" count={audit.counts.blocker + audit.counts.error + audit.counts.warning} tone={blocked ? "bad" : audit.counts.warning ? "attention" : "good"} defaultOpen>
          <AuditList results={audit.results} onFocus={focus} />
        </Group>

        <Group id="bridge-identity" title="Project & title block" tone={!P.identity.projectName || !P.identity.drawingNumber ? "attention" : "neutral"}>
          <TextRow label="Railway" value={P.identity.railway} onChange={(v) => setProject({ ...P, identity: { ...P.identity, railway: v } })} placeholder="e.g. Northern Railway" />
          <TextRow label="Division" value={P.identity.division} onChange={(v) => setProject({ ...P, identity: { ...P.identity, division: v } })} />
          <TextRow label="Name of work" value={P.identity.projectName} onChange={(v) => setProject({ ...P, identity: { ...P.identity, projectName: v } })} />
          <TextRow label="Drawing title" value={P.identity.drawingTitle} onChange={(v) => setProject({ ...P, identity: { ...P.identity, drawingTitle: v } })} />
          <TextRow label="Drawing No." value={P.identity.drawingNumber} onChange={(v) => setProject({ ...P, identity: { ...P.identity, drawingNumber: v } })} />
          <TextRow label="Bridge No." value={P.identity.bridgeNumber} onChange={(v) => setProject({ ...P, identity: { ...P.identity, bridgeNumber: v } })} />
          <TextRow label="Chainage" value={P.identity.chainage} onChange={(v) => setProject({ ...P, identity: { ...P.identity, chainage: v } })} placeholder="km 123/4-5" />
          <TextRow label="Line" value={P.identity.line} onChange={(v) => setProject({ ...P, identity: { ...P.identity, line: v } })} placeholder="UP / DN / Single" />
          <TextRow label="River / stream" value={P.identity.riverName} onChange={(v) => setProject({ ...P, identity: { ...P.identity, riverName: v } })} />
          <TextRow label="Sanction ref." value={P.identity.sanctionReference} onChange={(v) => setProject({ ...P, identity: { ...P.identity, sanctionReference: v } })} placeholder="Pink Book item" />
          <label className="flex items-center justify-between gap-2 text-[11px] text-(--fg-secondary)">
            <span className="w-[92px]">Structure</span>
            <select value={P.structureType} onChange={(e) => setProject({ ...P, structureType: e.target.value as StructureType })} className={`${inputCls} flex-1`}>
              {(["box_culvert", "pipe_culvert", "slab_bridge", "girder_bridge", "steel_girder_bridge", "arch_bridge", "rob", "rub", "fob", "other"] as StructureType[]).map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-[11px] text-(--fg-secondary)">
            <span className="w-[92px]">Work</span>
            <select value={P.lifecycle} onChange={(e) => setProject({ ...P, lifecycle: e.target.value as Lifecycle })} className={`${inputCls} flex-1`}>
              {(["new_work", "rebuilding", "doubling", "gauge_conversion", "rehabilitation", "open_line"] as Lifecycle[]).map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[11px] text-(--fg-secondary)">
            <input type="checkbox" checked={P.classifiedImportantByCE} onChange={(e) => setProject({ ...P, classifiedImportantByCE: e.target.checked })} />
            Classified important by CE/CBE (IRBM 1103(3)(a))
          </label>
        </Group>

        <Group id="bridge-dbr" title="Design basis" tone={audit.results.some((r) => r.gate === "data" && r.status !== "pass" && r.severity === "blocker") ? "bad" : "neutral"}>
          <p className="text-[10.5px] text-(--fg-muted) leading-snug">
            Values with their source and confidence. Anything not confirmed blocks issue. Levels are RL in metres.
          </p>
          <button
            onClick={() => applyDbrLevels()}
            className="self-start h-[24px] px-2 rounded-[5px] border border-(--pen) text-(--pen) text-[11px] hover:bg-(--pen-soft) cursor-pointer"
            title="Write rail, formation, HFL, LWL, bed and foundation levels into every component that draws them"
          >
            Apply design levels to drawing
          </button>
          {groups.map((g) => (
            <div key={g} className="flex flex-col">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-(--fg-muted) mt-1">{g}</p>
              {(Object.keys(DBR_FIELD_META) as (keyof DbrFields)[])
                .filter((k) => DBR_FIELD_META[k].group === g)
                .map((k) => (
                  <DbrRow key={k} field={k} project={P} onChange={setProject} />
                ))}
            </div>
          ))}
        </Group>

        <Group id="bridge-notes" title="General notes" count={P.notes.length}>
          {P.notes.map((n, i) => (
            <div key={i} className="flex items-start gap-1">
              <span className="num text-[10px] text-(--fg-muted) mt-1 w-[14px]">{i + 1}.</span>
              <textarea
                defaultValue={n}
                rows={2}
                onBlur={(e) => e.target.value !== n && setProject({ ...P, notes: P.notes.map((x, j) => (j === i ? e.target.value : x)) }, "Edit note")}
                className="flex-1 rounded-[5px] bg-(--ink-raised) border border-(--rule) text-[11px] p-1.5 text-(--fg-primary) resize-y"
              />
              <button onClick={() => setProject({ ...P, notes: P.notes.filter((_, j) => j !== i) }, "Remove note")} aria-label="Remove note" className="w-[18px] h-[18px] grid place-items-center text-(--fg-muted) hover:text-(--crit) cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setProject({ ...P, notes: [...P.notes, ""] }, "Add note")} className="h-[22px] px-2 rounded-[4px] border border-(--rule) text-[10.5px] text-(--fg-secondary) hover:bg-(--ink-raised) cursor-pointer">
              + Note
            </button>
            <button
              onClick={() => setProject({ ...P, notes: [...P.notes, "Work shall conform to IRS Bridge Substructure & Foundation Code, IRS Concrete Bridge Code, Indian Railways Bridge Manual and the latest RDSO instructions, in that order of preference unless the DBR states otherwise."] }, "Add codes note")}
              className="h-[22px] px-2 rounded-[4px] border border-(--rule) text-[10.5px] text-(--fg-secondary) hover:bg-(--ink-raised) cursor-pointer"
            >
              + Codes & manuals note
            </button>
          </div>
        </Group>

        <Group id="bridge-assumptions" title="Assumptions" count={P.assumptions.length} tone={P.assumptions.length ? "attention" : "neutral"}>
          {P.assumptions.map((a) => (
            <div key={a.id} className="flex items-start gap-1 text-[11px]">
              <Pill tone="attention">{a.createdBy}</Pill>
              <span className="flex-1 text-(--fg-primary) leading-snug">{a.text}</span>
              <button onClick={() => setProject({ ...P, assumptions: P.assumptions.filter((x) => x.id !== a.id) }, "Close assumption")} title="Close (resolved against a source)" className="text-[10px] text-(--ok) hover:underline cursor-pointer">
                close
              </button>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!assumption.trim()) return;
              setProject({ ...P, assumptions: [...P.assumptions, { id: `as_${Date.now().toString(36)}`, text: assumption.trim(), scope: "drawing", createdBy: "user", createdAt: Date.now() }] }, "Record assumption");
              setAssumption("");
            }}
            className="flex gap-1"
          >
            <input value={assumption} onChange={(e) => setAssumption(e.target.value)} placeholder="Record an assumption…" className={`${inputCls} flex-1`} />
          </form>
        </Group>

        <Group id="bridge-approvals" title="Signatures" tone={P.approvals.some((a) => !a.name) ? "attention" : "neutral"}>
          {P.approvals.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[11px] text-(--fg-secondary) w-[82px]">{a.role}</span>
              <input
                defaultValue={a.name}
                placeholder="Name, designation"
                onBlur={(e) => e.target.value !== a.name && setProject({ ...P, approvals: P.approvals.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                className={`${inputCls} flex-1 min-w-0`}
              />
              <label className="text-[10px] text-(--fg-muted) flex items-center gap-0.5">
                <input type="checkbox" checked={a.signed} onChange={(e) => setProject({ ...P, approvals: P.approvals.map((x, j) => (j === i ? { ...x, signed: e.target.checked } : x)) }, `${a.role} signed`)} />
                signed
              </label>
            </div>
          ))}
          <p className="text-[10px] text-(--fg-muted)">
            <ClipboardCheck className="inline w-3 h-3 mr-0.5" />
            Approval authority: see the audit (IRBM 317).
          </p>
        </Group>
      </div>
    </PanelBody>
  );
}
