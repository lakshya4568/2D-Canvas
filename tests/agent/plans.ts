/**
 * Test helper: a workspace whose agent has already planned the SKETCH route,
 * for tests of the sketch tools themselves (the plan gate is tested in
 * drafter_construction.test.ts).
 */

import type { ConstructionState } from "@/lib/agent/drafter/construction";

export const SKETCH_PLAN_ARGS = {
  route: "sketch",
  analysis: "A single profile to be held by rules: outline, openings, and the named sizes that drive it.",
  values: [],
  features: [{ name: "Profile", description: "the outline" }],
};

export function sketchPlanned(): ConstructionState {
  return {
    plan: {
      route: "sketch",
      analysis: SKETCH_PLAN_ARGS.analysis,
      frame: "",
      values: [],
      checks: [],
      features: [{ name: "Profile", description: "the outline" }],
      expect: { dimensions: [], levels: [], texts: [], disputed: [] },
    },
    definitionId: null,
    instanceId: null,
    tags: {},
    verified: null,
  };
}
