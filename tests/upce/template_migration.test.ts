/**
 * The template audit, as a test.
 *
 * §17 of the repair brief: shipped templates are to be audited, not trusted, and
 * a template based on a procedural shortcut must be migrated rather than hidden
 * behind a nicer UI.
 *
 * These assertions are what stop the audit in PARAMETRIC_AUTHORING.md from
 * quietly going stale. They also encode the thing that makes the catalogue
 * evidence rather than decoration: a shipped template goes through EXACTLY the
 * workflow a draftsman uses on their own geometry, with no branch anywhere that
 * knows a culvert from a flange.
 */

import { describe, it, expect } from "vitest";
import { BUILTIN_TEMPLATES } from "../../lib/parametric/templates";
import { begin, acceptAllDetected, answerEverything, dof } from "./fixtures";
import { findProfiles } from "../../lib/upce/profile";
import { drawingReducer, initialDrawingState } from "../../lib/state/drawingReducer";

function geometryOf(id: string) {
  const template = BUILTIN_TEMPLATES.find((t) => t.id === id);
  if (!template) throw new Error(`no template ${id}`);
  const params: Record<string, number> = {};
  template.parameters.forEach((p) => (params[p.name] = p.defaultValue));
  return { template, instance: template.generator(params) };
}

describe("Every shipped template is a procedural drawing, not a parametric model", () => {
  it("declares no constraints at all", () => {
    for (const template of BUILTIN_TEMPLATES) {
      const params: Record<string, number> = {};
      template.parameters.forEach((p) => (params[p.name] = p.defaultValue));
      const instance = template.generator(params);
      // Recorded so the claim in the audit cannot rot: these are coordinate
      // generators. Whatever parametric behaviour they show comes from the
      // authoring workflow, not from anything they carry.
      expect(instance.constraints.length).toBe(0);
    }
  });

  it("inserts as geometry only, with no second parameter store behind it", () => {
    const state = drawingReducer(initialDrawingState, {
      type: "INSTANTIATE_TEMPLATE",
      templateId: "single_cell_box_culvert",
    });
    expect(state.shapes.length).toBeGreaterThan(0);
    // The drafting reducer holds geometry. The parametric model lives in
    // lib/upce and is the only one.
    expect("variables" in state).toBe(false);
    expect("constraints" in state).toBe(false);
  });
});

describe("The generic workflow makes the civil templates parametric", () => {
  it(
    "takes the two-span multi-cell culvert to fully defined",
    { timeout: 120_000 },
    () => {
      const { instance } = geometryOf("two_span_box_culvert");
      let s = begin(instance.shapes);

      // The two haunched cells are recognised as profiles, not as sixteen lines.
      const profiles = findProfiles(s.sketch, s.names);
      const cells = profiles.filter((p) => p.shapeIds.length === 8 && p.closed);
      expect(cells).toHaveLength(2);

      s = acceptAllDetected(s);
      s = answerEverything(s, 40);

      expect(dof(s)).toBe(0);
      const parameters = Object.values(s.sketch.parameters);
      expect(parameters.length).toBeGreaterThan(5);
      // And every one of them can say where it came from.
      for (const p of parameters) {
        expect(p.provenance.detail.length).toBeGreaterThan(10);
      }
    }
  );

  it(
    "treats bridge centrelines as construction, not as structure",
    { timeout: 120_000 },
    () => {
      const { instance } = geometryOf("rdso_box_bridge");
      const centrelines = instance.shapes.filter((sh) => sh.isReference);
      expect(centrelines.length).toBeGreaterThan(0);

      const s = begin(instance.shapes);
      const profiles = findProfiles(s.sketch, s.names);
      const centrelineIds = new Set(centrelines.map((c) => c.id));
      // A centreline is drawn and can be constrained to, but it is never part of
      // a profile and never a source of proposals: without this the detector
      // offers relationships between annotation and concrete.
      for (const profile of profiles) {
        for (const shapeId of profile.shapeIds) {
          expect(centrelineIds.has(shapeId)).toBe(false);
        }
      }
    }
  );

  it(
    "gets the RDSO multi-cell box a long way, and stops honestly",
    { timeout: 120_000 },
    () => {
      const { instance } = geometryOf("rdso_box_bridge");
      let s = begin(instance.shapes);
      const before = dof(s);
      s = acceptAllDetected(s);
      s = answerEverything(s, 40);
      const after = dof(s);

      expect(before).toBeGreaterThan(50);
      expect(after).toBeLessThan(before / 2);
      expect(Object.keys(s.sketch.parameters).length).toBeGreaterThan(10);

      // It does NOT reach zero, and the audit says so rather than pretending.
      // The drawing is a set of disconnected profiles; how they relate is a
      // design decision nobody has made yet.
      expect(after).toBeGreaterThan(0);
    }
  );
});
