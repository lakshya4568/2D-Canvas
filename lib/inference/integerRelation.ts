/**
 * Integer-Relation Discovery for multi-cell scalar systems.
 * UPCE-MASTER-1.0 §49.2.
 *
 *   "For multi-cell systems, run an integer-relation search over the vector of
 *    detected scalars [V₁ … V_m], seeking small-integer dependencies:
 *        Σᵢ aᵢ Vᵢ = 0 ,   aᵢ ∈ {−4 … +4}
 *    Methods, in increasing cost: bounded-coefficient least-squares subset search
 *    → PSLQ integer-relation detection (Ferguson & Bailey) → LLL lattice reduction
 *    for larger scalar sets."
 *
 * Deterministic throughout. No learned component anywhere in this file.
 */

export interface ScalarObservation {
  /** Stable parameter/candidate ID. */
  id: string;
  /** Human-facing name used when rendering the relation. */
  name: string;
  value: number;
  /** Dimensional class — relations must be dimensionally consistent (§49.4). */
  unit?: "mm" | "m" | "deg" | "rad" | "count" | "ratio";
}

export interface IntegerRelation {
  /** Coefficients aligned with the input `scalars` array. */
  coefficients: number[];
  /** Only the non-zero terms, for display and ranking. */
  terms: { id: string; name: string; coefficient: number; value: number }[];
  /** |Σ aᵢ Vᵢ| at the observed values. */
  residual: number;
  /** Σ |aᵢ| — the Occam complexity measure (§49.3: fewest terms, smallest integers). */
  complexity: number;
  /** Which method produced it. */
  method: "bounded-search" | "pslq" | "lll";
}

export interface IntegerRelationOptions {
  /** Coefficient bound; the spec fixes this at 4. */
  maxCoefficient?: number;
  /** Maximum number of non-zero terms in a relation. */
  maxTerms?: number;
  /** Absolute tolerance on |Σ aᵢ Vᵢ| in model units. */
  tolerance?: number;
  /** Cap on returned relations, ranked best-first. */
  maxResults?: number;
  /**
   * Above this many scalars, exhaustive bounded search is abandoned in favour of
   * PSLQ / LLL. Default 12.
   */
  exhaustiveLimit?: number;
}

const DEFAULTS: Required<IntegerRelationOptions> = {
  maxCoefficient: 4,
  maxTerms: 4,
  tolerance: 0.5,
  maxResults: 8,
  exhaustiveLimit: 12,
};

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

/** Reduces a coefficient vector by its GCD and normalises the leading sign. */
export function normalizeCoefficients(coeffs: number[]): number[] {
  const nz = coeffs.filter((c) => c !== 0);
  if (nz.length === 0) return coeffs.slice();
  let g = 0;
  for (const c of nz) g = gcd(g, c);
  const scaled = coeffs.map((c) => c / (g || 1));
  const first = scaled.find((c) => c !== 0)!;
  return first < 0 ? scaled.map((c) => -c) : scaled;
}

function relationKey(coeffs: number[]): string {
  return normalizeCoefficients(coeffs).join(",");
}

function buildRelation(
  coeffs: number[],
  scalars: ScalarObservation[],
  method: IntegerRelation["method"]
): IntegerRelation {
  const normalized = normalizeCoefficients(coeffs);
  let residual = 0;
  const terms: IntegerRelation["terms"] = [];
  let complexity = 0;

  for (let i = 0; i < normalized.length; i++) {
    const a = normalized[i];
    residual += a * scalars[i].value;
    if (a !== 0) {
      terms.push({
        id: scalars[i].id,
        name: scalars[i].name,
        coefficient: a,
        value: scalars[i].value,
      });
      complexity += Math.abs(a);
    }
  }

  return {
    coefficients: normalized,
    terms,
    residual: Math.abs(residual),
    complexity: complexity + terms.length, // fewer terms AND smaller integers (§49.3)
    method,
  };
}

/**
 * Dimensional consistency (§49.4 gate 2): every term in a relation must share a
 * dimensional class. Lengths combine with lengths; counts with counts.
 */
export function isDimensionallyConsistent(
  coeffs: number[],
  scalars: ScalarObservation[]
): boolean {
  const units = new Set<string>();
  for (let i = 0; i < coeffs.length; i++) {
    if (coeffs[i] !== 0) units.add(scalars[i].unit ?? "mm");
  }
  if (units.size <= 1) return true;
  // mm and m are the same dimensional class; everything else must match exactly.
  const lengthOnly = [...units].every((u) => u === "mm" || u === "m");
  return lengthOnly;
}

/**
 * Exhaustive bounded-coefficient search — the cheapest of the three methods, and
 * exact for the scalar-set sizes a civil GAD actually produces.
 */
export function boundedCoefficientSearch(
  scalars: ScalarObservation[],
  options: IntegerRelationOptions = {}
): IntegerRelation[] {
  const opts = { ...DEFAULTS, ...options };
  const n = scalars.length;
  if (n < 2) return [];

  const found = new Map<string, IntegerRelation>();
  const coeffs = new Array<number>(n).fill(0);

  const range: number[] = [];
  for (let c = -opts.maxCoefficient; c <= opts.maxCoefficient; c++) range.push(c);

  const recurse = (index: number, usedTerms: number, partial: number) => {
    if (found.size >= opts.maxResults * 8) return;

    if (index === n) {
      if (usedTerms < 2) return;
      if (Math.abs(partial) > opts.tolerance) return;
      if (!isDimensionallyConsistent(coeffs, scalars)) return;
      const rel = buildRelation(coeffs, scalars, "bounded-search");
      const key = relationKey(coeffs);
      const prior = found.get(key);
      if (!prior || rel.complexity < prior.complexity) found.set(key, rel);
      return;
    }

    // Prune: even zeroing every remaining term, can |partial| still reach zero?
    let reachable = 0;
    for (let j = index; j < n; j++) {
      reachable += opts.maxCoefficient * Math.abs(scalars[j].value);
    }
    if (Math.abs(partial) - reachable > opts.tolerance) return;

    for (const c of range) {
      if (c !== 0 && usedTerms >= opts.maxTerms) continue;
      coeffs[index] = c;
      recurse(index + 1, usedTerms + (c !== 0 ? 1 : 0), partial + c * scalars[index].value);
    }
    coeffs[index] = 0;
  };

  recurse(0, 0, 0);

  return [...found.values()]
    .sort((a, b) => a.complexity - b.complexity || a.residual - b.residual)
    .slice(0, opts.maxResults);
}

/**
 * PSLQ integer-relation detection (Ferguson & Bailey), partial-sum-of-squares
 * variant. Finds a small integer vector a with a·x ≈ 0 for a real vector x.
 *
 * Used when the scalar set is too large for exhaustive search. The returned
 * relation is verified against the same tolerance and coefficient bound as the
 * bounded search, so PSLQ never widens what the pipeline will accept.
 */
export function pslq(
  x: number[],
  options: { tolerance?: number; maxIterations?: number; gamma?: number } = {}
): number[] | null {
  const n = x.length;
  if (n < 2) return null;

  const tol = options.tolerance ?? 1e-10;
  const maxIter = options.maxIterations ?? 1000;
  const gamma = options.gamma ?? 2 / Math.sqrt(3);

  const norm = Math.hypot(...x);
  if (norm === 0) return null;
  const xs = x.map((v) => v / norm);

  // Partial sums of squares
  const s = new Array<number>(n).fill(0);
  for (let k = n - 1; k >= 0; k--) s[k] = (k === n - 1 ? 0 : s[k + 1]) + xs[k] * xs[k];
  for (let k = 0; k < n; k++) s[k] = Math.sqrt(s[k]);
  if (s[0] === 0) return null;

  // H: n x (n-1) lower trapezoidal
  const H: number[][] = Array.from({ length: n }, () => new Array<number>(n - 1).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - 1; j++) {
      if (i < j) H[i][j] = 0;
      else if (i === j) H[i][j] = s[i + 1] / s[i];
      else H[i][j] = (-xs[i] * xs[j]) / (s[j] * s[j + 1]);
    }
  }

  // A = B = identity (integer relation bookkeeping)
  const A: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );
  const B: number[][] = A.map((r) => r.slice());
  const y = xs.slice();

  const nint = (v: number) => Math.round(v);

  // Hermite reduction
  const reduce = () => {
    for (let i = 1; i < n; i++) {
      for (let j = Math.min(i - 1, n - 2); j >= 0; j--) {
        if (H[j][j] === 0) continue;
        const t = nint(H[i][j] / H[j][j]);
        if (t === 0) continue;
        y[j] += t * y[i];
        for (let k = 0; k <= j; k++) H[i][k] -= t * H[j][k];
        for (let k = 0; k < n; k++) {
          A[i][k] -= t * A[j][k];
          B[k][j] += t * B[k][i];
        }
      }
    }
  };

  reduce();

  for (let iter = 0; iter < maxIter; iter++) {
    // Select m maximising γ^i |H_ii|
    let m = 0;
    let best = -1;
    for (let i = 0; i < n - 1; i++) {
      const v = Math.pow(gamma, i + 1) * Math.abs(H[i][i]);
      if (v > best) {
        best = v;
        m = i;
      }
    }

    // Swap rows m, m+1
    [y[m], y[m + 1]] = [y[m + 1], y[m]];
    [H[m], H[m + 1]] = [H[m + 1], H[m]];
    [A[m], A[m + 1]] = [A[m + 1], A[m]];
    for (let k = 0; k < n; k++) [B[k][m], B[k][m + 1]] = [B[k][m + 1], B[k][m]];

    // Restore triangularity
    if (m < n - 2) {
      const t0 = Math.hypot(H[m][m], H[m][m + 1]);
      if (t0 > 0) {
        const t1 = H[m][m] / t0;
        const t2 = H[m][m + 1] / t0;
        for (let i = m; i < n; i++) {
          const t3 = H[i][m];
          const t4 = H[i][m + 1];
          H[i][m] = t1 * t3 + t2 * t4;
          H[i][m + 1] = -t2 * t3 + t1 * t4;
        }
      }
    }

    reduce();

    // Detection: a y component has collapsed to zero.
    // The invariant maintained throughout is y = x·B, so a vanishing y_j means
    // COLUMN j of B is the integer relation — not row j of A, which tracks the
    // inverse transform.
    for (let j = 0; j < n; j++) {
      if (Math.abs(y[j]) < tol) {
        const rel: number[] = [];
        for (let k = 0; k < n; k++) rel.push(B[k][j]);
        if (rel.some((c) => c !== 0)) return normalizeCoefficients(rel);
      }
    }

    // Numerical exhaustion
    let maxH = 0;
    for (let i = 0; i < n - 1; i++) maxH = Math.max(maxH, Math.abs(H[i][i]));
    if (maxH < tol) return null;
  }

  return null;
}

/**
 * LLL lattice reduction over the integer lattice spanned by
 *   b_i = (e_i , round(N · x_i))
 * A reduced basis vector whose last coordinate is ~0 encodes an integer relation.
 * Used as the final fallback for larger scalar sets (§49.2).
 */
export function lllIntegerRelation(
  x: number[],
  options: { scale?: number; delta?: number; tolerance?: number } = {}
): number[] | null {
  const n = x.length;
  if (n < 2) return null;

  const norm = Math.max(...x.map((v) => Math.abs(v)));
  if (norm === 0) return null;

  const scale = options.scale ?? 1e6 / norm;
  const delta = options.delta ?? 0.75;
  const tol = options.tolerance ?? 1e-6;

  // Basis: n vectors of dimension n+1
  const b: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(n + 1).fill(0);
    row[i] = 1;
    row[n] = Math.round(scale * x[i]);
    b.push(row);
  }

  const dotp = (u: number[], v: number[]) => u.reduce((s, ui, i) => s + ui * v[i], 0);

  const gramSchmidt = () => {
    const bs: number[][] = [];
    const mu: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let i = 0; i < n; i++) {
      bs[i] = b[i].slice();
      for (let j = 0; j < i; j++) {
        const denom = dotp(bs[j], bs[j]);
        mu[i][j] = denom === 0 ? 0 : dotp(b[i], bs[j]) / denom;
        for (let k = 0; k <= n; k++) bs[i][k] -= mu[i][j] * bs[j][k];
      }
    }
    return { bs, mu };
  };

  let { bs, mu } = gramSchmidt();
  let k = 1;
  let guard = 0;
  const guardLimit = 1000 * n * n;

  while (k < n && guard++ < guardLimit) {
    for (let j = k - 1; j >= 0; j--) {
      if (Math.abs(mu[k][j]) > 0.5) {
        const q = Math.round(mu[k][j]);
        for (let i = 0; i <= n; i++) b[k][i] -= q * b[j][i];
        ({ bs, mu } = gramSchmidt());
      }
    }

    const nk = dotp(bs[k], bs[k]);
    const nk1 = dotp(bs[k - 1], bs[k - 1]);
    if (nk >= (delta - mu[k][k - 1] * mu[k][k - 1]) * nk1) {
      k += 1;
    } else {
      [b[k], b[k - 1]] = [b[k - 1], b[k]];
      ({ bs, mu } = gramSchmidt());
      k = Math.max(k - 1, 1);
    }
  }

  // Pick the shortest basis vector whose relation residual is ~0
  let bestRel: number[] | null = null;
  let bestNorm = Number.POSITIVE_INFINITY;
  for (const row of b) {
    const coeffs = row.slice(0, n);
    if (coeffs.every((c) => c === 0)) continue;
    const residual = coeffs.reduce((s, c, i) => s + c * x[i], 0);
    if (Math.abs(residual) > tol * Math.max(1, norm)) continue;
    const l2 = Math.hypot(...coeffs);
    if (l2 < bestNorm) {
      bestNorm = l2;
      bestRel = normalizeCoefficients(coeffs);
    }
  }

  return bestRel;
}

/**
 * §49.2 escalation ladder: bounded-coefficient least-squares subset search →
 * PSLQ → LLL. Cheapest method first; later methods run only if the earlier one
 * found nothing, and their output is re-validated against the same coefficient
 * bound, tolerance, and dimensional-consistency gate.
 */
export function discoverIntegerRelations(
  scalars: ScalarObservation[],
  options: IntegerRelationOptions = {}
): IntegerRelation[] {
  const opts = { ...DEFAULTS, ...options };
  if (scalars.length < 2) return [];

  if (scalars.length <= opts.exhaustiveLimit) {
    const exhaustive = boundedCoefficientSearch(scalars, opts);
    if (exhaustive.length > 0) return exhaustive;
  }

  const values = scalars.map((s) => s.value);
  const results: IntegerRelation[] = [];
  const seen = new Set<string>();

  const accept = (coeffs: number[] | null, method: IntegerRelation["method"]) => {
    if (!coeffs) return;
    if (coeffs.some((c) => Math.abs(c) > opts.maxCoefficient)) return;
    if (coeffs.filter((c) => c !== 0).length > opts.maxTerms) return;
    if (!isDimensionallyConsistent(coeffs, scalars)) return;
    const rel = buildRelation(coeffs, scalars, method);
    if (rel.residual > opts.tolerance) return;
    const key = relationKey(coeffs);
    if (seen.has(key)) return;
    seen.add(key);
    results.push(rel);
  };

  accept(pslq(values, { tolerance: 1e-9 }), "pslq");
  if (results.length === 0) {
    accept(lllIntegerRelation(values), "lll");
  }

  return results
    .sort((a, b) => a.complexity - b.complexity || a.residual - b.residual)
    .slice(0, opts.maxResults);
}

/**
 * Renders a relation as a human-readable equation, solving for the term with the
 * largest magnitude (which is almost always the total/envelope dimension).
 *
 *   [1·TotalWidth, −2·ClearSpan, −3·WallThickness]  →
 *   "TotalWidth = 2*ClearSpan + 3*WallThickness"
 */
export function relationToExpression(relation: IntegerRelation): {
  target: string;
  targetId: string;
  expression: string;
} | null {
  if (relation.terms.length < 2) return null;

  let target = relation.terms[0];
  for (const t of relation.terms) {
    if (Math.abs(t.value) > Math.abs(target.value)) target = t;
  }
  if (Math.abs(target.coefficient) !== 1) {
    // Keep expressions integral: only solve for a unit-coefficient term.
    const unit = relation.terms.find((t) => Math.abs(t.coefficient) === 1);
    if (!unit) return null;
    target = unit;
  }

  const sign = target.coefficient;
  const parts: string[] = [];
  for (const t of relation.terms) {
    if (t.id === target.id) continue;
    const c = -t.coefficient / sign;
    if (c === 0) continue;
    const mag = Math.abs(c);
    const body = mag === 1 ? t.name : `${mag}*${t.name}`;
    parts.push(`${c < 0 ? "-" : "+"} ${body}`);
  }
  if (parts.length === 0) return null;

  let expression = parts.join(" ");
  if (expression.startsWith("+ ")) expression = expression.slice(2);
  else if (expression.startsWith("- ")) expression = `-${expression.slice(2)}`;

  return { target: target.name, targetId: target.id, expression };
}
