/**
 * Gate G5 Acceptance Verification Suite (UPCE-MASTER-1.0 §76, §86, §5.6, §43, §44)
 *
 * Non-negotiable Gate G5 Criteria:
 * 1. Canonical Template Catalog & Conformance:
 *    All 10 canonical templates conform 100% to schemas/template.schema.json,
 *    are registered in TemplateRegistry, and pass 5-fold validation.
 * 2. SE(2) Affine Port Composition & Oblique Port Mating:
 *    Mating child instances at 0°, 15°, 37°, 45°, 90° resolves exact world transforms:
 *    M_target = M_parent * M_portParent * T(along, normal) * R(rot + mate)
 *    M_child = M_target * M_portChild^-1 via invertRigid() with zero metric shear.
 * 3. Generality Proof:
 *    Railing/post repeat fixture and multi-cell culvert repeat fixture exercise
 *    identical port/repeat code paths without any domain-specific branching.
 * 4. Procedural Repeat Rules as Topological Mutation:
 *    Mutating repeat count (4 -> 8 -> 3 posts, or 2 -> 3 -> 5 culvert bays) mutates topology
 *    cleanly, adds/prunes child instances, wires ports, and solves within tolerance.
 * 5. 5-Fold Diagnostic Validation:
 *    Detects unbound ports, cyclic attachments, circular expressions (Tarjan SCC),
 *    over-driven parameters, out-of-range bounds, and dangling references.
 */

import { describe, it, expect } from "vitest";
import { AffineMatrix3x3 } from "../../lib/geometry/lcs";
import { Point2D } from "../../lib/geometry/topology/types";
import { TemplateDefinition } from "../../lib/parametric/schemaTypes";
import {
  CANONICAL_TEMPLATES,
  SINGLE_CELL_BOX_CULVERT_TEMPLATE,
  TWO_CELL_BOX_CULVERT_TEMPLATE,
  MULTI_CELL_BOX_CULVERT_TEMPLATE,
  RAILING_POST_TEMPLATE,
  RAILING_RUN_TEMPLATE,
  RCC_BRIDGE_TEMPLATE,
  PARAMETRIC_FRAME_CUTOUT_TEMPLATE,
  SQUARE_TUBE_PROFILE_TEMPLATE,
  CHAMFERED_OCTAGONAL_POLYGON_TEMPLATE,
  RDSO_BOX_BRIDGE_TEMPLATE,
} from "../../lib/parametric/templates/canonicalTemplates";
import {
  TemplateRegistry,
  templateRegistry,
} from "../../lib/parametric/templates/templateRegistry";
import {
  TemplateValidator,
  validateTemplate,
} from "../../lib/parametric/templates/templateValidator";
import {
  PortMatingSolver,
  PortEvaluation,
} from "../../lib/parametric/component/portMatingSolver";
import {
  RepeatExpander,
} from "../../lib/parametric/component/repeatExpander";
import {
  CompositeAssemblyEngine,
} from "../../lib/parametric/component/compositeAssemblyEngine";
import { BUILTIN_TEMPLATES } from "../../lib/parametric/templates";

describe("Gate G5 Acceptance Criterion (UPCE-MASTER-1.0 §76, §86, §5.6, §43, §44)", () => {
  describe("Criterion 1: Canonical Template Catalog & Conformance to Schema", () => {
    it("should register all 10 canonical templates in TemplateRegistry", () => {
      expect(CANONICAL_TEMPLATES.length).toBe(10);
      const expectedIds = [
        "single_cell_box_culvert",
        "two_cell_box_culvert",
        "multi_cell_box_culvert",
        "railing_post",
        "railing_run",
        "rcc_bridge",
        "parametric_frame_cutout",
        "square_tube_profile",
        "chamfered_octagonal_polygon",
        "rdso_box_bridge",
      ];

      for (const id of expectedIds) {
        const tmpl = templateRegistry.getTemplate(id);
        expect(tmpl).toBeDefined();
        expect(tmpl?.id).toBe(id);
        expect(tmpl?.schemaVersion).toBe("1.0");
        expect(tmpl?.engineVersion).toBe("1.0.0");
        expect(tmpl?.parameters.length).toBeGreaterThan(0);
      }
    });

    it("should pass 5-fold validation for all 10 canonical templates", () => {
      for (const tmpl of CANONICAL_TEMPLATES) {
        const validation = validateTemplate(tmpl, templateRegistry);
        expect(
          validation.errors,
          `Template ${tmpl.id} failed validation with errors: ${JSON.stringify(validation.errors)}`
        ).toEqual([]);
        expect(validation.valid).toBe(true);
      }
    });

    it("should maintain 100% backward compatibility for BUILTIN_TEMPLATES in templates.ts", () => {
      expect(BUILTIN_TEMPLATES.length).toBeGreaterThanOrEqual(8);
      const culvert = BUILTIN_TEMPLATES.find((t) => t.id === "single_cell_box_culvert");
      expect(culvert).toBeDefined();
      expect(typeof culvert?.generator).toBe("function");

      const generated = culvert!.generator({ clear_span: 300, clear_height: 200, wall_thickness: 30 });
      expect(generated.shapes.length).toBeGreaterThan(0);
      expect(generated.variables.clear_span.value).toBe(300);
    });
  });

  describe("Criterion 2: SE(2) Affine Port Composition & Oblique Port Mating", () => {
    it("should mate ports exactly at 0°, 15°, 37°, 45°, 90° with zero metric shear or distortion", () => {
      const parentMatrix = AffineMatrix3x3.translation(500, 300);

      const parentPort: PortEvaluation = {
        id: "port_out",
        kind: "edge",
        origin: { x: 100, y: 50 },
        angleDeg: 0,
        angleRad: 0,
        localMatrix: AffineMatrix3x3.translation(100, 50),
      };

      const childPort: PortEvaluation = {
        id: "port_in",
        kind: "edge",
        origin: { x: 0, y: 0 },
        angleDeg: 0,
        angleRad: 0,
        localMatrix: AffineMatrix3x3.identity(),
      };

      const testAnglesDeg = [0, 15, 37, 45, 90];

      for (const angle of testAnglesDeg) {
        const mating = PortMatingSolver.resolvePortMating(
          parentMatrix,
          parentPort,
          childPort,
          { along: 20, normal: 10, rotate: angle, mate: 180 }
        );

        // Verify M_child * M_portChild == M_target
        const childPortWorld = mating.childWorldMatrix.multiply(childPort.localMatrix);
        for (let idx = 0; idx < 9; idx++) {
          expect(childPortWorld.m[idx]).toBeCloseTo(mating.targetWorldMatrix.m[idx], 6);
        }

        // Verify rigid-body isometry: distance between local points is preserved in world
        const pA_local: Point2D = { x: 0, y: 0 };
        const pB_local: Point2D = { x: 50, y: 80 };
        const d_local = Math.hypot(pB_local.x - pA_local.x, pB_local.y - pA_local.y);

        const pA_world = mating.childWorldMatrix.transformPoint(pA_local);
        const pB_world = mating.childWorldMatrix.transformPoint(pB_local);
        const d_world = Math.hypot(pB_world.x - pA_world.x, pB_world.y - pA_world.y);

        expect(d_world).toBeCloseTo(d_local, 8);
      }
    });

    it("should resolve non-zero local child port offsets rigidly via invertRigid()", () => {
      const parentMatrix = AffineMatrix3x3.identity();
      const parentPort: PortEvaluation = {
        id: "p_out",
        kind: "point",
        origin: { x: 200, y: 150 },
        angleDeg: 45,
        angleRad: (45 * Math.PI) / 180,
        localMatrix: AffineMatrix3x3.translation(200, 150).multiply(
          AffineMatrix3x3.rotation((45 * Math.PI) / 180)
        ),
      };

      const childPort: PortEvaluation = {
        id: "c_in",
        kind: "point",
        origin: { x: 40, y: 25 },
        angleDeg: 30,
        angleRad: (30 * Math.PI) / 180,
        localMatrix: AffineMatrix3x3.translation(40, 25).multiply(
          AffineMatrix3x3.rotation((30 * Math.PI) / 180)
        ),
      };

      const mating = PortMatingSolver.resolvePortMating(
        parentMatrix,
        parentPort,
        childPort,
        { along: 0, normal: 0, rotate: 0, mate: 180 }
      );

      // Child port origin transformed by child world matrix must equal target origin
      const childPortWorldPos = mating.childWorldMatrix.transformPoint(childPort.origin);
      const targetWorldPos: Point2D = {
        x: mating.targetWorldMatrix.m[2],
        y: mating.targetWorldMatrix.m[5],
      };

      expect(childPortWorldPos.x).toBeCloseTo(targetWorldPos.x, 6);
      expect(childPortWorldPos.y).toBeCloseTo(targetWorldPos.y, 6);
    });
  });

  describe("Criterion 3: Generality Proof — Railing/Post & Multi-Cell Culvert on Identical Code Paths", () => {
    it("should assemble railing run and multi-cell culvert through the same CompositeAssemblyEngine without branching", () => {
      // Assemble Railing Run
      const railingResult = CompositeAssemblyEngine.assemble("railing_run", {
        parameterOverrides: {
          run_length: 2400,
          post_count: 4,
          post_height: 900,
          post_width: 60,
        },
      });

      expect(railingResult.shapes.length).toBeGreaterThan(0);
      expect(railingResult.instances.size).toBe(4);
      expect(railingResult.parameters.post_spacing).toBeCloseTo(800, 3); // 2400 / 3

      // Assemble Multi-Cell Culvert
      const culvertResult = CompositeAssemblyEngine.assemble("multi_cell_box_culvert", {
        parameterOverrides: {
          cell_count: 3,
          cell_span: 300,
          clear_height: 200,
          wall_thickness: 30,
          haunch_leg: 35,
        },
      });

      expect(culvertResult.shapes.length).toBeGreaterThan(0);
      expect(culvertResult.instances.size).toBe(3);
      expect(culvertResult.parameters.cell_spacing).toBe(330); // 300 + 30
    });
  });

  describe("Criterion 4: Procedural Repeat Rules as Topological Mutation", () => {
    it("should cleanly mutate railing post topology (4 -> 8 -> 2 posts) and re-wire ports", () => {
      const lengths = 2100;

      // Step 1: 4 posts
      const res4 = CompositeAssemblyEngine.assemble("railing_run", {
        parameterOverrides: { run_length: lengths, post_count: 4 },
      });
      expect(res4.instances.size).toBe(4);
      expect(res4.parameters.post_spacing).toBeCloseTo(700, 3); // 2100 / 3
      const post3_res4 = res4.instances.get("post_repeat_3");
      expect(post3_res4?.origin.x).toBeCloseTo(2100, 3);

      // Step 2: 8 posts (topological expansion)
      const res8 = CompositeAssemblyEngine.assemble("railing_run", {
        parameterOverrides: { run_length: lengths, post_count: 8 },
      });
      expect(res8.instances.size).toBe(8);
      expect(res8.parameters.post_spacing).toBeCloseTo(300, 3); // 2100 / 7
      const post7_res8 = res8.instances.get("post_repeat_7");
      expect(post7_res8?.origin.x).toBeCloseTo(2100, 3);

      // Step 3: 2 posts (topological contraction)
      const res2 = CompositeAssemblyEngine.assemble("railing_run", {
        parameterOverrides: { run_length: lengths, post_count: 2 },
      });
      expect(res2.instances.size).toBe(2);
      expect(res2.parameters.post_spacing).toBeCloseTo(2100, 3); // 2100 / 1
      expect(res2.instances.has("post_repeat_2")).toBe(false);
    });

    it("should mutate multi-cell culvert topology (2 -> 3 -> 5 bays) retaining wall thicknesses and port alignment", () => {
      const counts = [2, 3, 5];

      for (const count of counts) {
        const res = CompositeAssemblyEngine.assemble("multi_cell_box_culvert", {
          parameterOverrides: {
            cell_count: count,
            cell_span: 250,
            clear_height: 200,
            wall_thickness: 30,
            haunch_leg: 35,
          },
        });

        expect(res.instances.size).toBe(count);

        // Verify each cell is stepped precisely by cell_spacing (280)
        for (let i = 0; i < count; i++) {
          const inst = res.instances.get(`cell_repeat_${i}`);
          expect(inst).toBeDefined();
          expect(inst?.origin.x).toBeCloseTo(i * 280, 4);
          expect(inst?.origin.y).toBeCloseTo(0, 4);
        }

        // Verify outlet port is at the end of the last cell
        const outletPort = res.resolvedPorts.get("multi_cell_box_culvert:port_outlet");
        expect(outletPort).toBeDefined();
        // total width = count * 280 + 30
        const expectedTotalW = count * 280 + 30;
        expect(outletPort?.origin.x).toBeCloseTo(expectedTotalW, 4);
      }
    });

    it("should support polar_array, mirror, and path_array repeat modes", () => {
      // 1. Polar Array
      const polarRule: NonNullable<TemplateDefinition["repeats"]>[number] = {
        id: "bolt_circle",
        type: "polar_array",
        sourceComponent: "railing_post",
        countParamRef: "bolt_count",
        spacingExpr: "360 / bolt_count",
        spacingMode: "driven",
        direction: [300, 300], // Center (300, 300)
        anchorPortId: "base_port",
        indexVariable: "i",
      };

      const polarExpanded = RepeatExpander.expandRepeatRule(polarRule, { bolt_count: 6 });
      expect(polarExpanded.length).toBe(6);
      expect(polarExpanded[0].placement?.angleDeg).toBe(0);
      expect(polarExpanded[1].placement?.angleDeg).toBe(60);
      expect(polarExpanded[5].placement?.angleDeg).toBe(300);

      // 2. Mirror
      const mirrorRule: NonNullable<TemplateDefinition["repeats"]>[number] = {
        id: "wing_mirror",
        type: "mirror",
        sourceComponent: "railing_post",
        countParamRef: "dummy",
        spacingExpr: "0",
        spacingMode: "driven",
        direction: [1, 0],
        anchorPortId: "base_port",
        indexVariable: "i",
      };
      const mirrorExpanded = RepeatExpander.expandRepeatRule(mirrorRule, {});
      expect(mirrorExpanded.length).toBe(2);
      expect(mirrorExpanded[0].placement?.angleDeg).toBe(0);
      expect(mirrorExpanded[1].placement?.angleDeg).toBe(180);

      // 3. Path Array
      const pathRule: NonNullable<TemplateDefinition["repeats"]>[number] = {
        id: "arch_posts",
        type: "path_array",
        sourceComponent: "railing_post",
        countParamRef: "post_count",
        spacingExpr: "200",
        spacingMode: "driven",
        direction: [1, 0],
        anchorPortId: "base_port",
        indexVariable: "i",
      };
      const pathPts: Point2D[] = [
        { x: 0, y: 0 },
        { x: 300, y: 400 },
        { x: 600, y: 400 },
      ];
      const pathExpanded = RepeatExpander.expandRepeatRule(pathRule, { post_count: 4 }, pathPts);
      expect(pathExpanded.length).toBe(4);
      expect(pathExpanded[0].placement?.origin.x).toBe(0);
      expect(pathExpanded[0].placement?.origin.y).toBe(0);
    });
  });

  describe("Criterion 5: 5-Fold Diagnostic Validation", () => {
    it("Diagnostic 1: should detect unbound ports and cyclic port attachments", () => {
      // 1. Unbound child port
      const unboundChildTemplate: TemplateDefinition = {
        ...RAILING_RUN_TEMPLATE,
        id: "unbound_child_tmpl",
        components: [
          {
            instanceId: "post_0",
            templateId: "railing_post",
            parameterOverrides: {},
            attachedVia: {
              parentInstanceId: "root",
              parentPortId: "run_start",
              ownPortId: "non_existent_port", // ERROR
            },
          },
        ],
      };
      const valUnbound = validateTemplate(unboundChildTemplate, templateRegistry);
      expect(valUnbound.valid).toBe(false);
      expect(valUnbound.errors.some((e) => e.code === "UNBOUND_OWN_PORT")).toBe(true);

      // 2. Cyclic port attachments: A -> B -> A
      const cyclicTemplate: TemplateDefinition = {
        ...RAILING_RUN_TEMPLATE,
        id: "cyclic_port_tmpl",
        components: [
          {
            instanceId: "node_A",
            templateId: "railing_post",
            parameterOverrides: {},
            attachedVia: {
              parentInstanceId: "node_B",
              parentPortId: "base_port",
              ownPortId: "base_port",
            },
          },
          {
            instanceId: "node_B",
            templateId: "railing_post",
            parameterOverrides: {},
            attachedVia: {
              parentInstanceId: "node_A",
              parentPortId: "base_port",
              ownPortId: "base_port",
            },
          },
        ],
      };
      const valCyclic = validateTemplate(cyclicTemplate, templateRegistry);
      expect(valCyclic.valid).toBe(false);
      expect(valCyclic.errors.some((e) => e.code === "CYCLIC_PORT_ATTACHMENT")).toBe(true);
    });

    it("Diagnostic 2: should detect circular expression dependency cycles via Tarjan SCC", () => {
      const cycleExprTemplate: TemplateDefinition = {
        ...SINGLE_CELL_BOX_CULVERT_TEMPLATE,
        id: "cyclic_expr_tmpl",
        expressions: [
          {
            targetParameterId: "param_A",
            expression: "param_B + 10",
            dependencies: ["param_B"],
          },
          {
            targetParameterId: "param_B",
            expression: "param_A * 2",
            dependencies: ["param_A"],
          },
        ],
      };

      const val = validateTemplate(cycleExprTemplate);
      expect(val.valid).toBe(false);
      expect(val.errors.some((e) => e.code === "CIRCULAR_EXPRESSION_CYCLE")).toBe(true);
    });

    it("Diagnostic 3: should detect duplicate driving parameters and over-driven parameters", () => {
      // Over-driven: declared DRIVING but targeted by expression
      const overdrivenTemplate: TemplateDefinition = {
        ...SINGLE_CELL_BOX_CULVERT_TEMPLATE,
        id: "overdriven_tmpl",
        expressions: [
          ...SINGLE_CELL_BOX_CULVERT_TEMPLATE.expressions,
          {
            targetParameterId: "clear_span", // clear_span is DRIVING!
            expression: "clear_height * 1.5",
            dependencies: ["clear_height"],
          },
        ],
      };

      const val = validateTemplate(overdrivenTemplate);
      expect(val.valid).toBe(false);
      expect(val.errors.some((e) => e.code === "OVERDRIVEN_PARAMETER")).toBe(true);
    });

    it("Diagnostic 4: should detect parameter range limit violations (min <= defaultValue <= max)", () => {
      const outOfRangeTemplate: TemplateDefinition = {
        ...SINGLE_CELL_BOX_CULVERT_TEMPLATE,
        id: "out_of_range_tmpl",
        parameters: [
          ...SINGLE_CELL_BOX_CULVERT_TEMPLATE.parameters.filter((p) => p.id !== "clear_span"),
          {
            id: "clear_span",
            name: "clear_span",
            role: "DRIVING",
            type: "LENGTH",
            value: 1200, // max is 1000!
            unit: "mm",
            min: 100,
            max: 1000,
            provenance: "UserConstraint",
          },
        ],
      };

      const val = validateTemplate(outOfRangeTemplate);
      expect(val.valid).toBe(false);
      expect(val.errors.some((e) => e.code === "PARAMETER_OUT_OF_RANGE_MAX")).toBe(true);
    });

    it("Diagnostic 5: should detect dangling primitive and constraint references", () => {
      const danglingTemplate: TemplateDefinition = {
        ...SINGLE_CELL_BOX_CULVERT_TEMPLATE,
        id: "dangling_tmpl",
        geometry: {
          ...SINGLE_CELL_BOX_CULVERT_TEMPLATE.geometry,
          lines: [
            ...SINGLE_CELL_BOX_CULVERT_TEMPLATE.geometry.lines,
            { id: "ghost_line", p1: "p_tl", p2: "non_existent_point" },
          ],
        },
      };

      const val = validateTemplate(danglingTemplate);
      expect(val.valid).toBe(false);
      expect(val.errors.some((e) => e.code === "DANGLING_POINT_REF")).toBe(true);
    });

    it("should detect invalid repeat rules (unbound source, anchor port, count param, and expressions)", () => {
      const bogusRepeatTemplate: TemplateDefinition = {
        ...RAILING_RUN_TEMPLATE,
        id: "bogus_repeat_tmpl",
        repeats: [
          {
            id: "bad_repeat_1",
            type: "linear_array",
            sourceComponent: "NON_EXISTENT_SOURCE_XYZ",
            countParamRef: "NON_EXISTENT_COUNT_PARAM",
            spacingExpr: "2 * (3 + ", // Syntax error: unclosed parenthesis
            spacingMode: "driven",
            direction: [1, 0],
            anchorPortId: "NON_EXISTENT_PORT",
            indexVariable: "i",
          },
          {
            id: "bad_repeat_2",
            type: "linear_array",
            sourceComponent: "railing_post",
            countParamRef: "post_count",
            spacingExpr: "ghost_param * 10", // Undefined variable
            spacingMode: "driven",
            direction: [1, 0],
            anchorPortId: "NON_EXISTENT_PORT_2",
            indexVariable: "i",
          },
        ],
      };

      const val = validateTemplate(bogusRepeatTemplate, templateRegistry);
      expect(val.valid).toBe(false);
      expect(val.errors.some((e) => e.code === "UNBOUND_REPEAT_SOURCE_COMPONENT")).toBe(true);
      expect(val.errors.some((e) => e.code === "UNDEFINED_REPEAT_COUNT_PARAM")).toBe(true);
      expect(val.errors.some((e) => e.code === "INVALID_REPEAT_SPACING_EXPR")).toBe(true);
      expect(val.errors.some((e) => e.code === "UNDEFINED_REPEAT_SPACING_VARIABLE")).toBe(true);
      expect(val.errors.some((e) => e.code === "UNBOUND_REPEAT_ANCHOR_PORT")).toBe(true);
    });

    it("should detect duplicate primitive IDs across distinct entity types", () => {
      const dupPrimTemplate: TemplateDefinition = {
        ...SINGLE_CELL_BOX_CULVERT_TEMPLATE,
        id: "dup_prim_tmpl",
        geometry: {
          ...SINGLE_CELL_BOX_CULVERT_TEMPLATE.geometry,
          lines: [
            ...SINGLE_CELL_BOX_CULVERT_TEMPLATE.geometry.lines,
            // Point p_tl already exists! Reusing p_tl as a line id is illegal.
            { id: "p_tl", p1: "p_tl", p2: "p_tr" },
          ],
        },
      };

      const val = validateTemplate(dupPrimTemplate);
      expect(val.valid).toBe(false);
      expect(val.errors.some((e) => e.code === "DUPLICATE_PRIMITIVE_ID")).toBe(true);
    });

    it("should detect duplicate driving constraints bound to the same parameter", () => {
      const dupConstraintTemplate: TemplateDefinition = {
        ...SINGLE_CELL_BOX_CULVERT_TEMPLATE,
        id: "dup_constraint_tmpl",
        constraints: [
          ...SINGLE_CELL_BOX_CULVERT_TEMPLATE.constraints,
          // c_outer_width already drives outer_width! Second driving constraint is redundant/conflicting.
          {
            id: "c_outer_width_dup",
            kind: "distance_x",
            refs: ["p_bl", "p_br"],
            paramRef: "outer_width",
            strength: "driving",
            driving: true,
            provenance: "UserConstraint",
            state: "active",
          },
        ],
      };

      const val = validateTemplate(dupConstraintTemplate);
      expect(val.valid).toBe(false);
      expect(val.errors.some((e) => e.code === "DUPLICATE_DRIVING_PARAM_CONSTRAINT")).toBe(true);
    });

    it("should reject cyclic component attachment DAG in CompositeAssemblyEngine.assemble", () => {
      const cyclicAssembly: TemplateDefinition = {
        ...RAILING_RUN_TEMPLATE,
        id: "cyclic_assembly_runtime",
        components: [
          {
            instanceId: "post_A",
            templateId: "railing_post",
            parameterOverrides: {},
            attachedVia: { parentInstanceId: "post_B", parentPortId: "base_port", ownPortId: "base_port" },
          },
          {
            instanceId: "post_B",
            templateId: "railing_post",
            parameterOverrides: {},
            attachedVia: { parentInstanceId: "post_A", parentPortId: "base_port", ownPortId: "base_port" },
          },
        ],
      };

      expect(() => {
        CompositeAssemblyEngine.assemble(cyclicAssembly, { registry: templateRegistry });
      }).toThrow(/Cyclic dependency detected/);
    });
  });

  describe("Edge Case Verification: Robust Affine Composition & Parametric Propagation", () => {
    it("should resolve compounding oblique parent and child ports with non-zero offsets and skew angles", () => {
      const parentMatrix = AffineMatrix3x3.translation(500, 300).multiply(
        AffineMatrix3x3.rotation((25 * Math.PI) / 180)
      );

      const parentPort: PortEvaluation = {
        id: "p_oblique_out",
        kind: "edge",
        origin: { x: 100, y: 50 },
        angleDeg: 37,
        angleRad: (37 * Math.PI) / 180,
        localMatrix: AffineMatrix3x3.translation(100, 50).multiply(
          AffineMatrix3x3.rotation((37 * Math.PI) / 180)
        ),
      };

      const childPort: PortEvaluation = {
        id: "c_oblique_in",
        kind: "edge",
        origin: { x: 40, y: 25 },
        angleDeg: 63,
        angleRad: (63 * Math.PI) / 180,
        localMatrix: AffineMatrix3x3.translation(40, 25).multiply(
          AffineMatrix3x3.rotation((63 * Math.PI) / 180)
        ),
      };

      const mating = PortMatingSolver.resolvePortMating(parentMatrix, parentPort, childPort, {
        along: 25,
        normal: 15,
        rotate: 18,
        mate: 180,
      });

      // 1. Verify child port in world coordinates lands exactly at target world matrix
      const childPortWorld = mating.childWorldMatrix.multiply(childPort.localMatrix);
      for (let i = 0; i < 9; i++) {
        expect(childPortWorld.m[i]).toBeCloseTo(mating.targetWorldMatrix.m[i], 10);
      }

      // 2. Verify child port origin transformed to world matches target translation
      const transformedChildPortOrigin = mating.childWorldMatrix.transformPoint(childPort.origin);
      expect(transformedChildPortOrigin.x).toBeCloseTo(mating.targetWorldMatrix.m[2], 10);
      expect(transformedChildPortOrigin.y).toBeCloseTo(mating.targetWorldMatrix.m[5], 10);

      // 3. Verify exact isometry: distances between arbitrary child points are preserved
      const pt1 = { x: 10, y: 20 };
      const pt2 = { x: 70, y: 110 };
      const dLocal = Math.hypot(pt2.x - pt1.x, pt2.y - pt1.y);
      const pt1W = mating.childWorldMatrix.transformPoint(pt1);
      const pt2W = mating.childWorldMatrix.transformPoint(pt2);
      const dWorld = Math.hypot(pt2W.x - pt1W.x, pt2W.y - pt1W.y);
      expect(dWorld).toBeCloseTo(dLocal, 10);
    });

    it("should propagate parameter overrides and adapt child geometry points when assembly parameters change", () => {
      // Assemble multi_cell_box_culvert with custom cell_span = 250, clear_height = 180, wall_thickness = 25
      const culvertRes = CompositeAssemblyEngine.assemble("multi_cell_box_culvert", {
        parameterOverrides: {
          cell_count: 2,
          cell_span: 250,
          clear_height: 180,
          wall_thickness: 25,
          haunch_leg: 30,
        },
      });

      const cell0 = culvertRes.instances.get("cell_repeat_0");
      expect(cell0).toBeDefined();
      expect(cell0?.parameters.clear_span).toBe(250);
      expect(cell0?.parameters.clear_height).toBe(180);
      expect(cell0?.parameters.wall_thickness).toBe(25);
      // outer_width = 250 + 2*25 = 300
      expect(cell0?.parameters.outer_width).toBe(300);
      // outer_height = 180 + 2*25 = 230
      expect(cell0?.parameters.outer_height).toBe(230);

      // Verify points adapted to 300x230
      const pTr = culvertRes.geometry.points.find((p) => p.id === "cell_repeat_0_p_tr");
      expect(pTr).toBeDefined();
      expect(pTr?.x).toBeCloseTo(300, 3);
      expect(pTr?.y).toBeCloseTo(0, 3);

      const pBr = culvertRes.geometry.points.find((p) => p.id === "cell_repeat_0_p_br");
      expect(pBr).toBeDefined();
      expect(pBr?.x).toBeCloseTo(300, 3);
      expect(pBr?.y).toBeCloseTo(230, 3);
    });

    it("should convert polylines and arcs to valid LineShape CAD primitives in geometryToShapes", () => {
      const octTmpl = templateRegistry.getTemplate("chamfered_octagonal_polygon")!;
      // Add a test polyline and arc
      const testGeom = {
        ...octTmpl.geometry,
        polylines: [
          {
            id: "test_poly",
            vertices: ["v0", "v1", "v2"],
            closed: true,
          },
        ],
        arcs: [
          {
            id: "test_arc",
            center: "v0",
            radius: 50,
            startAngle: 0,
            endAngle: 90,
          },
        ],
      };

      const shapes = PortMatingSolver.geometryToShapes(testGeom, "test_inst");
      expect(shapes.length).toBeGreaterThan(0);

      // Check polyline segments
      const polySeg0 = shapes.find((s) => s.id === "test_poly_seg_0");
      expect(polySeg0).toBeDefined();
      expect(polySeg0?.type).toBe("line");

      const polyClose = shapes.find((s) => s.id === "test_poly_seg_close");
      expect(polyClose).toBeDefined();
      expect(polyClose?.type).toBe("line");

      // Check arc chords
      const arcChord0 = shapes.find((s) => s.id === "test_arc_chord_0");
      expect(arcChord0).toBeDefined();
      expect(arcChord0?.type).toBe("line");
    });

    it("should handle rapid repeat count mutation loops without memory or reference leaks", () => {
      const counts = [2, 7, 3, 9, 4, 12, 2];
      for (const count of counts) {
        const res = CompositeAssemblyEngine.assemble("railing_run", {
          parameterOverrides: { post_count: count, run_length: 3000 },
        });
        expect(res.instances.size).toBe(count);
        expect(res.shapes.length).toBeGreaterThan(0);
        // Verify last instance
        const lastInstance = res.instances.get(`post_repeat_${count - 1}`);
        expect(lastInstance).toBeDefined();
        expect(lastInstance?.origin.x).toBeCloseTo(3000, 3);
      }
    });
  });
});
