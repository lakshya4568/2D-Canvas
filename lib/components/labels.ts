/**
 * The name a person reads for a value.
 *
 * A value's `label` is what its author wrote for people. Without one, its name
 * is spelled out: "ClearSpan" → "Clear span", "HFLLevel" → "HFL level",
 * "TopSlabY" → "Top slab Y".
 *
 * Drawings the agent built before 2026-09-20 stored its source note ("written:
 * 2180") as the label. On an agent-built definition, a label equal to the
 * description (parameters), or a label with no description at all (formulas),
 * is that note — the name is spelled out instead, and the note stays the hint.
 */

import type { ComponentDefinition } from "./types";

export function humanName(name: string): string {
  const words = name
    .replace(/_+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .trim()
    .split(/\s+/);
  return words
    .map((w, i) => {
      if (/^[A-Z]{2,}$/.test(w) || /^\d/.test(w) || w.length === 1) return i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w;
      const lower = w.toLowerCase();
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}

export function valueLabel(v: { name: string; label?: string; description?: string }, def?: ComponentDefinition | null): string {
  if (!v.label) return humanName(v.name);
  const agentBuilt = Boolean(def?.origin?.construction);
  if (agentBuilt && (v.description === undefined || v.label === v.description)) return humanName(v.name);
  return v.label;
}
