"use client";

/**
 * What the drafting agent has drawn so far, while it is still drawing.
 *
 * Kept OUT of the drafting reducer on purpose. Writing each intermediate step
 * into the real drawing would put forty entries on the undo stack and — worse —
 * wake the authoring session's geometry sync, which would try to reconcile a
 * half-built drawing against rules the agent has not finished writing. The
 * canvas reads this store and draws it as an overlay; the real drawing is
 * replaced once, at the end, through the same adoption path as any other
 * solved result.
 */

import { useSyncExternalStore } from "react";
import type { Shape } from "@/lib/geometry/types";

export interface AgentPreview {
  shapes: Shape[];
  /** The shape the pen touched last, for the pen-tip marker. */
  lastIds: string[];
  running: boolean;
}

let current: AgentPreview | null = null;
const listeners = new Set<() => void>();

export function setAgentPreview(next: AgentPreview | null): void {
  current = next;
  for (const l of listeners) l();
}

export function getAgentPreview(): AgentPreview | null {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAgentPreview(): AgentPreview | null {
  return useSyncExternalStore(subscribe, getAgentPreview, () => null);
}
