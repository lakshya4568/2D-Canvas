import { Shape, RectangleShape, CircleShape } from "../geometry/types";
import { detectGADAssemblies } from "../geometry/gadAssemblyEngine";

export type RelationshipProvenance =
  | "inferred"
  | "user"
  | "derived"
  | "template"
  | "constraint";

export type FormulaStatus = "pending" | "accepted" | "locked" | "rejected";

export interface InferredFormula {
  id: string;
  targetShapeId: string;
  targetProperty: string; // e.g. "R2.width"
  displayTarget: string; // e.g. "Inner Width"
  expression: string; // e.g. "OuterWidth - 2 * T"
  evaluatedValue: number;
  provenance: RelationshipProvenance;
  confidence: number; // 0.0 to 1.0
  reason: string;
  status: FormulaStatus;
  variables: { name: string; value: number; role?: string }[];
}

/**
 * Autonomous Formula & Relationship Synthesizer
 * Scans geometric entities, containment hierarchies, and spatial clearances to synthesize
 * parametric formulas with confidence scores, reason explanations, and variable bindings.
 */
export function synthesizeFormulasFromGeometry(shapes: Shape[]): InferredFormula[] {
  const formulas: InferredFormula[] = [];
  const assemblies = detectGADAssemblies(shapes);

  for (const asm of assemblies) {
    const outerShape = shapes.find((s) => s.id === asm.outer.id);
    if (!outerShape) continue;

    // 1. Check for single inner feature with uniform insets (Wall Thickness)
    if (asm.features.length === 1) {
      const feat = asm.features[0];
      const innerShape = shapes.find((s) => s.id === feat.id);
      if (!innerShape) continue;

      const tL = asm.clearances.left;
      const tR = asm.clearances.right;
      const tT = asm.clearances.top;
      const tB = asm.clearances.bottom;

      const avgT = (tL + tR + tT + tB) / 4;
      const variance =
        ((tL - avgT) ** 2 + (tR - avgT) ** 2 + (tT - avgT) ** 2 + (tB - avgT) ** 2) / 4;
      const stdDev = Math.sqrt(variance);

      // If standard deviation < 2.5px, high-confidence uniform wall / inset relationship
      if (stdDev < 2.5) {
        const wallT = Math.round(avgT);
        const confidence = Math.max(0.7, Math.min(0.98, 1 - stdDev / 10));

        // Inferred Width formula
        formulas.push({
          id: `formula_w_${innerShape.id}`,
          targetShapeId: innerShape.id,
          targetProperty: `${innerShape.id}.width`,
          displayTarget: `${(innerShape as any).name || "Inner"} Width`,
          expression: `${outerShape.id}.width - 2 * T`,
          evaluatedValue: (innerShape as any).width || feat.span,
          provenance: "inferred",
          confidence,
          reason: `Uniform ${wallT}px clearance discovered across all 4 boundaries (σ = ${stdDev.toFixed(1)}px)`,
          status: "accepted",
          variables: [
            { name: "T", value: wallT, role: "Wall Thickness" },
            { name: "OuterWidth", value: (outerShape as any).width || 0, role: "Outer Boundary Width" },
          ],
        });

        // Inferred Height formula
        if ((innerShape as any).height !== undefined && (outerShape as any).height !== undefined) {
          formulas.push({
            id: `formula_h_${innerShape.id}`,
            targetShapeId: innerShape.id,
            targetProperty: `${innerShape.id}.height`,
            displayTarget: `${(innerShape as any).name || "Inner"} Height`,
            expression: `${outerShape.id}.height - 2 * T`,
            evaluatedValue: (innerShape as any).height,
            provenance: "inferred",
            confidence,
            reason: `Uniform ${wallT}px clearance discovered across top and bottom slabs`,
            status: "accepted",
            variables: [
              { name: "T", value: wallT, role: "Wall Thickness" },
              { name: "OuterHeight", value: (outerShape as any).height, role: "Outer Boundary Height" },
            ],
          });
        }
      } else if (Math.abs(tL - tR) < 2.0) {
        // Horizontally centered opening
        formulas.push({
          id: `formula_center_${innerShape.id}`,
          targetShapeId: innerShape.id,
          targetProperty: `${innerShape.id}.x`,
          displayTarget: `${(innerShape as any).name || "Inner"} Centering`,
          expression: `${outerShape.id}.x + (${outerShape.id}.width - ${innerShape.id}.width) / 2`,
          evaluatedValue: (innerShape as any).x || (innerShape as any).cx || 0,
          provenance: "inferred",
          confidence: 0.94,
          reason: `Inner feature is horizontally centered (Left: ${tL}px, Right: ${tR}px)`,
          status: "accepted",
          variables: [],
        });
      }
    } else if (asm.features.length >= 2) {
      // 2. Multi-bay cellular assembly (e.g. culvert or box girder)
      const f1 = asm.features[0];
      const f2 = asm.features[1];
      const midPartition = asm.clearances.mid || 0;

      if (midPartition > 0) {
        formulas.push({
          id: `formula_partition_${f2.id}`,
          targetShapeId: f2.id,
          targetProperty: `${f2.id}.x`,
          displayTarget: `Bay 2 Partition Offset`,
          expression: `${f1.id}.x + ${f1.id}.width + WebThickness`,
          evaluatedValue: (f2 as any).x || 0,
          provenance: "inferred",
          confidence: 0.95,
          reason: `Internal dividing web of ${midPartition}px discovered between adjacent bays`,
          status: "accepted",
          variables: [{ name: "WebThickness", value: midPartition, role: "Intermediate Partition" }],
        });
      }
    }
  }

  // 3. Scan for Circular ducts inside bays
  for (const shape of shapes) {
    if (shape.type === "circle") {
      const circ = shape as CircleShape;
      for (const parent of shapes) {
        if (parent.type === "rectangle" && parent.id !== circ.id) {
          const rect = parent as RectangleShape;
          if (
            circ.cx >= rect.x &&
            circ.cx <= rect.x + rect.width &&
            circ.cy >= rect.y &&
            circ.cy <= rect.y + rect.height
          ) {
            const leftDist = circ.cx - circ.r - rect.x;
            const rightDist = rect.x + rect.width - (circ.cx + circ.r);
            if (Math.abs(leftDist - rightDist) < 2.0) {
              formulas.push({
                id: `formula_circ_center_${circ.id}`,
                targetShapeId: circ.id,
                targetProperty: `${circ.id}.cx`,
                displayTarget: `${circ.name || "Circular Duct"} Centerline`,
                expression: `${rect.id}.x + ${rect.id}.width / 2`,
                evaluatedValue: circ.cx,
                provenance: "inferred",
                confidence: 0.96,
                reason: `Circular duct is concentric / centered inside parent ${rect.name || rect.id}`,
                status: "accepted",
                variables: [],
              });
            }
          }
        }
      }
    }
  }

  return formulas;
}
