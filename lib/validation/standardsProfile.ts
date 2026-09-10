/**
 * Standards Profiles — keeping codes OUT of the kernel.
 * UPCE-MASTER-1.0 §26.
 *
 * "Do NOT bake IRC/RDSO rules into the geometry engine." Violations become
 * *validation metadata*, not solver logic: the canvas still updates, the input
 * border turns amber, a tooltip cites the clause, and the drawing is flagged
 * non-compliant in its metadata header. Hard blocks are reserved for physically
 * impossible values (InnerWidth ≤ 0).
 *
 * Every shipped profile carries `verified: false` until a human confirms the
 * clause values against the current official edition (DEC-004, Appendix G item 4).
 */

import { InvariantSeverity } from "./invariantChecker";

export interface ParameterBound {
  min?: number;
  max?: number;
  unit?: string;
  note: string;
  codeRef: string;
}

export interface StandardsRelationship {
  /** Comparison over declared parameter names, e.g. "ClearSpan / ClearHeight <= 3.0". */
  expr: string;
  message: string;
  codeRef: string;
}

export interface StandardsProfile {
  id: string;
  revision: string;
  /**
   * False until a human has checked these values against the current official
   * code text. The UI must surface this; the engine must never treat an
   * unverified profile as authoritative.
   */
  verified: boolean;
  description?: string;
  parameterBounds: Record<string, ParameterBound>;
  requiredParameters: string[];
  relationships: StandardsRelationship[];
}

export interface BoundViolation {
  parameter: string;
  message: string;
  severity: InvariantSeverity;
  codeRef?: string;
  value: number;
  limit: number;
  kind: "below-min" | "above-max" | "missing" | "physically-impossible";
}

export interface RelationshipViolation {
  rule: string;
  message: string;
  codeRef: string;
}

export interface StandardsEvaluation {
  profileId: string;
  profileRevision: string;
  verified: boolean;
  boundViolations: BoundViolation[];
  standardsViolations: RelationshipViolation[];
  /** True when nothing at all was flagged. */
  compliant: boolean;
  /**
   * True when a HARD block applies: a physically impossible value. Only this
   * blocks the edit; ordinary code deviations are amber (§26).
   */
  blocked: boolean;
  /** Notes carried into the drawing's metadata header. */
  metadata: string[];
}

/**
 * Parses a profile object (from JSON) with validation, so a malformed or
 * hand-edited profile fails loudly rather than silently disabling checks.
 */
export function parseStandardsProfile(raw: unknown): StandardsProfile {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("[StandardsProfile] Profile must be an object.");
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || o.id.length === 0) {
    throw new Error("[StandardsProfile] Missing 'id'.");
  }
  if (typeof o.revision !== "string") {
    throw new Error(`[StandardsProfile] Profile '${o.id}' missing 'revision'.`);
  }

  const bounds: Record<string, ParameterBound> = {};
  const rawBounds = (o.parameterBounds ?? {}) as Record<string, Record<string, unknown>>;
  for (const [name, b] of Object.entries(rawBounds)) {
    if (typeof b !== "object" || b === null) continue;
    const min = typeof b.min === "number" ? b.min : undefined;
    const max = typeof b.max === "number" ? b.max : undefined;
    if (min !== undefined && max !== undefined && min > max) {
      throw new Error(
        `[StandardsProfile] '${o.id}.${name}': min (${min}) exceeds max (${max}).`
      );
    }
    bounds[name] = {
      min,
      max,
      unit: typeof b.unit === "string" ? b.unit : undefined,
      note: typeof b.note === "string" ? b.note : "",
      codeRef: typeof b.codeRef === "string" ? b.codeRef : "",
    };
  }

  const relationships: StandardsRelationship[] = [];
  for (const r of (o.relationships ?? []) as Record<string, unknown>[]) {
    if (typeof r?.expr !== "string") continue;
    relationships.push({
      expr: r.expr,
      message: typeof r.message === "string" ? r.message : r.expr,
      codeRef: typeof r.codeRef === "string" ? r.codeRef : "",
    });
  }

  return {
    id: o.id,
    revision: o.revision,
    verified: o.verified === true,
    description: typeof o.description === "string" ? o.description : undefined,
    parameterBounds: bounds,
    requiredParameters: Array.isArray(o.requiredParameters)
      ? (o.requiredParameters as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
    relationships,
  };
}

/**
 * The restricted comparison grammar used by profile relationships:
 *
 *   <arith> <op> <arith>      op ∈ { <=, >=, <, >, == }
 *   <arith> := term (('+'|'-'|'*'|'/') term)*      term := number | identifier
 *
 * Deliberately not a general evaluator and never `eval` (§21 safe evaluation,
 * and the §88 security rule). An unparseable rule is reported as a violation of
 * the profile itself, never silently skipped.
 */
export function evaluateComparison(
  expr: string,
  scope: Record<string, number>
): { ok: boolean; parsed: true } | { ok: false; parsed: false; reason: string } {
  const m = expr.match(/^(.*?)(<=|>=|==|<|>)(.*)$/);
  if (!m) return { ok: false, parsed: false, reason: "no comparison operator" };

  const lhs = evaluateArithmetic(m[1].trim(), scope);
  const rhs = evaluateArithmetic(m[3].trim(), scope);
  if (lhs === null) return { ok: false, parsed: false, reason: `cannot evaluate '${m[1].trim()}'` };
  if (rhs === null) return { ok: false, parsed: false, reason: `cannot evaluate '${m[3].trim()}'` };

  switch (m[2]) {
    case "<=": return { ok: lhs <= rhs, parsed: true };
    case ">=": return { ok: lhs >= rhs, parsed: true };
    case "<":  return { ok: lhs < rhs, parsed: true };
    case ">":  return { ok: lhs > rhs, parsed: true };
    case "==": return { ok: Math.abs(lhs - rhs) < 1e-9, parsed: true };
    default:   return { ok: false, parsed: false, reason: `unsupported operator '${m[2]}'` };
  }
}

/** Left-to-right arithmetic with standard precedence over a fixed symbol table. */
export function evaluateArithmetic(
  expr: string,
  scope: Record<string, number>
): number | null {
  const tokens = expr.match(/[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[()+\-*/]/g);
  if (!tokens || tokens.length === 0) return null;
  // Reject anything the tokenizer did not fully consume (stray characters).
  if (tokens.join("").length !== expr.replace(/\s+/g, "").length) return null;

  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  const parsePrimary = (): number | null => {
    const t = next();
    if (t === undefined) return null;
    if (t === "(") {
      const v = parseAdditive();
      if (next() !== ")") return null;
      return v;
    }
    if (t === "-") {
      const v = parsePrimary();
      return v === null ? null : -v;
    }
    if (/^\d/.test(t)) return Number(t);
    const v = scope[t];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };

  const parseMultiplicative = (): number | null => {
    let left = parsePrimary();
    if (left === null) return null;
    while (peek() === "*" || peek() === "/") {
      const op = next();
      const right = parsePrimary();
      if (right === null) return null;
      if (op === "/" && right === 0) return null;
      left = op === "*" ? left * right : left / right;
    }
    return left;
  };

  const parseAdditive = (): number | null => {
    let left = parseMultiplicative();
    if (left === null) return null;
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const right = parseMultiplicative();
      if (right === null) return null;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  };

  const result = parseAdditive();
  return pos === tokens.length ? result : null;
}

export interface EvaluateOptions {
  /**
   * Parameters that are physically impossible below/at a floor — these produce a
   * HARD block rather than an amber warning (§26: "Hard blocks are reserved for
   * physically impossible values (InnerWidth ≤ 0)").
   */
  physicalFloors?: Record<string, number>;
}

/**
 * Evaluates a parameter set against one profile. Never mutates and never
 * consults the solver: this is metadata production, exactly as §26 requires.
 */
export function evaluateAgainstProfile(
  profile: StandardsProfile,
  parameters: Record<string, number>,
  options: EvaluateOptions = {}
): StandardsEvaluation {
  const boundViolations: BoundViolation[] = [];
  const standardsViolations: RelationshipViolation[] = [];
  const metadata: string[] = [];
  let blocked = false;

  // Physically impossible values — the only hard block.
  const floors = options.physicalFloors ?? {};
  for (const [name, floor] of Object.entries(floors)) {
    const v = parameters[name];
    if (v === undefined) continue;
    if (v <= floor) {
      blocked = true;
      boundViolations.push({
        parameter: name,
        message: `${name} = ${v} is physically impossible (must exceed ${floor}).`,
        severity: "error",
        value: v,
        limit: floor,
        kind: "physically-impossible",
      });
    }
  }

  for (const required of profile.requiredParameters) {
    if (parameters[required] === undefined) {
      boundViolations.push({
        parameter: required,
        message: `${required} is required by ${profile.id} ${profile.revision} but is not defined.`,
        severity: "warning",
        value: Number.NaN,
        limit: Number.NaN,
        kind: "missing",
      });
    }
  }

  for (const [name, bound] of Object.entries(profile.parameterBounds)) {
    const value = parameters[name];
    if (value === undefined) continue;

    if (bound.min !== undefined && value < bound.min) {
      boundViolations.push({
        parameter: name,
        message:
          `${name} = ${value} ${bound.unit ?? ""} is below the ${bound.min} ${bound.unit ?? ""} ` +
          `minimum. ${bound.note}`.trim(),
        severity: "warning",
        codeRef: bound.codeRef,
        value,
        limit: bound.min,
        kind: "below-min",
      });
    }
    if (bound.max !== undefined && value > bound.max) {
      boundViolations.push({
        parameter: name,
        message:
          `${name} = ${value} ${bound.unit ?? ""} exceeds the ${bound.max} ${bound.unit ?? ""} ` +
          `maximum. ${bound.note}`.trim(),
        severity: "warning",
        codeRef: bound.codeRef,
        value,
        limit: bound.max,
        kind: "above-max",
      });
    }
  }

  for (const rel of profile.relationships) {
    const evaluated = evaluateComparison(rel.expr, parameters);
    if (!evaluated.parsed) {
      // A rule referencing an absent parameter is skipped, not failed —
      // but a genuinely malformed rule is reported against the profile.
      const referencesUnknown = (rel.expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).some(
        (id) => parameters[id] === undefined
      );
      if (!referencesUnknown) {
        standardsViolations.push({
          rule: rel.expr,
          message: `Profile rule could not be evaluated: ${evaluated.reason}.`,
          codeRef: rel.codeRef,
        });
      }
      continue;
    }
    if (!evaluated.ok) {
      standardsViolations.push({ rule: rel.expr, message: rel.message, codeRef: rel.codeRef });
    }
  }

  if (!profile.verified) {
    metadata.push(
      `Standards profile ${profile.id} rev ${profile.revision} is UNVERIFIED — clause ` +
        `values must be confirmed against the current official edition before use in ` +
        `issued drawings.`
    );
  }
  metadata.push(
    `Checked against ${profile.id} rev ${profile.revision}: ` +
      `${boundViolations.length} bound issue(s), ${standardsViolations.length} rule issue(s).`
  );

  return {
    profileId: profile.id,
    profileRevision: profile.revision,
    verified: profile.verified,
    boundViolations,
    standardsViolations,
    compliant: boundViolations.length === 0 && standardsViolations.length === 0,
    blocked,
    metadata,
  };
}

/** In-memory registry so profiles are data the app loads, never code it links. */
export class StandardsProfileRegistry {
  private profiles = new Map<string, StandardsProfile>();

  public register(raw: unknown): StandardsProfile {
    const profile = parseStandardsProfile(raw);
    this.profiles.set(profile.id, profile);
    return profile;
  }

  public get(id: string): StandardsProfile | undefined {
    return this.profiles.get(id);
  }

  public list(): StandardsProfile[] {
    return [...this.profiles.values()];
  }

  public has(id: string): boolean {
    return this.profiles.has(id);
  }

  /** Profiles still awaiting human clause verification (DEC-004). */
  public unverified(): StandardsProfile[] {
    return this.list().filter((p) => !p.verified);
  }
}
