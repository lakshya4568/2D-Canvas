/**
 * Reducer logic for the CAD document (layers, annotations, components,
 * project, sheets). Pure functions of (shapes, cad) so the drafting reducer
 * stays one switch and the agent's workspace can run the same code headless.
 *
 * Component edits are all-or-nothing: the instance is re-evaluated with the
 * new values first, and if any invariant fails the edit is refused with the
 * reason and NOTHING changes — no half-regenerated drawing, no stale entities.
 */

import type { Point, Shape } from "@/lib/geometry/types";
import type { Annotation, AnchorRef, DrawingSettings, Layer } from "@/lib/cad/types";
import type { BridgeProject } from "@/lib/bridge/project";
import type { Sheet } from "@/lib/cad/sheet";
import type { ComponentDefinition, ComponentInstance, CustomValue, Relationship, TableRow } from "@/lib/components/types";
import {
  componentIdOf,
  definitionFor,
  evaluateInstance,
  nextInstanceId,
  regenerateInstances,
  type CadDocState,
} from "@/lib/cad/document";
import { layerIdFor, uniqueLayerName } from "@/lib/cad/layers";
import { termFor } from "@/lib/bridge/glossary";
import { pointInPolygon, traceRing } from "@/lib/cad/geometry";
import { fitScale, sheetLayout } from "@/lib/cad/sheet";
import { computeMultiShapeBounds } from "@/lib/geometry/metrics";
import { planParametric, type ParametrizeOptions, type ParametricPlan } from "@/lib/components/fromDrawing";
import { registryFor } from "@/lib/cad/document";
import { resolveAnchor, indexShapes } from "@/lib/cad/geometry";

export type CadAction =
  | { type: "CAD_ADD_LAYER"; layer: Partial<Layer> & { name: string }; makeCurrent?: boolean }
  | { type: "CAD_UPDATE_LAYER"; id: string; patch: Partial<Layer> }
  | { type: "CAD_DELETE_LAYER"; id: string }
  | { type: "CAD_SET_CURRENT_LAYER"; id: string }
  | { type: "CAD_SET_ENTITY_LAYER"; ids: string[]; layerId: string }
  | { type: "CAD_ADD_ANNOTATION"; annotation: Annotation; select?: boolean }
  | { type: "CAD_UPDATE_ANNOTATION"; id: string; patch: Partial<Annotation> }
  | { type: "CAD_DELETE_ANNOTATIONS"; ids: string[] }
  | {
      type: "CAD_INSERT_COMPONENT";
      definitionId: string;
      at: Point;
      values?: Record<string, number>;
      name?: string;
      id?: string;
      absoluteElevation?: boolean;
      mirror?: boolean;
    }
  | { type: "CAD_SET_COMPONENT_VALUES"; instanceId: string; values: Record<string, number>; description?: string }
  /**
   * Everything else a person can change about a placed component's values:
   * hand a typed value back to its default/auto expression (`clear`), write or
   * remove relationships, add inputs, replace a table's rows. All-or-nothing,
   * like a value change.
   */
  | {
      type: "CAD_EDIT_COMPONENT_INPUTS";
      instanceId: string;
      clear?: string[];
      relations?: Relationship[];
      customValues?: CustomValue[];
      tables?: Record<string, TableRow[]>;
      description?: string;
    }
  /** Add or replace a component definition owned by this drawing. */
  | { type: "CAD_PUT_DEFINITION"; definition: ComponentDefinition }
  /**
   * Turn free geometry (the given shapes, else everything free) and its
   * dimensions, levels and callouts into one parametric component. Refused,
   * with the reason, if the component would not reproduce the drawing.
   */
  | { type: "CAD_MAKE_PARAMETRIC"; shapeIds?: string[]; annotationIds?: string[]; options?: ParametrizeOptions }
  /** Turn a placed component back into free geometry and annotation (its names stay on the dimensions). */
  | { type: "CAD_EXPLODE_COMPONENT"; instanceId: string }
  | { type: "CAD_UPDATE_COMPONENT"; instanceId: string; patch: Partial<Pick<ComponentInstance, "name" | "x" | "y" | "rotation" | "mirror" | "locked">> }
  | { type: "CAD_DELETE_COMPONENT"; instanceId: string }
  | { type: "CAD_SET_SETTINGS"; patch: Partial<DrawingSettings> }
  | { type: "CAD_SET_PROJECT"; project: BridgeProject; description?: string }
  | { type: "CAD_SET_SHEETS"; sheets: Sheet[] }
  | { type: "CAD_ADD_REVISION"; description: string }
  | { type: "CAD_LOAD_DOCUMENT"; shapes: Shape[]; cad: CadDocState; description?: string }
  | { type: "CAD_CLEAR_NOTICE" }
  /** Say what drawn geometry IS (bed level, pier, earth cushion…); "" clears it. */
  | { type: "CAD_CLASSIFY"; ids: string[]; role: string };

export interface CadResult {
  shapes: Shape[];
  cad: CadDocState;
  /** Push a history entry with this description. */
  history?: string;
  /** New selection, when the action implies one. */
  select?: string[];
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function applyCadAction(shapes: Shape[], cad: CadDocState, a: CadAction): CadResult | null {
  switch (a.type) {
    case "CAD_ADD_LAYER": {
      const id = uniqueLayerName(cad.layers, a.layer.name);
      const layer: Layer = {
        id,
        name: id,
        category: a.layer.category ?? "general",
        color: a.layer.color ?? "#ffffff",
        lineType: a.layer.lineType ?? "continuous",
        lineWeight: a.layer.lineWeight ?? 0.25,
        visible: a.layer.visible ?? true,
        frozen: a.layer.frozen ?? false,
        locked: a.layer.locked ?? false,
        plot: a.layer.plot ?? a.layer.category !== "construction",
        description: a.layer.description,
      };
      return { shapes, cad: { ...cad, layers: [...cad.layers, layer], currentLayerId: a.makeCurrent ? id : cad.currentLayerId }, history: `New layer ${id}` };
    }
    case "CAD_UPDATE_LAYER": {
      if (!cad.layers.some((l) => l.id === a.id)) return null;
      const { id: _ignored, ...patch } = a.patch;
      void _ignored;
      return { shapes, cad: { ...cad, layers: cad.layers.map((l) => (l.id === a.id ? { ...l, ...patch } : l)) }, history: `Layer ${a.id}` };
    }
    case "CAD_DELETE_LAYER": {
      if (a.id === "0" || !cad.layers.some((l) => l.id === a.id)) return null;
      const move = <T extends { layerId?: string }>(e: T): T => (e.layerId === a.id ? { ...e, layerId: "0" } : e);
      return {
        shapes: shapes.map(move),
        cad: {
          ...cad,
          layers: cad.layers.filter((l) => l.id !== a.id),
          annotations: cad.annotations.map(move),
          currentLayerId: cad.currentLayerId === a.id ? "0" : cad.currentLayerId,
        },
        history: `Delete layer ${a.id} (entities moved to 0)`,
      };
    }
    case "CAD_SET_CURRENT_LAYER":
      if (!cad.layers.some((l) => l.id === a.id)) return null;
      return { shapes, cad: { ...cad, currentLayerId: a.id } };
    case "CAD_SET_ENTITY_LAYER": {
      const ids = new Set(a.ids);
      // Component entities take their layers from the definition; moving them would be undone by the next regeneration.
      const movable = (e: { id: string; componentInstanceId?: string }) => ids.has(e.id) && !e.componentInstanceId;
      return {
        shapes: shapes.map((s) => (movable(s) ? { ...s, layerId: a.layerId } : s)),
        cad: { ...cad, annotations: cad.annotations.map((x) => (movable(x) ? { ...x, layerId: a.layerId } : x)) },
        history: `Move ${a.ids.length} to layer ${a.layerId}`,
      };
    }
    case "CAD_ADD_ANNOTATION": {
      const ann = { ...a.annotation, id: a.annotation.id || uid("ann"), layerId: a.annotation.layerId ?? defaultLayerFor(cad, a.annotation) };
      return { shapes, cad: { ...cad, annotations: [...cad.annotations, ann] }, history: `Add ${ann.type}`, select: a.select ? [ann.id] : undefined };
    }
    case "CAD_UPDATE_ANNOTATION": {
      if (!cad.annotations.some((x) => x.id === a.id)) return null;
      return { shapes, cad: { ...cad, annotations: cad.annotations.map((x) => (x.id === a.id ? ({ ...x, ...a.patch } as Annotation) : x)) }, history: `Edit annotation` };
    }
    case "CAD_DELETE_ANNOTATIONS": {
      const ids = new Set(a.ids);
      const next = cad.annotations.filter((x) => !ids.has(x.id) || !!x.componentInstanceId);
      if (next.length === cad.annotations.length) return null;
      return { shapes, cad: { ...cad, annotations: next }, history: `Delete ${cad.annotations.length - next.length} annotation(s)` };
    }
    case "CAD_INSERT_COMPONENT": {
      const def = definitionFor(cad, a.definitionId);
      if (!def) {
        return { shapes, cad: { ...cad, componentNotice: { instanceId: "", ok: false, message: `Unknown component "${a.definitionId}".`, issues: [], at: Date.now() } } };
      }
      const id = a.id && !cad.components.some((c) => c.id === a.id) ? a.id : nextInstanceId(cad, def.semanticType);
      const inst: ComponentInstance = {
        id,
        definitionId: def.id,
        name: a.name ?? `${def.name} ${id.split("-").pop()}`,
        values: { ...(a.values ?? {}) },
        x: a.at.x,
        y: a.at.y,
        mirror: a.mirror,
        absoluteElevation: a.absoluteElevation ?? def.parameters.some((p) => p.kind === "level"),
      };
      const probe = evaluateInstance(inst, cad);
      if (!probe) return null;
      if (probe.blocked) {
        const errs = probe.evaluation.issues.filter((i) => i.severity === "error");
        return { shapes, cad: { ...cad, componentNotice: { instanceId: id, ok: false, message: `Not inserted: ${errs.map((e) => e.message).join(" ")}`, issues: errs, at: Date.now() } } };
      }
      let nextCad: CadDocState = { ...cad, components: [...cad.components, inst] };
      let regen = regenerateInstances(shapes, nextCad, [id]);
      // The first assembly on a drawing sets the annotation scale: text and
      // dimension spacing are paper sizes, and a 60 m bridge drawn at 1:50
      // annotation has text no one can read on the sheet it will be plotted on.
      if (def.category === "assembly" && cad.components.length === 0) {
        const mine = regen.shapes.filter((s) => s.componentInstanceId === id);
        const b = computeMultiShapeBounds(mine);
        if (b) {
          const L = sheetLayout("A1");
          const scale = def.drawingScale ?? fitScale(b.width * 1.25, b.height * 1.25, L.drawArea.width, L.drawArea.height - 16);
          if (scale !== cad.settings.annotationScale) {
            nextCad = { ...nextCad, settings: { ...nextCad.settings, annotationScale: scale } };
            regen = regenerateInstances(shapes, nextCad, [id]);
          }
        }
      }
      const warnings = probe.evaluation.issues.filter((i) => i.severity === "warning");
      return {
        shapes: regen.shapes,
        cad: {
          ...nextCad,
          annotations: regen.annotations,
          componentNotice: {
            instanceId: id,
            ok: true,
            message: `Inserted ${inst.name}.${nextCad.settings.annotationScale !== cad.settings.annotationScale ? ` Annotation scale set to 1:${nextCad.settings.annotationScale} to suit an A1 sheet.` : ""}${warnings.length ? ` ${warnings.length} warning(s).` : ""}`,
            issues: warnings,
            at: Date.now(),
          },
        },
        history: `Insert ${inst.name}`,
        select: regen.shapes.filter((s) => s.componentInstanceId === id).map((s) => s.id),
      };
    }
    case "CAD_SET_COMPONENT_VALUES": {
      const inst = cad.components.find((c) => c.id === a.instanceId);
      if (!inst) return null;
      const def = definitionFor(cad, inst.definitionId);
      const known = new Set([...(def?.parameters.map((p) => p.name) ?? []), ...(inst.customValues ?? []).map((c) => c.name)]);
      const unknown = Object.keys(a.values).filter((k) => !known.has(k));
      if (unknown.length) {
        return { shapes, cad: { ...cad, componentNotice: { instanceId: inst.id, ok: false, message: `${inst.name} has no value called ${unknown.join(", ")}.`, issues: [], at: Date.now() } } };
      }
      const related = Object.keys(a.values).filter((k) => inst.relations?.some((r) => r.name === k));
      if (related.length) {
        return {
          shapes,
          cad: { ...cad, componentNotice: { instanceId: inst.id, ok: false, message: `${related.join(", ")} follow${related.length === 1 ? "s" : ""} a relationship; remove the relationship (Author mode) to type ${related.length === 1 ? "it" : "them"}.`, issues: [], at: Date.now() } },
        };
      }
      const customs = new Map((inst.customValues ?? []).map((c) => [c.name, c]));
      const values: Record<string, number> = { ...inst.values };
      let customValues = inst.customValues;
      for (const [k, v] of Object.entries(a.values)) {
        if (customs.has(k)) customValues = (customValues ?? []).map((c) => (c.name === k ? { ...c, value: v } : c));
        else values[k] = v;
      }
      const candidate: ComponentInstance = { ...inst, values, customValues };
      const changed = Object.entries(a.values)
        .map(([k, v]) => `${k} ${fmt(inst.values[k] ?? customs.get(k)?.value ?? def?.parameters.find((p) => p.name === k)?.default)} → ${fmt(v)}`)
        .join(", ");
      return commitInstance(shapes, cad, inst, candidate, changed, a.description);
    }
    case "CAD_EDIT_COMPONENT_INPUTS": {
      const inst = cad.components.find((c) => c.id === a.instanceId);
      if (!inst) return null;
      const def = definitionFor(cad, inst.definitionId);
      const values = { ...inst.values };
      for (const k of a.clear ?? []) delete values[k];
      const candidate: ComponentInstance = {
        ...inst,
        values,
        relations: a.relations ?? inst.relations,
        customValues: a.customValues ?? inst.customValues,
        tables: a.tables ? { ...(inst.tables ?? {}), ...a.tables } : inst.tables,
      };
      const parts: string[] = [];
      if (a.clear?.length) parts.push(`${a.clear.join(", ")} back to ${a.clear.length === 1 ? "its" : "their"} default`);
      if (a.relations) parts.push(describeRelationChange(inst.relations ?? [], a.relations));
      if (a.customValues) parts.push(`inputs: ${a.customValues.map((c) => `${c.name} = ${fmt(c.value)}`).join(", ") || "none"}`);
      if (a.tables) for (const [t, rows] of Object.entries(a.tables)) parts.push(`${def?.tables?.find((x) => x.name === t)?.label ?? t}: ${rows.length} row(s)`);
      return commitInstance(shapes, cad, inst, candidate, parts.filter(Boolean).join("; ") || "no change", a.description);
    }
    case "CAD_PUT_DEFINITION": {
      const own = cad.definitions ?? [];
      const definitions = own.some((d) => d.id === a.definition.id) ? own.map((d) => (d.id === a.definition.id ? a.definition : d)) : [...own, a.definition];
      const nextCad: CadDocState = { ...cad, definitions };
      const users = cad.components.filter((c) => c.definitionId === a.definition.id).map((c) => c.id);
      if (!users.length) return { shapes, cad: nextCad, history: `Component ${a.definition.name}` };
      const regen = regenerateInstances(shapes, nextCad, users);
      return { shapes: regen.shapes, cad: { ...nextCad, annotations: regen.annotations }, history: `Component ${a.definition.name}` };
    }
    case "CAD_MAKE_PARAMETRIC": {
      const sel = parametricSelection(shapes, cad, a.shapeIds, a.annotationIds);
      if (sel.shapes.length === 0) {
        return { shapes, cad: { ...cad, componentNotice: { instanceId: "", ok: false, message: "Nothing to make parametric — draw something first (components are already parametric).", issues: [], at: Date.now() } } };
      }
      const plan = planFor(shapes, cad, sel, a.options);
      if (plan.mismatches.length) {
        return { shapes, cad: { ...cad, componentNotice: { instanceId: "", ok: false, message: `Not made parametric — ${plan.mismatches.join(" ")} Nothing was changed.`, issues: [], at: Date.now() } } };
      }
      const own = cad.definitions ?? [];
      const definitions = own.some((d) => d.id === plan.definition.id) ? own.map((d) => (d.id === plan.definition.id ? plan.definition : d)) : [...own, plan.definition];
      let nextCad: CadDocState = { ...cad, definitions };
      const id = nextInstanceId(nextCad, plan.definition.semanticType);
      const inst: ComponentInstance = {
        id,
        definitionId: plan.definition.id,
        name: plan.definition.name,
        values: {},
        x: 0,
        y: 0,
        absoluteElevation: plan.absoluteElevation,
        relations: plan.relations,
        customValues: plan.customValues,
      };
      const probe = evaluateInstance(inst, nextCad);
      if (!probe || probe.blocked) {
        const errs = probe?.evaluation.issues.filter((i) => i.severity === "error") ?? [];
        return { shapes, cad: { ...cad, componentNotice: { instanceId: "", ok: false, message: `Not made parametric: ${errs.map((e) => e.message).join(" ") || "the component could not be evaluated."} Nothing was changed.`, issues: errs, at: Date.now() } } };
      }
      const gone = new Set(plan.shapeIds);
      const goneAnn = new Set(plan.annotationIds);
      // Annotations left free keep pointing where they pointed, as fixed points.
      const idx = indexShapes(shapes);
      const pin = (r: AnchorRef): AnchorRef => (r.kind === "shape" && gone.has(r.shapeId) ? { kind: "point", ...(resolveAnchor(r, idx) ?? { x: 0, y: 0 }) } : r);
      const keptAnn = cad.annotations
        .filter((x) => !goneAnn.has(x.id))
        .map((x) => {
          if (x.componentInstanceId) return x;
          if (x.type === "text" || x.type === "level" || x.type === "table") return { ...x, at: pin(x.at) } as Annotation;
          if (x.type === "marker") return { ...x, at: pin(x.at), to: x.to ? pin(x.to) : undefined } as Annotation;
          if (x.type === "leader") return { ...x, points: x.points.map(pin) } as Annotation;
          if (x.type === "dimension") return { ...x, p1: pin(x.p1), p2: pin(x.p2), p3: x.p3 ? pin(x.p3) : undefined } as Annotation;
          return x;
        });
      nextCad = { ...nextCad, annotations: keptAnn, components: [...nextCad.components, inst], carried: undefined };
      const regen = regenerateInstances(
        shapes.filter((x) => !gone.has(x.id)),
        nextCad,
        [id]
      );
      const params = plan.definition.parameters.length;
      const results = plan.definition.formulas?.filter((f) => f.report).length ?? 0;
      return {
        shapes: regen.shapes,
        cad: {
          ...nextCad,
          annotations: regen.annotations,
          componentNotice: { instanceId: id, ok: true, message: `${inst.name} is parametric: ${params} value(s), ${results} result(s). Change them in the Bridge or Run panel; write relationships in Author mode.`, issues: [], at: Date.now() },
        },
        history: `Make parametric: ${inst.name}`,
        select: regen.shapes.filter((x) => x.componentInstanceId === id).map((x) => x.id),
      };
    }
    case "CAD_EXPLODE_COMPONENT": {
      const inst = cad.components.find((c) => c.id === a.instanceId);
      if (!inst) return null;
      const def = definitionFor(cad, inst.definitionId);
      const free = <T extends { componentInstanceId?: string; source?: string; tags?: string[] }>(e: T): T => {
        const { componentInstanceId: _c, ...rest } = e;
        void _c;
        return { ...rest, source: "user", tags: rest.tags?.filter((t) => !t.startsWith("scope:")) } as T;
      };
      const nextShapes = shapes.map((x) => (x.componentInstanceId === inst.id ? free(x) : x));
      const nextAnn = cad.annotations.map((x) => (x.componentInstanceId === inst.id ? free(x) : x));
      let definitions = cad.definitions;
      if (def?.origin?.kind === "drawn") {
        definitions = (cad.definitions ?? []).map((d) => (d.id === def.id ? { ...d, origin: { kind: "drawn" as const, relations: inst.relations, customValues: inst.customValues } } : d));
      }
      return {
        shapes: nextShapes,
        cad: {
          ...cad,
          definitions,
          annotations: nextAnn,
          components: cad.components.filter((c) => c.id !== inst.id),
          componentNotice: null,
          carried: inst.relations?.length || inst.customValues?.length ? { relations: inst.relations, customValues: inst.customValues } : undefined,
        },
        history: `Edit ${inst.name} as geometry`,
        select: nextShapes.filter((x) => shapes.find((o) => o.id === x.id)?.componentInstanceId === inst.id).map((x) => x.id),
      };
    }
    case "CAD_UPDATE_COMPONENT": {
      const inst = cad.components.find((c) => c.id === a.instanceId);
      if (!inst) return null;
      const candidate = { ...inst, ...a.patch };
      const nextCad: CadDocState = { ...cad, components: cad.components.map((c) => (c.id === inst.id ? candidate : c)) };
      const regen = regenerateInstances(shapes, nextCad, [inst.id]);
      return { shapes: regen.shapes, cad: { ...nextCad, annotations: regen.annotations }, history: `Edit ${candidate.name}` };
    }
    case "CAD_DELETE_COMPONENT": {
      if (!cad.components.some((c) => c.id === a.instanceId)) return null;
      const inst = cad.components.find((c) => c.id === a.instanceId)!;
      return {
        shapes: shapes.filter((s) => componentIdOf(s) !== a.instanceId),
        cad: { ...cad, components: cad.components.filter((c) => c.id !== a.instanceId), annotations: cad.annotations.filter((x) => componentIdOf(x) !== a.instanceId) },
        history: `Delete ${inst.name}`,
      };
    }
    case "CAD_SET_SETTINGS": {
      const nextCad: CadDocState = { ...cad, settings: { ...cad.settings, ...a.patch } };
      // Annotation spacing depends on the annotation scale; regenerate so dimension rows respace.
      const regen = regenerateInstances(shapes, nextCad);
      return { shapes: regen.shapes, cad: { ...nextCad, annotations: regen.annotations }, history: "Drawing settings" };
    }
    case "CAD_SET_PROJECT":
      return { shapes, cad: { ...cad, project: a.project }, history: a.description ?? "Edit project data" };
    case "CAD_SET_SHEETS":
      return { shapes, cad: { ...cad, sheets: a.sheets }, history: "Sheets" };
    case "CAD_ADD_REVISION": {
      const rev = String(cad.revisions.length);
      const date = new Date().toISOString().slice(0, 10);
      return {
        shapes,
        cad: { ...cad, revisions: [...cad.revisions, { rev, description: a.description, date }], project: { ...cad.project, identity: { ...cad.project.identity, revision: rev } } },
        history: `Revision ${rev}`,
      };
    }
    case "CAD_LOAD_DOCUMENT":
      return { shapes: a.shapes, cad: a.cad, history: a.description ?? "Load drawing" };
    case "CAD_CLEAR_NOTICE":
      return { shapes, cad: { ...cad, componentNotice: null } };
    case "CAD_CLASSIFY":
      return classify(shapes, cad, a.ids, a.role);
  }
}

/**
 * Tag drawn geometry with what it is, and let the drawing say so: the term's
 * layer, a level marker on a level line (associative — it reads the RL from
 * the line), and the term's hatch inside a closed member or region, with any
 * closed outline inside it left clear. Component geometry already knows what
 * it is and is not re-tagged.
 */
function classify(shapes: Shape[], cad: CadDocState, ids: string[], role: string): CadResult | null {
  const sel = new Set(ids);
  const targets = shapes.filter((s) => sel.has(s.id) && !s.componentInstanceId);
  if (targets.length === 0) return null;
  const term = termFor(role);
  const targetIds = new Set(targets.map((t) => t.id));
  if (!term) {
    // Clearing a role removes what the role added.
    const nextShapes = shapes.map((s) => (targetIds.has(s.id) ? { ...s, semanticRole: undefined } : s));
    const ann = cad.annotations.filter((x) => !(x.tags?.includes("semantic") && annotationTouches(x, targetIds)));
    return { shapes: nextShapes, cad: { ...cad, annotations: ann }, history: `Clear role of ${targets.length}` };
  }
  const layerId = layerIdFor(cad.layers, term.layer);
  const asRef = term.kind === "level" || term.kind === "axis";
  const nextShapes = shapes.map((s) => (targetIds.has(s.id) ? { ...s, semanticRole: term.role, layerId, isReference: asRef ? true : s.isReference } : s));
  // Replace annotations this action added before for the same geometry.
  const annotations = cad.annotations.filter((x) => !(x.tags?.includes("semantic") && annotationTouches(x, targetIds)));
  if (term.kind === "level") {
    for (const s of targets) {
      if (s.type !== "line") continue;
      const leftIsStart = s.x1 <= s.x2;
      annotations.push({
        id: `lvl_${s.id}`,
        type: "level",
        at: { kind: "shape", shapeId: s.id, handle: leftIsStart ? "start" : "end" },
        label: term.levelLabel ?? term.label.toUpperCase(),
        layerId: layerIdFor(cad.layers, "level"),
        semanticRole: term.role,
        tags: ["semantic"],
        source: "user",
      } as Annotation);
    }
  }
  if (term.hatch && (term.kind === "region" || term.kind === "member")) {
    const ring = traceRing(targets);
    if (ring) {
      const holes: string[] = [];
      for (const other of shapes) {
        if (targetIds.has(other.id) || other.componentInstanceId || other.type === "line") continue;
        const r = traceRing([other]);
        if (r && r.every((p) => pointInPolygon(p, ring))) holes.push(other.id);
      }
      annotations.push({
        id: `hatch_${[...targetIds][0]}`,
        type: "hatch",
        material: term.hatch,
        boundary: { kind: "shapes", shapeIds: [...targetIds], holeShapeIds: holes },
        layerId: layerIdFor(cad.layers, "hatch"),
        semanticRole: term.role,
        tags: ["semantic"],
        source: "user",
      } as Annotation);
    }
  }
  return { shapes: nextShapes, cad: { ...cad, annotations }, history: `${targets.length} → ${term.label}` };
}

function annotationTouches(a: Annotation, ids: Set<string>): boolean {
  if (a.type === "level" && a.at.kind === "shape") return ids.has(a.at.shapeId);
  if (a.type === "hatch" && a.boundary.kind === "shapes") return a.boundary.shapeIds.some((id) => ids.has(id));
  return false;
}

/**
 * What "Make parametric" works on: the given shapes (else every free shape),
 * with the annotations that belong to them — those that point at them, those
 * explicitly given, and free notes, levels and dimensions within their extent.
 */
export function parametricSelection(shapes: Shape[], cad: CadDocState, shapeIds?: string[], annotationIds?: string[]): { shapes: Shape[]; annotations: Annotation[] } {
  const freeShapes = shapes.filter((s) => !s.componentInstanceId);
  const chosen = shapeIds && shapeIds.length ? freeShapes.filter((s) => shapeIds.includes(s.id)) : freeShapes;
  const freeAnn = cad.annotations.filter((x) => !x.componentInstanceId);
  if (!shapeIds || shapeIds.length === 0) return { shapes: chosen, annotations: annotationIds?.length ? freeAnn.filter((x) => annotationIds.includes(x.id)) : freeAnn };
  const ids = new Set(chosen.map((s) => s.id));
  const b = computeMultiShapeBounds(chosen);
  const margin = cad.settings.textHeight * cad.settings.annotationScale * 12;
  const idx = indexShapes(shapes);
  const inside = (r: AnchorRef) => {
    if (r.kind === "shape") return ids.has(r.shapeId);
    const p = resolveAnchor(r, idx);
    return !!p && !!b && p.x >= b.minX - margin && p.x <= b.maxX + margin && p.y >= b.minY - margin && p.y <= b.maxY + margin;
  };
  const belongs = (x: Annotation): boolean => {
    if (annotationIds?.includes(x.id)) return true;
    switch (x.type) {
      case "hatch":
        return x.boundary.kind === "shapes" ? x.boundary.shapeIds.every((i) => ids.has(i)) : x.boundary.outer.every((p) => inside({ kind: "point", ...p }));
      case "dimension":
        return inside(x.p1) && inside(x.p2);
      case "level":
      case "text":
        return inside(x.at);
      case "leader":
        return x.points.every(inside);
      default:
        return false;
    }
  };
  return { shapes: chosen, annotations: freeAnn.filter(belongs) };
}

/** Plans "Make parametric" against the document (library + drawing components). */
export function planFor(shapes: Shape[], cad: CadDocState, sel: { shapes: Shape[]; annotations: Annotation[] }, options?: ParametrizeOptions): ParametricPlan {
  return planParametric(
    { shapes: sel.shapes, context: shapes, annotations: sel.annotations, settings: cad.settings, layers: cad.layers, existing: cad.definitions, registry: registryFor(cad) },
    { name: options?.name ?? `Drawn component ${(cad.definitions?.length ?? 0) + 1}`, carry: cad.carried, ...options }
  );
}

/**
 * Re-evaluates an instance with a candidate change; applies it and regenerates
 * exactly that instance, or refuses with the reason and changes nothing.
 */
function commitInstance(shapes: Shape[], cad: CadDocState, inst: ComponentInstance, candidate: ComponentInstance, changed: string, description?: string): CadResult | null {
  const probe = evaluateInstance(candidate, cad);
  if (!probe) return null;
  if (probe.blocked) {
    const errs = probe.evaluation.issues.filter((i) => i.severity === "error");
    return {
      shapes,
      cad: { ...cad, componentNotice: { instanceId: inst.id, ok: false, message: `Refused (${changed}): ${errs.map((e) => e.message).join(" ")} Nothing was changed.`, issues: errs, at: Date.now() } },
    };
  }
  const nextCad: CadDocState = { ...cad, components: cad.components.map((c) => (c.id === inst.id ? candidate : c)) };
  const regen = regenerateInstances(shapes, nextCad, [inst.id]);
  const warnings = probe.evaluation.issues.filter((i) => i.severity === "warning");
  return {
    shapes: regen.shapes,
    cad: {
      ...nextCad,
      annotations: regen.annotations,
      componentNotice: { instanceId: inst.id, ok: true, message: `${inst.name}: ${changed}.${warnings.length ? ` ${warnings.length} warning(s) to review.` : ""}`, issues: warnings, at: Date.now() },
    },
    history: description ?? `${inst.name}: ${changed}`,
  };
}

function describeRelationChange(before: Relationship[], after: Relationship[]): string {
  const b = new Map(before.map((r) => [r.name, r.expr]));
  const a = new Map(after.map((r) => [r.name, r.expr]));
  const out: string[] = [];
  for (const [n, e] of a) if (b.get(n) !== e) out.push(`${n} = ${e}`);
  for (const n of b.keys()) if (!a.has(n)) out.push(`${n} typed again`);
  return out.length ? `relationship ${out.join(", ")}` : "";
}

function fmt(v: number | undefined): string {
  if (v === undefined) return "?";
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
}

function defaultLayerFor(cad: CadDocState, a: Annotation): string {
  switch (a.type) {
    case "dimension":
      return layerIdFor(cad.layers, "dimension");
    case "hatch":
      return layerIdFor(cad.layers, "hatch");
    case "level":
      return layerIdFor(cad.layers, "level");
    case "leader":
      return layerIdFor(cad.layers, "leader");
    case "revcloud":
      return layerIdFor(cad.layers, "revision");
    default:
      return layerIdFor(cad.layers, "text");
  }
}

// ---------------------------------------------------------------------------
// Selection-aware helpers used by MOVE / DELETE / DUPLICATE
// ---------------------------------------------------------------------------

function moveAnchor(r: AnchorRef, dx: number, dy: number): AnchorRef {
  return r.kind === "point" ? { ...r, x: r.x + dx, y: r.y + dy } : r;
}

export function translateAnnotation(a: Annotation, dx: number, dy: number): Annotation {
  switch (a.type) {
    case "text":
    case "level":
    case "table":
      return { ...a, at: moveAnchor(a.at, dx, dy) } as Annotation;
    case "marker":
      return { ...a, at: moveAnchor(a.at, dx, dy), to: a.to ? moveAnchor(a.to, dx, dy) : undefined };
    case "leader":
      return { ...a, points: a.points.map((p) => moveAnchor(p, dx, dy)) };
    case "dimension":
      return { ...a, p1: moveAnchor(a.p1, dx, dy), p2: moveAnchor(a.p2, dx, dy), p3: a.p3 ? moveAnchor(a.p3, dx, dy) : undefined };
    case "hatch":
      return a.boundary.kind === "polygon"
        ? { ...a, boundary: { ...a.boundary, outer: a.boundary.outer.map((p) => ({ x: p.x + dx, y: p.y + dy })), holes: a.boundary.holes?.map((h) => h.map((p) => ({ x: p.x + dx, y: p.y + dy }))) } }
        : a;
    case "revcloud":
      return { ...a, points: a.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  }
}

export function translateShape(s: Shape, dx: number, dy: number): Shape {
  switch (s.type) {
    case "line":
    case "arrow":
      return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
    case "rectangle":
      return { ...s, x: s.x + dx, y: s.y + dy };
    default:
      return { ...s, cx: s.cx + dx, cy: s.cy + dy };
  }
}

/** Component instances touched by a selection. */
export function selectedComponents(shapes: Shape[], cad: CadDocState, ids: string[]): Set<string> {
  const sel = new Set(ids);
  const out = new Set<string>();
  for (const s of shapes) if (sel.has(s.id) && s.componentInstanceId) out.add(s.componentInstanceId);
  for (const a of cad.annotations) if (sel.has(a.id) && a.componentInstanceId) out.add(a.componentInstanceId);
  return out;
}

/**
 * Moves the selection. Free shapes and annotations translate; a component
 * moves as a whole by translating its entities and origin together — exactly
 * what regenerating at the new origin would give, without the regeneration.
 * An instance drawn at true levels only moves sideways: its height IS its
 * elevation.
 */
export function moveSelection(shapes: Shape[], cad: CadDocState, ids: string[], dx: number, dy: number): { shapes: Shape[]; cad: CadDocState } {
  const sel = new Set(ids);
  const comps = selectedComponents(shapes, cad, ids);
  const compShift = new Map<string, { dx: number; dy: number }>();
  for (const c of cad.components) {
    if (!comps.has(c.id) || c.locked) continue;
    compShift.set(c.id, { dx, dy: c.absoluteElevation ? 0 : dy });
  }
  const nextShapes = shapes.map((s) => {
    if (s.componentInstanceId) {
      const d = compShift.get(s.componentInstanceId);
      return d ? translateShape(s, d.dx, d.dy) : s;
    }
    return sel.has(s.id) && !s.isLocked ? translateShape(s, dx, dy) : s;
  });
  const nextAnn = cad.annotations.map((a) => {
    if (a.componentInstanceId) {
      const d = compShift.get(a.componentInstanceId);
      return d ? translateAnnotation(a, d.dx, d.dy) : a;
    }
    return sel.has(a.id) && !a.isLocked ? translateAnnotation(a, dx, dy) : a;
  });
  const nextComps = cad.components.map((c) => {
    const d = compShift.get(c.id);
    return d ? { ...c, x: c.x + d.dx, y: c.y + d.dy } : c;
  });
  return { shapes: nextShapes, cad: { ...cad, annotations: nextAnn, components: nextComps } };
}

/** Deletes the selection: free entities, and whole components that were selected. */
export function deleteSelection(shapes: Shape[], cad: CadDocState, ids: string[]): { shapes: Shape[]; cad: CadDocState; count: number } {
  const sel = new Set(ids);
  const comps = selectedComponents(shapes, cad, ids);
  const nextShapes = shapes.filter((s) => (s.componentInstanceId ? !comps.has(s.componentInstanceId) : !sel.has(s.id)));
  const nextAnn = cad.annotations.filter((a) => (a.componentInstanceId ? !comps.has(a.componentInstanceId) : !sel.has(a.id)));
  const nextComps = cad.components.filter((c) => !comps.has(c.id));
  const count = shapes.length - nextShapes.length + cad.annotations.length - nextAnn.length;
  return { shapes: nextShapes, cad: { ...cad, annotations: nextAnn, components: nextComps }, count };
}

/** Selection expanded to whole component instances. */
export function expandComponentSelection(shapes: Shape[], cad: CadDocState, ids: string[]): string[] {
  const comps = selectedComponents(shapes, cad, ids);
  if (comps.size === 0) return ids;
  const out = new Set(ids.filter((id) => !cad.annotations.some((a) => a.id === id && a.componentInstanceId)));
  for (const s of shapes) if (s.componentInstanceId && comps.has(s.componentInstanceId)) out.add(s.id);
  return [...out];
}
