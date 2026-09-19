/**
 * The drafting agent's CAD-document tools: the component library, the design
 * basis, annotation, layers, the audit and sheets.
 *
 * Every tool goes through `DraftingWorkspace.applyCad`, i.e. the same reducer
 * logic the editor runs, so the agent cannot do anything a person could not —
 * and an edit that breaks a component's invariants is refused for the agent
 * exactly as it is for a person, with the same reason.
 *
 * Two authority rules from the railway guide (§1.2, §3.3) are enforced here,
 * not merely requested in the prompt:
 *   - the agent may ENTER a design-basis value but never CONFIRM it — its
 *     values are INFERRED, ASSUMED_FOR_DRAFT or PENDING_CONFIRMATION only;
 *   - the agent cannot change the drawing's approval status.
 *
 * Coordinates are model coordinates (mm, Y up) as everywhere in the agent.
 */

import type { FunctionDeclaration } from "../../ai/geminiChat";
import type { Annotation, HatchMaterial, LayerCategory } from "../../cad/types";
import { canvasYOfLevel } from "../../cad/types";
import { COMPONENT_LIBRARY } from "../../components/library";
import { definitionFor, evaluateInstance } from "../../cad/document";
import { DBR_FIELD_META, type DbrFields, type InputStatus, type Lifecycle, type StructureType } from "../../bridge/project";
import { runAudit, auditToText } from "../../bridge/audit";
import { defaultSheet } from "../../cad/export";
import type { PaperSize } from "../../cad/sheet";
import { HATCH_MATERIALS } from "../../cad/hatch";
import { regionAt } from "../../cad/region";
import { BRIDGE_TERMS, termFor } from "../../bridge/glossary";
import { recognizeBridge } from "../../bridge/recognize";
import { ToolError, type DraftingWorkspace } from "./workspace";
import { formatEntry, searchKnowledge, knowledgeFiles } from "../../bridge/knowledge";
import { DRAFTING_SKILLS, findSkill } from "./skills";
import { describePlan } from "../../components/fromDrawing";
import { parametricSelection, planFor } from "../../state/cadActions";
import type { TableRow, ValueUnit } from "../../components/types";

type Args = Record<string, unknown>;

const S = (description: string) => ({ type: "string", description });
const N = (description: string) => ({ type: "number", description });
const XY = (description: string) => ({ type: "array", items: { type: "number" }, description: `${description} [x, y] in mm, Y up.` });
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const VALUES = {
  type: "array",
  description: "Named values to set, e.g. [{name: \"ClearSpan\", value: 3000}]. Lengths in mm, levels in m (reduced level), angles in degrees.",
  items: obj({ name: S("Value name exactly as component_info lists it"), value: N("The value") }, ["name", "value"]),
};

export const CAD_TOOLS: FunctionDeclaration[] = [
  {
    name: "list_components",
    description:
      "The parametric component library: bridge GAD assemblies, box and pipe culverts, piers, abutments, spans, deck sections, pile groups, well foundations, retaining walls, level sets. A component's geometry is written from named values, so it is fully defined by construction — no rules or degrees of freedom to manage. Prefer a component whenever one fits the brief.",
    parameters: obj({}),
  },
  {
    name: "component_info",
    description: "A component's values (name, meaning, unit, default, usual range, group), derived results and named anchor points.",
    parameters: obj({ definition: S("Component id from list_components, e.g. ir.box_culvert.gad") }, ["definition"]),
  },
  {
    name: "insert_component",
    description:
      "Place a component with the values from the brief or reference. Values not given take the template default — a drafting aid, which the audit will flag until real values are entered. Components with level values (RL in m) are drawn at true reduced levels; `at` then only sets x. Refused, with the reason, if the values break the component (e.g. haunches meeting across an opening).",
    parameters: obj({ definition: S("Component id"), values: VALUES, at: XY("Where its origin goes"), name: S("A readable name, e.g. 'Major bridge 123'") }, ["definition"]),
  },
  {
    name: "set_component_values",
    description: "Change values of a placed component. It regenerates exactly what depends on them, or refuses and changes nothing. reset hands typed values back to their default (an auto value then follows its formula again).",
    parameters: obj({ instance: S("Instance id, e.g. BRIDGE-1"), values: VALUES, reset: { type: "array", items: { type: "string" }, description: "Value names to hand back to their default/auto" } }, ["instance"]),
  },
  {
    name: "describe_component",
    description: "A placed component's current values, derived results (heights, clearances, free board…) and any problems.",
    parameters: obj({ instance: S("Instance id") }, ["instance"]),
  },
  {
    name: "delete_component",
    description: "Remove a placed component and everything it generated.",
    parameters: obj({ instance: S("Instance id") }, ["instance"]),
  },
  {
    name: "design_basis",
    description:
      "Enter one design-basis (DBR) value with where it came from. You can enter values but never confirm them: use INFERRED for anything read from an image or deduced, ASSUMED_FOR_DRAFT for a placeholder you chose, PENDING_CONFIRMATION for a number the author typed in the brief. Fields: " +
      Object.keys(DBR_FIELD_META).join(", "),
    parameters: obj(
      {
        field: S("Field name"),
        value: S("Value (levels in m RL, discharge in cumecs, lengths in mm, or text)"),
        status: { type: "string", enum: ["INFERRED", "ASSUMED_FOR_DRAFT", "PENDING_CONFIRMATION"], description: "How sure — never confirmed by the agent" },
        note: S("Where it came from, e.g. 'written on the reference GAD'"),
      },
      ["field", "value", "status"]
    ),
  },
  {
    name: "project_info",
    description: "Title-block and project fields. Only set what the brief or reference actually states.",
    parameters: obj({
      railway: S("Zonal railway"),
      division: S("Division"),
      project_name: S("Name of work"),
      drawing_title: S("Drawing title"),
      drawing_number: S("Drawing number"),
      bridge_number: S("Bridge number"),
      chainage: S("Chainage, e.g. km 123/4-5"),
      line: S("UP / DN / single"),
      river: S("River or stream"),
      structure_type: { type: "string", enum: ["box_culvert", "pipe_culvert", "slab_bridge", "girder_bridge", "steel_girder_bridge", "arch_bridge", "rob", "rub", "fob", "other"], description: "Structure type" },
      lifecycle: { type: "string", enum: ["new_work", "rebuilding", "doubling", "gauge_conversion", "rehabilitation", "open_line"], description: "Kind of work" },
    }),
  },
  {
    name: "record_assumption",
    description: "Record an assumption you had to make. Open assumptions block issue until someone closes them against a source.",
    parameters: obj({ text: S("The assumption, specifically") }, ["text"]),
  },
  {
    name: "annotate",
    description:
      "Add drawing annotation (see skill gad-drafting-style for how IR drawings use them). kind: text (at, text, height, align, rotation), note (text — appended to the sheet's general notes), leader (points [tip, elbow, shelf end] or at → to, text, placement above = text on the shelf), level (at a point on the geometry, label e.g. 'BED LEVEL', style gad, symbol — the RL is read from the point), dimension (from, to, offset mm, prefix, hide_value; linear unless aligned:true), hatch (at = a point inside a closed free-drawn outline, material, angle), north (at), flow / kilometrage (at → to, label), section (at → to).",
    parameters: obj(
      {
        kind: { type: "string", enum: ["text", "note", "leader", "level", "dimension", "hatch", "north", "flow", "kilometrage", "section"], description: "What to add" },
        at: XY("Point"),
        to: XY("Second point"),
        from: XY("Dimension first point"),
        text: S("Text"),
        label: S("Label"),
        offset: N("Dimension line offset in mm (positive: above/right)"),
        aligned: { type: "boolean", description: "Aligned dimension" },
        material: { type: "string", enum: Object.keys(HATCH_MATERIALS), description: "Hatch material" },
        style: { type: "string", enum: ["marker", "gad"], description: "Level: gad writes 'LABEL = 101.000M.' on the line (IR GAD); marker is a triangle" },
        format: S("Level text template with {label} and {rl}, e.g. '{label} = {rl}M' for HFL"),
        symbol: { type: "string", enum: ["none", "water", "ground"], description: "Level symbol: water for HFL/LWL, ground for bed" },
        placement: { type: "string", enum: ["end", "above"], description: "Leader: above writes the text on the shelf (IR callout style)" },
        points: { type: "array", items: { type: "array", items: { type: "number" } }, description: "Leader: arrow tip, elbow(s), shelf end — [[x,y],…]" },
        prefix: S("Dimension text before the number, e.g. 'V.C. '"),
        hide_value: { type: "boolean", description: "Dimension without its number (the value is written in a note)" },
        height: N("Text height, paper mm (default 2.5)"),
        align: { type: "string", enum: ["left", "center", "right"], description: "Text alignment" },
        rotation: N("Text rotation, degrees counter-clockwise"),
        angle: N("Hatch pattern angle, degrees"),
      },
      ["kind"]
    ),
  },
  {
    name: "layer",
    description: "Layers: list them, set the current layer (new drawing goes on it), assign shapes to a layer, or create one.",
    parameters: obj(
      {
        action: { type: "string", enum: ["list", "current", "assign", "create"], description: "What to do" },
        name: S("Layer name"),
        ids: { type: "array", items: { type: "string" }, description: "Shape ids for assign" },
        category: S("For create: outline, hidden, centre, dimension, text, hatch, water, ground, construction, temporary…"),
      },
      ["action"]
    ),
  },
  {
    name: "recognize",
    description:
      "What the editor recognises in your free-drawn geometry — bed level, HFL, formation, earth cushion, clear openings, piers and footings, deck — with evidence and confidence, read from labels, topology and arrangement. Confirm the right ones with classify.",
    parameters: obj({}),
  },
  {
    name: "classify",
    description:
      "Say what drawn geometry IS, using the bridge vocabulary: " +
      BRIDGE_TERMS.map((t) => t.role).join(", ") +
      ". Level lines get an RL marker read from their height; closed members and regions get their hatch (earth for cushion, PCC, RCC…); everything moves to its layer; the audit then reads levels, clearances, cushion depth and openings from your geometry. Use ids or a polyline's name for all its edges; role \"\" clears.",
    parameters: obj({ ids: { type: "array", items: { type: "string" }, description: "Shape ids or polyline names" }, role: S("Role from the vocabulary") }, ["ids", "role"]),
  },
  {
    name: "audit",
    description:
      "Run the GAD audit: design data, component invariants, cross-view level consistency, IRBM rules (classification 1103(3), minimum span/headroom 311(3), vertical clearance 312, free board 313, pile spacing 409), RDSO GAD checklist content, layer standard and sheets. Findings cite their source. Resolve what the drawing can resolve; report the rest.",
    parameters: obj({}),
  },
  {
    name: "bridge_reference",
    description:
      "Look up the project's bridge formula documentation (docs/bridge-formulas): formulas by id (RCR-LVL-002, HPC-GEO-007, PSC-SLAB-005…), validation checks, the master glossary of variables and worked Q&A — RCC box (railway, highway), hume pipe, PSC slab, composite girder, open web girder, template engine. Use it instead of guessing a formula; quote the id you used. A limit found here is a project reference, still 'requires review'.",
    parameters: obj({ query: S("Words to search for, e.g. 'earth cushion railway box', or an id like RCR-LVL-002"), limit: N("How many entries (default 4)") }, ["query"]),
  },
  {
    name: "use_skill",
    description: "Load a drafting skill: a playbook for one kind of drawing (what it contains, IR drafting style, which values drive it, the formulas behind it). Call with no name to list them. Load the matching one before drawing.",
    parameters: obj({ name: S("Skill name, e.g. rcc-box-half-section, gad-drafting-style, make-parametric, bridge-levels, hume-pipe-culvert, psc-slab-bridge") }),
  },
  {
    name: "make_parametric",
    description:
      "Turn what you drew by hand — with its dimensions, level markers and callouts — into ONE parametric component: site levels become inputs (m), dimensions drive (a dimension closing a loop, like the earth cushion, becomes a result), callouts like '150TH. WEARING COURSE' pointing into a layer become values, notes follow their numbers. Call with preview:true first and read the plan; rename with rename, make a dimension a result with results. Refused if any vertex would move.",
    parameters: obj({
      preview: { type: "boolean", description: "Only show the plan" },
      name: S("Component name"),
      shapes: { type: "array", items: { type: "string" }, description: "Only these shapes (default: everything drawn freely)" },
      rename: { type: "array", items: obj({ key: S("Key from the plan (dimension id, callout key, level id or position key)"), name: S("New name, PascalCase") }, ["key", "name"]), description: "Names to use" },
      results: { type: "array", items: { type: "string" }, description: "Dimension keys to treat as results (worked out) rather than driving" },
      replace: S("Definition id of a drawing component this replaces (keeps its relationships)"),
    }),
  },
  {
    name: "relationship",
    description:
      "Write your own formula on a placed component: name = expression. If name is one of its values, that value follows the expression instead of being typed (e.g. RailLevel = FormationLevel + 0.762); otherwise a new worked-out value is reported (e.g. CushionRatio = EarthCushion / ClearSpan). Levels are in m, lengths in mm. Omit expr to remove it. Refused (nothing changes) if it names something unknown, goes round in a circle or breaks the component.",
    parameters: obj({ instance: S("Instance id"), name: S("Value name"), expr: S("Expression; omit to remove the relationship") }, ["instance", "name"]),
  },
  {
    name: "add_input",
    description: "Add an input of your own to a placed component, for relationships to use (e.g. SlopeRatio = 1.5).",
    parameters: obj({ instance: S("Instance id"), name: S("PascalCase name"), value: N("Value"), unit: { type: "string", enum: ["mm", "m", "-", "deg", "m2"], description: "Unit" } }, ["instance", "name", "value"]),
  },
  {
    name: "set_table",
    description: "Set the rows of a component's table value (e.g. foundation layers of the RCC half section: [{name, thickness, hatch}]). Rows are listed top to bottom.",
    parameters: obj(
      {
        instance: S("Instance id"),
        table: S("Table name, e.g. Layers"),
        rows: { type: "array", items: { type: "object" }, description: "Rows: objects with the table's columns (component_info lists them)" },
      },
      ["instance", "table", "rows"]
    ),
  },
  {
    name: "edit_geometry",
    description: "Turn a placed component back into free lines and annotations so its SHAPE can be edited (names stay on its dimensions). Make it parametric again afterwards (make_parametric with replace=<definition id> keeps its relationships).",
    parameters: obj({ instance: S("Instance id") }, ["instance"]),
  },
  {
    name: "make_sheet",
    description: "Lay out a drawing sheet with title block, notes and a locked standard scale that fits the drawing.",
    parameters: obj({ size: { type: "string", enum: ["A0", "A1", "A2", "A3"], description: "Paper; important/major bridge GADs are A0, others A1" } }),
  },
];

export const CAD_TOOL_NAMES = new Set(CAD_TOOLS.map((t) => t.name));

function str(a: Args, k: string): string {
  const v = a[k];
  if (typeof v !== "string" || !v.trim()) throw new ToolError(`"${k}" is required.`);
  return v.trim();
}
function optStr(a: Args, k: string): string | undefined {
  const v = a[k];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function xy(a: Args, k: string): { x: number; y: number } | undefined {
  const v = a[k];
  if (!Array.isArray(v) || v.length < 2) return undefined;
  const x = Number(v[0]);
  const y = Number(v[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new ToolError(`"${k}" must be [x, y] numbers.`);
  return { x, y };
}
function need(a: Args, k: string) {
  const p = xy(a, k);
  if (!p) throw new ToolError(`"${k}" [x, y] is required.`);
  return p;
}
function numOr(a: Args, k: string, fallback: number): number {
  const v = Number(a[k]);
  return a[k] === undefined || a[k] === null || !Number.isFinite(v) ? fallback : v;
}

/** Model (Y up) → canvas (Y down). */
const toCanvas = (p: { x: number; y: number }) => ({ x: p.x, y: p.y === 0 ? 0 : -p.y });

function values(a: Args): Record<string, number> {
  const raw = a.values;
  if (raw === undefined) return {};
  if (!Array.isArray(raw)) throw new ToolError(`"values" must be a list of {name, value}.`);
  const out: Record<string, number> = {};
  for (const item of raw) {
    const r = item as { name?: unknown; value?: unknown };
    const n = typeof r.name === "string" ? r.name.trim() : "";
    const v = Number(r.value);
    if (!n || !Number.isFinite(v)) throw new ToolError(`Each value needs a name and a number (got ${JSON.stringify(item)}).`);
    out[n] = v;
  }
  return out;
}

const f = (v: number) => (Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3))));

function instanceOf(ws: DraftingWorkspace, id: string) {
  const inst = ws.cad.components.find((c) => c.id === id || c.name === id);
  if (!inst) throw new ToolError(`No component "${id}". Placed: ${ws.cad.components.map((c) => c.id).join(", ") || "none"}.`);
  return inst;
}

export function describeInstance(ws: DraftingWorkspace, id: string): string {
  const inst = ws.cad.components.find((c) => c.id === id || c.name === id);
  if (!inst) throw new ToolError(`No component "${id}". Placed: ${ws.cad.components.map((c) => c.id).join(", ") || "none"}.`);
  const def = definitionFor(ws.cad, inst.definitionId)!;
  const out = evaluateInstance(inst, ws.cad);
  if (!out) throw new ToolError(`Unknown definition ${inst.definitionId}.`);
  const src = out.evaluation.sources;
  const vals = def.parameters.map((p) => `${p.name}=${f(out.evaluation.scope[p.name] ?? p.default)}${p.unit === "-" ? "" : p.unit}${src[p.name] === "default" ? " (default)" : src[p.name] === "auto" ? " (auto)" : src[p.name] === "related" ? " (relationship)" : ""}`);
  const derived = [
    ...(def.formulas ?? []).filter((x) => x.report).map((x) => `${x.label ?? x.name}=${f(out.evaluation.scope[x.name])}${x.unit && x.unit !== "-" ? x.unit : ""}`),
    ...(inst.relations ?? []).filter((r) => !def.parameters.some((p) => p.name === r.name)).map((r) => `${r.name}=${f(out.evaluation.scope[r.name])} (your relationship)`),
  ];
  const rels = (inst.relations ?? []).map((r) => `${r.name} = ${r.expr}`);
  const tables = Object.entries(out.evaluation.tables).map(([t, rows]) => `${t}: ${JSON.stringify(rows)}`);
  const issues = out.evaluation.issues.map((i) => `${i.severity.toUpperCase()}: ${i.path ? i.path + ": " : ""}${i.message}`);
  return [
    `${inst.id} "${inst.name}" — ${def.name}${inst.absoluteElevation ? " (at true levels)" : ""}.`,
    `Values: ${vals.join(", ")}.`,
    tables.length ? `Tables: ${tables.join(" ")}` : "",
    rels.length ? `Relationships: ${rels.join("; ")}.` : "",
    derived.length ? `Worked out: ${derived.join(", ")}.` : "",
    issues.length ? `Problems:\n  ${issues.join("\n  ")}` : "No problems.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function componentsSummary(ws: DraftingWorkspace): string {
  if (ws.cad.components.length === 0) return "";
  return `Components: ${ws.cad.components.map((c) => `${c.id} (${definitionFor(ws.cad, c.definitionId)?.name ?? c.definitionId})`).join("; ")}. Annotations: ${ws.cad.annotations.filter((a) => !a.componentInstanceId).length} free.`;
}

export function dispatchCadTool(ws: DraftingWorkspace, name: string, a: Args): { text: string } | null {
  switch (name) {
    case "list_components":
      return {
        text: [...(ws.cad.definitions ?? []), ...COMPONENT_LIBRARY].map((d) => `${d.id} — ${d.name} [${d.origin?.kind === "drawn" ? "made from this drawing" : d.category}, ${d.view}, ${d.parameters.length} values]: ${d.description}`).join("\n"),
      };

    case "component_info": {
      const def = definitionFor(ws.cad, str(a, "definition"));
      if (!def) throw new ToolError(`No component "${a.definition}". Call list_components.`);
      const params = def.parameters.map(
        (p) => `  ${p.name} (${p.label ?? p.name}) ${p.unit} default ${f(p.default)}${p.defaultExpr !== undefined ? " (auto: follows its formula until typed)" : ""}${p.min !== undefined || p.max !== undefined ? ` usual ${p.min ?? "…"}–${p.max ?? "…"}` : ""}${p.options ? ` options ${p.options.map((o) => `${o.value}=${o.label}`).join(", ")}` : ""} [${p.group ?? ""}]`
      );
      const derived = (def.formulas ?? []).filter((x) => x.report).map((x) => `  ${x.name}: ${x.label ?? ""} ${x.unit ?? ""}${x.cites?.length ? ` [${x.cites.join(", ")}]` : ""}`);
      const anchors = (def.anchors ?? []).map((x) => x.id);
      const tables = (def.tables ?? []).map((t) => `  ${t.name} (${t.label ?? ""}): columns ${t.columns.map((c) => `${c.name} ${c.kind}${c.unit ? " " + c.unit : ""}${c.options ? ` [${c.options.map((o) => `${o.value}=${o.label}`).join(", ")}]` : ""}`).join("; ")}; default rows ${JSON.stringify(t.rows)}`);
      return {
        text: `${def.name} (${def.id}). ${def.description}\nValues:\n${params.join("\n")}${tables.length ? `\nTables (set_table):\n${tables.join("\n")}` : ""}${derived.length ? `\nWorked out (read-only):\n${derived.join("\n")}` : ""}${anchors.length ? `\nAnchors: ${anchors.join(", ")}` : ""}`,
      };
    }

    case "insert_component": {
      const id = str(a, "definition");
      if (!definitionFor(ws.cad, id)) throw new ToolError(`No component "${id}". Call list_components.`);
      const at = xy(a, "at") ?? { x: 0, y: 0 };
      const r = ws.applyCad({ type: "CAD_INSERT_COMPONENT", definitionId: id, values: values(a), at: toCanvas(at), name: optStr(a, "name") });
      if (!r.ok) throw new ToolError(r.message);
      const inst = ws.cad.components[ws.cad.components.length - 1];
      return { text: `${r.message}\n${describeInstance(ws, inst.id)}` };
    }

    case "set_component_values": {
      const inst = str(a, "instance");
      const id = ws.cad.components.find((c) => c.id === inst || c.name === inst)?.id ?? inst;
      const msgs: string[] = [];
      const reset = Array.isArray(a.reset) ? (a.reset as string[]) : [];
      if (reset.length) {
        const r = ws.applyCad({ type: "CAD_EDIT_COMPONENT_INPUTS", instanceId: id, clear: reset });
        if (!r.ok) throw new ToolError(r.message);
        msgs.push(r.message);
      }
      const vals = values(a);
      if (Object.keys(vals).length) {
        const r = ws.applyCad({ type: "CAD_SET_COMPONENT_VALUES", instanceId: id, values: vals });
        if (!r.ok) throw new ToolError(r.message);
        msgs.push(r.message);
      }
      if (!msgs.length) throw new ToolError("Give values to set or names to reset.");
      return { text: `${msgs.join("\n")}\n${describeInstance(ws, inst)}` };
    }

    case "describe_component":
      return { text: describeInstance(ws, str(a, "instance")) };

    case "delete_component": {
      const r = ws.applyCad({ type: "CAD_DELETE_COMPONENT", instanceId: str(a, "instance") });
      if (!r.ok) throw new ToolError(r.message);
      return { text: r.message };
    }

    case "design_basis": {
      const field = str(a, "field") as keyof DbrFields;
      const meta = DBR_FIELD_META[field];
      if (!meta) throw new ToolError(`No design-basis field "${field}". Fields: ${Object.keys(DBR_FIELD_META).join(", ")}.`);
      const status = str(a, "status") as InputStatus;
      if (!["INFERRED", "ASSUMED_FOR_DRAFT", "PENDING_CONFIRMATION"].includes(status)) {
        throw new ToolError("The agent cannot confirm a design value — use INFERRED, ASSUMED_FOR_DRAFT or PENDING_CONFIRMATION. A person confirms it against the approved source.");
      }
      // Only a level can be needed to DRAW; discharge, bearing capacity, seismic zone, loading
      // and the like are design data a person supplies — an agent's guess would only hide the gap.
      if (status === "ASSUMED_FOR_DRAFT" && meta.kind !== "level") {
        throw new ToolError(`${meta.label} is design data, not something the drawing needs. Leave it missing and list it as data needed in your summary; a person enters it.`);
      }
      const raw = str(a, "value");
      const value = meta.kind === "text" ? raw : Number(raw);
      if (meta.kind !== "text" && !Number.isFinite(value as number)) throw new ToolError(`${meta.label} needs a number (${meta.unit}).`);
      const P = ws.cad.project;
      ws.applyCad({ type: "CAD_SET_PROJECT", project: { ...P, dbr: { ...P.dbr, [field]: { value, status, note: optStr(a, "note"), setBy: "agent" } } }, description: `${meta.label} (agent)` });
      return { text: `${meta.label} = ${raw}${meta.unit ? " " + meta.unit : ""}, ${status.toLowerCase().replace(/_/g, " ")}. It stays unconfirmed until a person checks it against the approved source.` };
    }

    case "project_info": {
      const P = ws.cad.project;
      const id = { ...P.identity };
      const map: [string, keyof typeof id][] = [
        ["railway", "railway"],
        ["division", "division"],
        ["project_name", "projectName"],
        ["drawing_title", "drawingTitle"],
        ["drawing_number", "drawingNumber"],
        ["bridge_number", "bridgeNumber"],
        ["chainage", "chainage"],
        ["line", "line"],
        ["river", "riverName"],
      ];
      const set: string[] = [];
      for (const [k, field] of map) {
        const v = optStr(a, k);
        if (v !== undefined) {
          id[field] = v;
          set.push(k);
        }
      }
      const next = { ...P, identity: id };
      if (optStr(a, "structure_type")) {
        next.structureType = optStr(a, "structure_type") as StructureType;
        set.push("structure_type");
      }
      if (optStr(a, "lifecycle")) {
        next.lifecycle = optStr(a, "lifecycle") as Lifecycle;
        set.push("lifecycle");
      }
      if (!set.length) throw new ToolError("Give at least one field.");
      ws.applyCad({ type: "CAD_SET_PROJECT", project: next, description: "Project info (agent)" });
      return { text: `Set ${set.join(", ")}.` };
    }

    case "record_assumption": {
      const P = ws.cad.project;
      const text = str(a, "text");
      ws.applyCad({ type: "CAD_SET_PROJECT", project: { ...P, assumptions: [...P.assumptions, { id: `as_${Date.now().toString(36)}${P.assumptions.length}`, text, scope: "drawing", createdBy: "agent", createdAt: Date.now() }] } });
      return { text: `Recorded: ${text}` };
    }

    case "annotate":
      return { text: annotate(ws, a) };

    case "layer": {
      const action = str(a, "action");
      if (action === "list") {
        return { text: ws.cad.layers.map((l) => `${l.name} [${l.category}${l.plot ? "" : ", no plot"}${l.locked ? ", locked" : ""}]${l.id === ws.cad.currentLayerId ? " ← current" : ""}`).join("\n") };
      }
      const nm = str(a, "name").toUpperCase();
      if (action === "create") {
        ws.applyCad({ type: "CAD_ADD_LAYER", layer: { name: nm, category: (optStr(a, "category") ?? "general") as LayerCategory }, makeCurrent: true });
        return { text: `Layer ${ws.cad.currentLayerId} created and made current.` };
      }
      const layer = ws.cad.layers.find((l) => l.id === nm || l.name === nm || l.category === nm.toLowerCase());
      if (!layer) throw new ToolError(`No layer "${nm}". Call layer with action list.`);
      if (action === "current") {
        ws.applyCad({ type: "CAD_SET_CURRENT_LAYER", id: layer.id });
        return { text: `Current layer ${layer.id}. New geometry goes on it.` };
      }
      const ids = Array.isArray(a.ids) ? (a.ids as string[]) : [];
      if (!ids.length) throw new ToolError(`"ids" is required to assign.`);
      ws.shapes = ws.shapes.map((s) => (ids.includes(s.id) ? { ...s, layerId: layer.id } : s));
      ws.revision++;
      return { text: `${ids.length} shape(s) now on ${layer.id}.` };
    }

    case "recognize": {
      const c = recognizeBridge(ws.shapes, ws.cad.annotations, ws.cad.settings);
      if (!c.length) return { text: "Nothing new to recognise — either nothing is drawn freely or every part is already classified." };
      return { text: c.map((x) => `${x.label} (${x.role}) ${Math.round(x.confidence * 100)}%: ${x.shapeIds.join(", ")} — ${x.evidence.join("; ")}`).join("\n") };
    }

    case "classify": {
      const raw = Array.isArray(a.ids) ? (a.ids as string[]) : [];
      if (!raw.length) throw new ToolError(`"ids" is required.`);
      const role = typeof a.role === "string" ? a.role.trim() : "";
      if (role && !termFor(role)) throw new ToolError(`Unknown role "${role}". Roles: ${BRIDGE_TERMS.map((t) => t.role).join(", ")}.`);
      const ids = ws.expandIds(raw);
      const r = ws.classify(ids, role);
      if (!r.ok) throw new ToolError(r.rejection ?? "Could not classify.");
      const term = termFor(role);
      return { text: term ? `${ids.length} shape(s) are now ${term.label}: ${term.definition}` : `Cleared the role of ${ids.length} shape(s).` };
    }

    case "audit": {
      const r = runAudit(ws.allShapes().map((s) => (s.layerId ? s : { ...s, layerId: ws.cad.currentLayerId })), ws.cad);
      return { text: auditToText(r) };
    }

    case "bridge_reference": {
      const q = str(a, "query");
      const hits = searchKnowledge(q, Math.max(1, Math.min(8, numOr(a, "limit", 4))));
      if (!hits.length) return { text: `Nothing in the bridge reference matches "${q}". Documents: ${knowledgeFiles().map((d) => d.title).join("; ")}.` };
      const cited = (id: string) =>
        [...(ws.cad.definitions ?? []), ...COMPONENT_LIBRARY]
          .filter((d) => (d.formulas ?? []).some((x) => x.cites?.includes(id)))
          .map((d) => d.id);
      return {
        text:
          hits.map((e) => formatEntry(e) + (cited(e.id).length ? `\n(Implemented in component ${cited(e.id).join(", ")}.)` : "")).join("\n\n") +
          "\n\nProject reference, not a code: limits here still require review against the clause.",
      };
    }

    case "use_skill": {
      const nm = optStr(a, "name");
      if (!nm) return { text: DRAFTING_SKILLS.map((k) => `${k.name}: ${k.title} — when ${k.when}.`).join("\n") };
      const skill = findSkill(nm);
      if (!skill) throw new ToolError(`No skill "${nm}". Skills: ${DRAFTING_SKILLS.map((k) => k.name).join(", ")}.`);
      return { text: skill.body };
    }

    case "make_parametric": {
      const rename: Record<string, string> = {};
      for (const r of (Array.isArray(a.rename) ? a.rename : []) as { key?: string; name?: string }[]) if (r?.key && r?.name) rename[r.key] = r.name;
      const drive: Record<string, boolean> = {};
      for (const k of (Array.isArray(a.results) ? a.results : []) as string[]) drive[k] = false;
      const shapeIds = Array.isArray(a.shapes) && a.shapes.length ? ws.expandIds(a.shapes as string[]) : undefined;
      const options = { name: optStr(a, "name"), rename, drive, definitionId: optStr(a, "replace") };
      const all = ws.allShapes();
      const sel = parametricSelection(all, ws.cad, shapeIds);
      if (!sel.shapes.length) throw new ToolError("Nothing drawn freely to make parametric.");
      const plan = planFor(all, ws.cad, sel, options);
      const keys = plan.edges.map((e) => `${e.key} → ${e.name} (${e.role}, ${Math.round(e.value)})`).join("; ");
      const levels = plan.levels.map((l) => `${l.key} → ${l.name}`).join("; ");
      if (a.preview === true || plan.mismatches.length) {
        return { text: `${describePlan(plan)}\nKeys for rename/results — dimensions and callouts: ${keys || "none"}; levels: ${levels || "none"}.${plan.mismatches.length ? "\nFix these before converting." : ""}` };
      }
      const r = ws.convert({ type: "CAD_MAKE_PARAMETRIC", shapeIds, options });
      if (!r.ok) throw new ToolError(r.message);
      const inst = ws.cad.components[ws.cad.components.length - 1];
      return { text: `${r.message}\n${describeInstance(ws, inst.id)}` };
    }

    case "relationship": {
      const inst = instanceOf(ws, str(a, "instance"));
      const name = str(a, "name");
      const expr = optStr(a, "expr");
      const relations = (inst.relations ?? []).filter((r) => r.name !== name);
      if (expr) relations.push({ name, expr });
      const r = ws.applyCad({ type: "CAD_EDIT_COMPONENT_INPUTS", instanceId: inst.id, relations });
      if (!r.ok) throw new ToolError(r.message);
      return { text: `${r.message}\n${describeInstance(ws, inst.id)}` };
    }

    case "add_input": {
      const inst = instanceOf(ws, str(a, "instance"));
      const name = str(a, "name");
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new ToolError("A name is letters, digits and _, starting with a letter.");
      const value = Number(a.value);
      if (!Number.isFinite(value)) throw new ToolError(`"value" must be a number.`);
      const unit = (optStr(a, "unit") ?? "mm") as ValueUnit;
      const customValues = [...(inst.customValues ?? []).filter((c) => c.name !== name), { name, value, unit }];
      const r = ws.applyCad({ type: "CAD_EDIT_COMPONENT_INPUTS", instanceId: inst.id, customValues });
      if (!r.ok) throw new ToolError(r.message);
      return { text: `${name} = ${value} ${unit} added to ${inst.name}; use it in a relationship.` };
    }

    case "set_table": {
      const inst = instanceOf(ws, str(a, "instance"));
      const table = str(a, "table");
      const def = definitionFor(ws.cad, inst.definitionId);
      if (!def?.tables?.some((t) => t.name === table)) throw new ToolError(`${inst.name} has no table "${table}". Tables: ${(def?.tables ?? []).map((t) => t.name).join(", ") || "none"}.`);
      if (!Array.isArray(a.rows)) throw new ToolError(`"rows" must be a list of objects.`);
      const rows = (a.rows as TableRow[]).map((r) => ({ ...r }));
      const r = ws.applyCad({ type: "CAD_EDIT_COMPONENT_INPUTS", instanceId: inst.id, tables: { [table]: rows } });
      if (!r.ok) throw new ToolError(r.message);
      return { text: `${r.message}\n${describeInstance(ws, inst.id)}` };
    }

    case "edit_geometry": {
      const inst = instanceOf(ws, str(a, "instance"));
      const def = definitionFor(ws.cad, inst.definitionId);
      const r = ws.convert({ type: "CAD_EXPLODE_COMPONENT", instanceId: inst.id });
      if (!r.ok) throw new ToolError(r.message);
      return { text: `${inst.name} is free geometry again (${def?.id}). Edit it, then make_parametric${def?.origin?.kind === "drawn" ? ` with replace="${def.id}" to keep its relationships` : ""}.` };
    }

    case "make_sheet": {
      const size = (optStr(a, "size") ?? "A1") as PaperSize;
      const sheet = defaultSheet(ws.allShapes(), ws.cad, size);
      ws.applyCad({ type: "CAD_SET_SHEETS", sheets: [...ws.cad.sheets, sheet] });
      return { text: `Sheet ${ws.cad.sheets.length} laid out on ${size} at 1:${sheet.viewports[0].scale} (locked), with title block and notes.` };
    }
  }
  return null;
}

function annotate(ws: DraftingWorkspace, a: Args): string {
  const kind = str(a, "kind");
  const P = (p: { x: number; y: number }) => ({ kind: "point" as const, ...toCanvas(p) });
  let ann: Omit<Annotation, "id"> | null = null;
  switch (kind) {
    case "note": {
      const P0 = ws.cad.project;
      ws.applyCad({ type: "CAD_SET_PROJECT", project: { ...P0, notes: [...P0.notes, str(a, "text")] } });
      return `Note ${ws.cad.project.notes.length} added to the sheet notes.`;
    }
    case "text":
      ann = {
        type: "text",
        at: P(need(a, "at")),
        text: str(a, "text"),
        height: numOr(a, "height", ws.cad.settings.textHeight),
        align: (optStr(a, "align") as "left" | "center" | "right" | undefined) ?? "left",
        rotation: numOr(a, "rotation", 0) || undefined,
      } as Omit<Annotation, "id">;
      break;
    case "leader": {
      const pts = Array.isArray(a.points) && a.points.length >= 2 ? (a.points as unknown[]).map((p, i) => xy({ [`p${i}`]: p }, `p${i}`)!) : [need(a, "at"), need(a, "to")];
      ann = {
        type: "leader",
        points: pts.map(P),
        text: str(a, "text"),
        height: numOr(a, "height", ws.cad.settings.textHeight),
        placement: optStr(a, "placement") === "above" ? "above" : undefined,
      } as Omit<Annotation, "id">;
      break;
    }
    case "level": {
      const style = optStr(a, "style") === "gad" ? "gad" : undefined;
      const symbol = optStr(a, "symbol") as "none" | "water" | "ground" | undefined;
      ann = { type: "level", at: P(need(a, "at")), label: (optStr(a, "label") ?? "").toUpperCase(), style, format: optStr(a, "format"), symbol } as Omit<Annotation, "id">;
      break;
    }
    case "dimension": {
      const p1 = need(a, "from");
      const p2 = need(a, "to");
      const off = Number(a.offset ?? 0);
      const extra = { prefix: optStr(a, "prefix"), hideValue: a.hide_value === true ? true : undefined };
      if (a.aligned === true) {
        ann = { type: "dimension", kind: "aligned", p1: P(p1), p2: P(p2), offset: -off, mode: "reference", ...extra } as Omit<Annotation, "id">;
      } else {
        const axis = Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y) ? "x" : "y";
        ann = { type: "dimension", kind: "linear", axis, p1: P(p1), p2: P(p2), offset: axis === "x" ? -off : off, mode: "reference", ...extra } as Omit<Annotation, "id">;
      }
      break;
    }
    case "hatch": {
      const at = toCanvas(need(a, "at"));
      const r = regionAt(ws.displayShapes(), at);
      if (!r) throw new ToolError("No closed free-drawn outline around that point. Components hatch themselves; for your own geometry close the outline first.");
      const material = (optStr(a, "material") ?? "concrete") as HatchMaterial;
      ann = { type: "hatch", material, angle: numOr(a, "angle", 0) || undefined, boundary: { kind: "shapes", shapeIds: r.shapeIds, holeShapeIds: r.holeIds.flat() } } as Omit<Annotation, "id">;
      break;
    }
    case "north":
      ann = { type: "marker", kind: "north", at: P(need(a, "at")) } as Omit<Annotation, "id">;
      break;
    case "flow":
    case "kilometrage":
    case "section":
      ann = { type: "marker", kind, at: P(need(a, "at")), to: P(need(a, "to")), label: optStr(a, "label") } as Omit<Annotation, "id">;
      break;
    default:
      throw new ToolError(`Unknown annotation kind "${kind}".`);
  }
  ws.applyCad({ type: "CAD_ADD_ANNOTATION", annotation: { id: "", ...ann } as Annotation });
  return `Added ${kind}.`;
}

/** Levels of a component-drawn point, for the agent's own reasoning. */
export function modelYOfLevel(rl: number, ws: DraftingWorkspace): number {
  return -canvasYOfLevel(rl, ws.cad.settings);
}
