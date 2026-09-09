/**
 * Template Versioning & SemVer Migration Engine
 * UPCE-MASTER-1.0 §86, §35–§38, §25, Gate G7 (§76)
 *
 * Implements strict SemVer parsing, version compatibility validation,
 * and backward-compatible template and sketch migration utilities.
 */

import { TemplateDefinition, ParametricSketch } from "../schemaTypes";
import { DEFAULT_TOLERANCE_POLICY } from "../../geometry/tolerance";

export const CURRENT_SCHEMA_VERSION = "1.0" as const;
export const CURRENT_ENGINE_VERSION = "1.0.0";

export interface ParsedSemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  raw: string;
}

/**
 * Parses a semantic version string (e.g. "1.2.3" or "v1.2.3-beta").
 */
export function parseSemVer(versionStr: string): ParsedSemVer {
  const cleaned = versionStr.trim().replace(/^v/, "");
  const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
  const match = cleaned.match(semverRegex);

  if (!match) {
    // If only major.minor provided, default patch = 0
    const twoPartMatch = cleaned.match(/^(\d+)\.(\d+)$/);
    if (twoPartMatch) {
      return {
        major: parseInt(twoPartMatch[1], 10),
        minor: parseInt(twoPartMatch[2], 10),
        patch: 0,
        raw: versionStr,
      };
    }
    // Single number
    const onePartMatch = cleaned.match(/^(\d+)$/);
    if (onePartMatch) {
      return {
        major: parseInt(onePartMatch[1], 10),
        minor: 0,
        patch: 0,
        raw: versionStr,
      };
    }
    throw new Error(`[TemplateMigration] Invalid SemVer string: '${versionStr}'.`);
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
    raw: versionStr,
  };
}

/**
 * Compares two SemVer strings. Returns:
 *  -1 if v1 < v2
 *   0 if v1 == v2
 *   1 if v1 > v2
 */
export function compareSemVer(v1: string, v2: string): number {
  const p1 = parseSemVer(v1);
  const p2 = parseSemVer(v2);

  if (p1.major !== p2.major) return p1.major > p2.major ? 1 : -1;
  if (p1.minor !== p2.minor) return p1.minor > p2.minor ? 1 : -1;
  if (p1.patch !== p2.patch) return p1.patch > p2.patch ? 1 : -1;

  if (p1.prerelease && !p2.prerelease) return -1;
  if (!p1.prerelease && p2.prerelease) return 1;
  if (p1.prerelease && p2.prerelease) {
    return p1.prerelease.localeCompare(p2.prerelease);
  }

  return 0;
}

/**
 * Checks if two versions are backward-compatible (same major version, required minor <= current minor).
 */
export function areVersionsCompatible(currentVersion: string, requiredVersion: string): boolean {
  try {
    const current = parseSemVer(currentVersion);
    const required = parseSemVer(requiredVersion);

    // Breaking change if major versions differ
    if (current.major !== required.major) return false;

    // Backward-compatible if current >= required
    if (current.minor < required.minor) return false;
    if (current.minor === required.minor && current.patch < required.patch) return false;

    return true;
  } catch {
    return false;
  }
}

export interface VersionValidationResult {
  valid: boolean;
  errors: string[];
  schemaVersion: string;
  engineVersion: string;
  templateVersion?: string;
}

/**
 * Validates template schema version and engine version.
 */
/**
 * Validates template schema version and engine version.
 */
export function validateTemplateVersion(data: any): VersionValidationResult {
  const errors: string[] = [];
  const raw = typeof data === "string" ? JSON.parse(data) : data;
  const schemaVersion = raw?.schemaVersion ? String(raw.schemaVersion) : "";
  const engineVersion = raw?.engineVersion ? String(raw.engineVersion) : "";
  const templateVersion = raw?.templateVersion ? String(raw.templateVersion) : undefined;

  if (!schemaVersion) {
    errors.push("Missing required field 'schemaVersion'.");
  } else if (schemaVersion !== CURRENT_SCHEMA_VERSION && schemaVersion !== "1") {
    errors.push(`Incompatible schemaVersion '${schemaVersion}', expected '${CURRENT_SCHEMA_VERSION}'.`);
  }

  if (!engineVersion) {
    errors.push("Missing required field 'engineVersion'.");
  } else {
    try {
      parseSemVer(engineVersion);
    } catch {
      errors.push(`Invalid SemVer for engineVersion: '${engineVersion}'.`);
    }
  }

  if (templateVersion) {
    try {
      parseSemVer(templateVersion);
    } catch {
      errors.push(`Invalid SemVer for templateVersion: '${templateVersion}'.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    schemaVersion,
    engineVersion,
    templateVersion,
  };
}

/**
 * Validates sketch schema version and engine version.
 */
export function validateSketchVersion(data: any): VersionValidationResult {
  const errors: string[] = [];
  const raw = typeof data === "string" ? JSON.parse(data) : data;
  const schemaVersion = raw?.schemaVersion ? String(raw.schemaVersion) : "";
  const engineVersion = raw?.engineVersion ? String(raw.engineVersion) : "";

  if (!schemaVersion) {
    errors.push("Missing required field 'schemaVersion'.");
  } else if (schemaVersion !== CURRENT_SCHEMA_VERSION && schemaVersion !== "1") {
    errors.push(`Incompatible schemaVersion '${schemaVersion}', expected '${CURRENT_SCHEMA_VERSION}'.`);
  }

  if (engineVersion) {
    try {
      parseSemVer(engineVersion);
    } catch {
      errors.push(`Invalid SemVer for engineVersion: '${engineVersion}'.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    schemaVersion,
    engineVersion,
  };
}

export interface MigrationReport<T> {
  result: T;
  migrated: boolean;
  versionFrom: string;
  versionTo: string;
  changes: string[];
}

/**
 * Migrates older template structures to the canonical TemplateDefinition schema.
 */
export function migrateTemplate(rawInput: any): MigrationReport<TemplateDefinition> {
  const changes: string[] = [];
  let migrated = false;

  const raw = typeof rawInput === "string" ? JSON.parse(rawInput) : JSON.parse(JSON.stringify(rawInput));
  const versionFrom = String(raw.schemaVersion || "0.9");

  // 1. Normalize schemaVersion
  if (raw.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    changes.push(`Updated schemaVersion from '${raw.schemaVersion ?? "undefined"}' to '${CURRENT_SCHEMA_VERSION}'.`);
    raw.schemaVersion = CURRENT_SCHEMA_VERSION;
    migrated = true;
  }

  // 2. Normalize engineVersion
  if (!raw.engineVersion) {
    changes.push(`Initialized engineVersion to '${CURRENT_ENGINE_VERSION}'.`);
    raw.engineVersion = CURRENT_ENGINE_VERSION;
    migrated = true;
  } else {
    try {
      parseSemVer(raw.engineVersion);
    } catch {
      changes.push(`Fixed invalid engineVersion '${raw.engineVersion}' to '${CURRENT_ENGINE_VERSION}'.`);
      raw.engineVersion = CURRENT_ENGINE_VERSION;
      migrated = true;
    }
  }

  // Top-level identifiers
  if (!raw.id) {
    raw.id = `template_${Date.now()}`;
    changes.push("Generated missing template id.");
    migrated = true;
  }
  if (!raw.name) {
    raw.name = String(raw.id);
    changes.push("Defaulted missing template name.");
    migrated = true;
  }
  if (!raw.category || !["component", "bridge", "detail", "assembly"].includes(raw.category)) {
    raw.category = "component";
    changes.push("Normalized template category to 'component'.");
    migrated = true;
  }

  // 3. Ensure arrays exist
  if (!Array.isArray(raw.parameters)) {
    raw.parameters = [];
    changes.push("Initialized missing parameters array.");
    migrated = true;
  }
  if (!Array.isArray(raw.expressions)) {
    raw.expressions = [];
    changes.push("Initialized missing expressions array.");
    migrated = true;
  }
  if (!raw.geometry || typeof raw.geometry !== "object") {
    raw.geometry = { points: [], lines: [], arcs: [], circles: [], polylines: [] };
    changes.push("Initialized missing geometry container.");
    migrated = true;
  } else {
    if (!Array.isArray(raw.geometry.points)) raw.geometry.points = [];
    if (!Array.isArray(raw.geometry.lines)) raw.geometry.lines = [];
    if (!Array.isArray(raw.geometry.arcs)) raw.geometry.arcs = [];
    if (!Array.isArray(raw.geometry.circles)) raw.geometry.circles = [];
    if (!Array.isArray(raw.geometry.polylines)) raw.geometry.polylines = [];
  }

  // Constraints must be an Array per schemas/template.schema.json
  if (Array.isArray(raw.constraints)) {
    // Already array; ensure required fields on items
    for (let i = 0; i < raw.constraints.length; i++) {
      const c = raw.constraints[i];
      if (!c.id) c.id = `c_${i}`;
      if (!c.kind) c.kind = (c.type || "distance").toLowerCase();
      if (!Array.isArray(c.refs)) c.refs = c.entities || [];
      if (!c.strength) c.strength = "driving";
      if (c.driving === undefined) c.driving = true;
      if (!c.state) c.state = "active";
      if (!c.provenance) c.provenance = "UserConstraint";
    }
  } else if (raw.constraints && typeof raw.constraints === "object") {
    const list: any[] = [];
    if (Array.isArray(raw.constraints.geometric)) {
      list.push(...raw.constraints.geometric);
    }
    if (Array.isArray(raw.constraints.dimensional)) {
      list.push(...raw.constraints.dimensional);
    }
    if (list.length === 0) {
      for (const [k, v] of Object.entries(raw.constraints)) {
        if (v && typeof v === "object") {
          list.push({ id: k, ...v });
        }
      }
    }
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c.id) c.id = `c_${i}`;
      if (!c.kind) c.kind = (c.type || "distance").toLowerCase();
      if (!Array.isArray(c.refs)) c.refs = c.entities || [];
      if (!c.strength) c.strength = "driving";
      if (c.driving === undefined) c.driving = true;
      if (!c.state) c.state = "active";
      if (!c.provenance) c.provenance = "UserConstraint";
    }
    raw.constraints = list;
    changes.push("Converted constraints object to canonical array format.");
    migrated = true;
  } else {
    raw.constraints = [];
    changes.push("Initialized missing constraints array.");
    migrated = true;
  }

  if (!Array.isArray(raw.ports)) {
    raw.ports = [];
    changes.push("Initialized missing ports array.");
    migrated = true;
  }

  // Semantics must be an Array per schemas/template.schema.json
  if (Array.isArray(raw.semantics)) {
    for (let i = 0; i < raw.semantics.length; i++) {
      const s = raw.semantics[i];
      if (!s.id) s.id = `sem_${i}`;
      if (!s.type) s.type = "structural_component";
      if (!Array.isArray(s.faces)) s.faces = [];
      if (!Array.isArray(s.edges)) s.edges = [];
      if (!Array.isArray(s.children)) s.children = [];
      if (!Array.isArray(s.params)) s.params = [];
      if (!s.confirmedBy) s.confirmedBy = "author";
    }
  } else if (raw.semantics && typeof raw.semantics === "object" && Array.isArray(raw.semantics.blocks)) {
    raw.semantics = raw.semantics.blocks;
    changes.push("Extracted semantics blocks array.");
    migrated = true;
  } else {
    raw.semantics = [];
    changes.push("Initialized missing semantics array.");
    migrated = true;
  }

  // Validation must be an Array per schemas/template.schema.json
  if (Array.isArray(raw.validation)) {
    for (let i = 0; i < raw.validation.length; i++) {
      const v = raw.validation[i];
      if (!v.ruleId) v.ruleId = `val_${i}`;
      if (!v.type) v.type = "BOUNDS";
      if (!v.severity) v.severity = "ERROR";
      if (!v.expression) v.expression = "true";
      if (!v.message) v.message = "Validation check";
    }
  } else if (raw.validation && typeof raw.validation === "object" && Array.isArray(raw.validation.rules)) {
    raw.validation = raw.validation.rules;
    changes.push("Extracted validation rules array.");
    migrated = true;
  } else {
    raw.validation = [];
    changes.push("Initialized missing validation array.");
    migrated = true;
  }

  // Provenance must be an Array per schemas/template.schema.json
  if (Array.isArray(raw.provenance)) {
    if (raw.provenance.length === 0) {
      raw.provenance.push({
        timestamp: new Date().toISOString(),
        action: "template_created",
        author: "MigrationUtility",
      });
    }
  } else if (raw.provenance && typeof raw.provenance === "object") {
    raw.provenance = [
      {
        timestamp: raw.provenance.createdAt || raw.provenance.timestamp || new Date().toISOString(),
        action: raw.provenance.action || "template_migrated",
        author: raw.provenance.author || "MigrationUtility",
        details: raw.provenance.details || {},
      },
    ];
    changes.push("Converted provenance object to canonical events array.");
    migrated = true;
  } else {
    raw.provenance = [
      {
        timestamp: new Date().toISOString(),
        action: "template_migrated",
        author: "MigrationUtility",
      },
    ];
    changes.push("Initialized missing provenance metadata array.");
    migrated = true;
  }

  // 4. Normalize parameters
  for (let i = 0; i < raw.parameters.length; i++) {
    const p = raw.parameters[i];
    if (!p.id) p.id = `p_${i}`;
    if (!p.name) p.name = p.id;
    if (!p.role) {
      p.role = "DRIVING";
      changes.push(`Parameter '${p.id}' default role set to DRIVING.`);
      migrated = true;
    }
    if (!p.type) {
      p.type = "LENGTH";
      changes.push(`Parameter '${p.id}' default type set to LENGTH.`);
      migrated = true;
    }
    if (!p.unit) {
      p.unit = p.type === "ANGLE" ? "deg" : "mm";
      changes.push(`Parameter '${p.id}' default unit set to ${p.unit}.`);
      migrated = true;
    }
    if (p.value === undefined || p.value === null) {
      p.value = 0;
      changes.push(`Parameter '${p.id}' value initialized to 0.`);
      migrated = true;
    }
    if (!p.provenance) {
      p.provenance = "Inference";
      changes.push(`Parameter '${p.id}' default provenance set to Inference.`);
      migrated = true;
    }
  }

  return {
    result: raw as TemplateDefinition,
    migrated,
    versionFrom,
    versionTo: CURRENT_SCHEMA_VERSION,
    changes,
  };
}

/**
 * Migrates older sketch structures to the canonical ParametricSketch schema.
 */
export function migrateSketch(rawInput: any): MigrationReport<ParametricSketch> {
  const changes: string[] = [];
  let migrated = false;

  const raw = typeof rawInput === "string" ? JSON.parse(rawInput) : JSON.parse(JSON.stringify(rawInput));
  const versionFrom = String(raw.schemaVersion || "0.9");

  // 1. Normalize schemaVersion
  if (raw.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    changes.push(`Updated sketch schemaVersion to '${CURRENT_SCHEMA_VERSION}'.`);
    raw.schemaVersion = CURRENT_SCHEMA_VERSION;
    migrated = true;
  }

  // 2. Engine version
  if (!raw.engineVersion) {
    raw.engineVersion = CURRENT_ENGINE_VERSION;
    changes.push(`Initialized sketch engineVersion to '${CURRENT_ENGINE_VERSION}'.`);
    migrated = true;
  }

  if (!raw.sketchId) {
    raw.sketchId = raw.id || `sketch_${Date.now()}`;
    changes.push("Defaulted sketchId.");
    migrated = true;
  }

  // 3. Units
  if (!raw.units || typeof raw.units !== "object") {
    raw.units = { length: "mm", angle: "deg" };
    changes.push("Initialized default units (mm, deg).");
    migrated = true;
  }

  // 4. Tolerances
  if (!raw.tolerances || typeof raw.tolerances !== "object") {
    raw.tolerances = {
      units: "mm",
      weld_mm: DEFAULT_TOLERANCE_POLICY.weld_mm,
      geometry_mm: DEFAULT_TOLERANCE_POLICY.geometry_mm,
      cluster_mm: DEFAULT_TOLERANCE_POLICY.cluster_mm,
      angle_rad: DEFAULT_TOLERANCE_POLICY.angle_rad,
      solver_residual: DEFAULT_TOLERANCE_POLICY.solver_residual,
      singular_value_eps: DEFAULT_TOLERANCE_POLICY.singular_value_eps,
      independence_eps: DEFAULT_TOLERANCE_POLICY.independence_eps,
    };
    changes.push("Initialized default TolerancePolicy.");
    migrated = true;
  }

  // 5. Parameters map
  if (!raw.parameters || typeof raw.parameters !== "object" || Array.isArray(raw.parameters)) {
    const origParams = Array.isArray(raw.parameters) ? raw.parameters : [];
    raw.parameters = {};
    for (let i = 0; i < origParams.length; i++) {
      const p = origParams[i];
      const pId = p.id || `p_${i}`;
      raw.parameters[pId] = {
        id: pId,
        name: p.name || pId,
        role: p.role || "DRIVING",
        type: p.type || "LENGTH",
        value: p.value ?? 0,
        unit: p.unit || "mm",
        provenance: p.provenance || "Inference",
        ...p,
      };
    }
    changes.push("Converted parameters to keyed object structure.");
    migrated = true;
  } else {
    for (const [k, p] of Object.entries(raw.parameters) as [string, any][]) {
      if (!p.id) p.id = k;
      if (!p.name) p.name = k;
      if (!p.role) p.role = "DRIVING";
      if (!p.type) p.type = "LENGTH";
      if (p.value === undefined) p.value = 0;
      if (!p.unit) p.unit = "mm";
      if (!p.provenance) p.provenance = "Inference";
    }
  }

  // 6. Formulas
  if (!Array.isArray(raw.formulas)) {
    raw.formulas = [];
    changes.push("Initialized missing formulas array.");
    migrated = true;
  }

  // 7. Primitives
  if (!raw.primitives || typeof raw.primitives !== "object") {
    raw.primitives = { points: {}, lines: {}, arcs: {}, circles: {}, polylines: {} };
    changes.push("Initialized primitives structure.");
    migrated = true;
  } else {
    // Points
    if (Array.isArray(raw.primitives.points)) {
      const ptsMap: Record<string, any> = {};
      for (let i = 0; i < raw.primitives.points.length; i++) {
        const pt = raw.primitives.points[i];
        const ptId = pt.id || `pt_${i}`;
        ptsMap[ptId] = { id: ptId, x: pt.x ?? 0, y: pt.y ?? 0, isConstruction: false, fixed: false, ...pt };
      }
      raw.primitives.points = ptsMap;
      changes.push("Converted primitives.points array to keyed object.");
      migrated = true;
    } else if (!raw.primitives.points || typeof raw.primitives.points !== "object") {
      raw.primitives.points = {};
    }

    // Lines
    if (Array.isArray(raw.primitives.lines)) {
      const linesMap: Record<string, any> = {};
      for (let i = 0; i < raw.primitives.lines.length; i++) {
        const l = raw.primitives.lines[i];
        const lId = l.id || `l_${i}`;
        linesMap[lId] = { id: lId, startPointId: l.startPointId || l.p1, endPointId: l.endPointId || l.p2, isConstruction: false, ...l };
      }
      raw.primitives.lines = linesMap;
      changes.push("Converted primitives.lines array to keyed object.");
      migrated = true;
    } else if (!raw.primitives.lines || typeof raw.primitives.lines !== "object") {
      raw.primitives.lines = {};
    }

    // Arcs
    if (Array.isArray(raw.primitives.arcs)) {
      const arcsMap: Record<string, any> = {};
      for (let i = 0; i < raw.primitives.arcs.length; i++) {
        const a = raw.primitives.arcs[i];
        const aId = a.id || `a_${i}`;
        arcsMap[aId] = { id: aId, centerPointId: a.centerPointId || a.center, radius: a.radius ?? 0, startAngle: a.startAngle ?? 0, endAngle: a.endAngle ?? 0, ...a };
      }
      raw.primitives.arcs = arcsMap;
      changes.push("Converted primitives.arcs array to keyed object.");
      migrated = true;
    } else if (!raw.primitives.arcs || typeof raw.primitives.arcs !== "object") {
      raw.primitives.arcs = {};
    }

    // Circles
    if (Array.isArray(raw.primitives.circles)) {
      const circlesMap: Record<string, any> = {};
      for (let i = 0; i < raw.primitives.circles.length; i++) {
        const c = raw.primitives.circles[i];
        const cId = c.id || `c_${i}`;
        circlesMap[cId] = { id: cId, centerPointId: c.centerPointId || c.center, radius: c.radius ?? 0, ...c };
      }
      raw.primitives.circles = circlesMap;
      changes.push("Converted primitives.circles array to keyed object.");
      migrated = true;
    } else if (!raw.primitives.circles || typeof raw.primitives.circles !== "object") {
      raw.primitives.circles = {};
    }

    if (!raw.primitives.polylines || typeof raw.primitives.polylines !== "object" || Array.isArray(raw.primitives.polylines)) {
      raw.primitives.polylines = {};
    }
  }

  // 8. Topology
  if (!raw.topology || typeof raw.topology !== "object") {
    raw.topology = { halfEdges: {}, faces: {} };
    changes.push("Initialized topology structure.");
    migrated = true;
  } else {
    if (Array.isArray(raw.topology.halfEdges)) {
      const heMap: Record<string, any> = {};
      for (let i = 0; i < raw.topology.halfEdges.length; i++) {
        const he = raw.topology.halfEdges[i];
        const heId = he.id || `h_${i}`;
        heMap[heId] = { id: heId, ...he };
      }
      raw.topology.halfEdges = heMap;
      changes.push("Converted topology.halfEdges array to keyed object.");
      migrated = true;
    } else if (!raw.topology.halfEdges || typeof raw.topology.halfEdges !== "object") {
      raw.topology.halfEdges = {};
    }

    if (Array.isArray(raw.topology.faces)) {
      const fMap: Record<string, any> = {};
      for (let i = 0; i < raw.topology.faces.length; i++) {
        const f = raw.topology.faces[i];
        const fId = f.id || `f_${i}`;
        fMap[fId] = { id: fId, innerHoles: [], semanticCategory: "UNCLASSIFIED", ...f };
      }
      raw.topology.faces = fMap;
      changes.push("Converted topology.faces array to keyed object.");
      migrated = true;
    } else if (!raw.topology.faces || typeof raw.topology.faces !== "object") {
      raw.topology.faces = {};
    }
  }

  // 9. Constraints (convert array to dictionary while preserving all constraints)
  if (Array.isArray(raw.constraints)) {
    const cmap: Record<string, any> = {};
    for (let i = 0; i < raw.constraints.length; i++) {
      const c = raw.constraints[i];
      const cId = c.id || `c_${i}`;
      cmap[cId] = {
        id: cId,
        type: c.type || (c.kind ? c.kind.toUpperCase() : "DISTANCE_POINT_TO_POINT"),
        entities: c.entities || c.refs || [],
        strength: c.strength || "driving",
        driving: c.driving ?? true,
        state: c.state || "active",
        provenance: c.provenance || "UserConstraint",
        ...c,
      };
    }
    raw.constraints = cmap;
    changes.push("Converted constraints array to keyed object structure.");
    migrated = true;
  } else if (!raw.constraints || typeof raw.constraints !== "object") {
    raw.constraints = {};
    changes.push("Initialized constraints map.");
    migrated = true;
  }

  return {
    result: raw as ParametricSketch,
    migrated,
    versionFrom,
    versionTo: CURRENT_SCHEMA_VERSION,
    changes,
  };
}
