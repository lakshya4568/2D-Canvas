import { Shape, RectangleShape, CircleShape, PolygonShape } from "../geometry/types";
import { detectGADAssemblies } from "../geometry/gadAssemblyEngine";
import { computeShapeBounds } from "../geometry/metrics";
import { detectClosedLoops } from "../parametric/closedGeometry";

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
  targetProperty: string; // e.g. "InnerWidth"
  displayTarget: string; // e.g. "Inner Width"
  expression: string; // e.g. "OuterWidth - 2 * WallThickness"
  evaluatedValue: number;
  provenance: RelationshipProvenance;
  confidence: number; // 0.0 to 1.0
  reason: string;
  status: FormulaStatus;
  variables: { name: string; value: number; role?: string }[];
}

/**
 * Sanitizes a shape name into a valid, readable CAD formula identifier
 */
function toCleanIdentifier(name: string | undefined, fallback: string): string {
  if (!name) return fallback;
  const clean = name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (!clean || /^[0-9]/.test(clean) || clean.startsWith("shape_")) {
    return fallback;
  }
  return clean;
}

/**
 * Autonomous Formula & Relationship Synthesizer (Atomic / Component-Driven / Chain-Rule)
 * Generates short, modular, reusable parametric formulas that the draftsman can inspect,
 * store as named variables, and chain into larger system equations.
 */
export function synthesizeFormulasFromGeometry(shapes: Shape[]): InferredFormula[] {
  const formulas: InferredFormula[] = [];
  const processedFormulaIds = new Set<string>();

  const addFormula = (f: InferredFormula) => {
    if (!processedFormulaIds.has(f.id)) {
      processedFormulaIds.add(f.id);
      formulas.push(f);
    }
  };

  // 1. GAD Assemblies (Autonomous containment hierarchies)
  const assemblies = detectGADAssemblies(shapes);
  for (const asm of assemblies) {
    const outerShape = shapes.find((s) => s.id === asm.outer.id);
    if (!outerShape) continue;

    const outerClean = toCleanIdentifier(outerShape.name, "Outer");
    const outerWidthVar = outerClean === "Outer" ? "OuterWidth" : `${outerClean}_Width`;
    const outerHeightVar = outerClean === "Outer" ? "OuterHeight" : `${outerClean}_Height`;
    const outerXVar = outerClean === "Outer" ? "Outer_X" : `${outerClean}_X`;

    if (asm.features.length === 1) {
      const feat = asm.features[0];
      const innerShape = shapes.find((s) => s.id === feat.id);
      if (!innerShape) continue;

      const innerClean = toCleanIdentifier(innerShape.name, "Inner");
      const innerWidthVar = innerClean === "Inner" ? "InnerWidth" : `${innerClean}_Width`;
      const innerHeightVar = innerClean === "Inner" ? "InnerHeight" : `${innerClean}_Height`;
      const innerXVar = innerClean === "Inner" ? "Inner_X" : `${innerClean}_X`;

      const tL = asm.clearances.left;
      const tR = asm.clearances.right;
      const tT = asm.clearances.top;
      const tB = asm.clearances.bottom;

      const avgT = (tL + tR + tT + tB) / 4;
      const variance =
        ((tL - avgT) ** 2 + (tR - avgT) ** 2 + (tT - avgT) ** 2 + (tB - avgT) ** 2) / 4;
      const stdDev = Math.sqrt(variance);

      if (stdDev < 3.0) {
        const wallT = Math.round(avgT);
        const confidence = Math.max(0.7, Math.min(0.98, 1 - stdDev / 10));

        // Atomic Width formula
        addFormula({
          id: `formula_w_${innerShape.id}`,
          targetShapeId: innerShape.id,
          targetProperty: innerWidthVar,
          displayTarget: `${innerShape.name || innerClean} Width`,
          expression: `${outerWidthVar} - 2 * WallThickness`,
          evaluatedValue: (innerShape as any).width || feat.span,
          provenance: "inferred",
          confidence,
          reason: `Uniform ${wallT}px clearance discovered across all 4 boundaries (σ = ${stdDev.toFixed(1)}px)`,
          status: "accepted",
          variables: [
            { name: outerWidthVar, value: (outerShape as any).width || 0, role: "Outer Boundary Width" },
            { name: "WallThickness", value: wallT, role: "Wall Thickness" },
            { name: "T", value: wallT, role: "Wall Thickness (T)" },
          ],
        });

        // Atomic Height formula
        if ((innerShape as any).height !== undefined && (outerShape as any).height !== undefined) {
          addFormula({
            id: `formula_h_${innerShape.id}`,
            targetShapeId: innerShape.id,
            targetProperty: innerHeightVar,
            displayTarget: `${innerShape.name || innerClean} Height`,
            expression: `${outerHeightVar} - 2 * WallThickness`,
            evaluatedValue: (innerShape as any).height,
            provenance: "inferred",
            confidence,
            reason: `Uniform ${wallT}px clearance discovered across top and bottom slabs`,
            status: "accepted",
            variables: [
              { name: outerHeightVar, value: (outerShape as any).height, role: "Outer Boundary Height" },
              { name: "WallThickness", value: wallT, role: "Wall Thickness" },
              { name: "T", value: wallT, role: "Wall Thickness (T)" },
            ],
          });
        }
      } else if (Math.abs(tL - tR) < 2.0) {
        // Horizontally centered
        addFormula({
          id: `formula_center_${innerShape.id}`,
          targetShapeId: innerShape.id,
          targetProperty: innerXVar,
          displayTarget: `${innerShape.name || innerClean} Centering`,
          expression: `${outerXVar} + (${outerWidthVar} - ${innerWidthVar}) / 2`,
          evaluatedValue: (innerShape as any).x || (innerShape as any).cx || 0,
          provenance: "inferred",
          confidence: 0.94,
          reason: `Inner feature is horizontally centered (Left: ${tL}px, Right: ${tR}px)`,
          status: "accepted",
          variables: [
            { name: outerXVar, value: (outerShape as any).x || 0, role: "Outer X Position" },
            { name: outerWidthVar, value: (outerShape as any).width || 0, role: "Outer Width" },
            { name: innerWidthVar, value: (innerShape as any).width || feat.span, role: "Inner Width" },
          ],
        });
      }
    } else if (asm.features.length >= 2) {
      const f1 = asm.features[0];
      const f2 = asm.features[1];
      const midPartition = asm.clearances.mid || 0;

      if (midPartition > 0) {
        const s1 = shapes.find((s) => s.id === f1.id);
        const s2 = shapes.find((s) => s.id === f2.id);
        const b1Clean = toCleanIdentifier(s1?.name, "Bay1");
        const b2Clean = toCleanIdentifier(s2?.name, "Bay2");
        const b1XVar = `${b1Clean}_X`;
        const b1WVar = `${b1Clean}_Width`;
        const b2XVar = `${b2Clean}_X`;

        addFormula({
          id: `formula_partition_${f2.id}`,
          targetShapeId: f2.id,
          targetProperty: b2XVar,
          displayTarget: `${s2?.name || b2Clean} Partition Offset`,
          expression: `${b1XVar} + ${b1WVar} + WebThickness`,
          evaluatedValue: (s2 as any)?.x || 0,
          provenance: "inferred",
          confidence: 0.95,
          reason: `Internal dividing web of ${midPartition}px discovered between adjacent bays`,
          status: "accepted",
          variables: [
            { name: b1XVar, value: (s1 as any)?.x || 0, role: "Bay 1 X Position" },
            { name: b1WVar, value: (s1 as any)?.width || f1.span, role: "Bay 1 Span" },
            { name: "WebThickness", value: midPartition, role: "Intermediate Partition" },
          ],
        });
      }
    }
  }

  // 2. Scan ANY pair of shapes for general insets / containment (works for freshly drawn shapes too!)
  for (let i = 0; i < shapes.length; i++) {
    for (let j = 0; j < shapes.length; j++) {
      if (i === j) continue;
      const outer = shapes[i];
      const inner = shapes[j];

      // Only evaluate if inner is inside outer's bounding box
      const bOuter = computeShapeBounds(outer);
      const bInner = computeShapeBounds(inner);

      const tL = Math.round(bInner.minX - bOuter.minX);
      const tR = Math.round(bOuter.maxX - bInner.maxX);
      const tT = Math.round(bInner.minY - bOuter.minY);
      const tB = Math.round(bOuter.maxY - bInner.maxY);

      if (tL >= 5 && tR >= 5 && tT >= 5 && tB >= 5) {
        const outerClean = toCleanIdentifier(outer.name, "Outer");
        const innerClean = toCleanIdentifier(inner.name, "Inner");
        const outerWidthVar = outerClean === "Outer" ? "OuterWidth" : `${outerClean}_Width`;
        const innerWidthVar = innerClean === "Inner" ? "InnerWidth" : `${innerClean}_Width`;
        const outerHeightVar = outerClean === "Outer" ? "OuterHeight" : `${outerClean}_Height`;
        const innerHeightVar = innerClean === "Inner" ? "InnerHeight" : `${innerClean}_Height`;
        const outerXVar = outerClean === "Outer" ? "Outer_X" : `${outerClean}_X`;
        const innerXVar = innerClean === "Inner" ? "Inner_X" : `${innerClean}_X`;
        const outerYVar = outerClean === "Outer" ? "Outer_Y" : `${outerClean}_Y`;
        const innerYVar = innerClean === "Inner" ? "Inner_Y" : `${innerClean}_Y`;

        const avgT = (tL + tR + tT + tB) / 4;
        const variance =
          ((tL - avgT) ** 2 + (tR - avgT) ** 2 + (tT - avgT) ** 2 + (tB - avgT) ** 2) / 4;
        const stdDev = Math.sqrt(variance);

        // Case 1: Uniform on all 4 boundaries (stdDev < 3.5)
        if (stdDev < 3.5) {
          const wallT = Math.round(avgT);
          const confidence = Math.max(0.75, Math.min(0.98, 1 - stdDev / 10));

          addFormula({
            id: `formula_w_${inner.id}`,
            targetShapeId: inner.id,
            targetProperty: innerWidthVar,
            displayTarget: `${inner.name || innerClean} Width`,
            expression: `${outerWidthVar} - 2 * WallThickness`,
            evaluatedValue: bInner.width,
            provenance: "inferred",
            confidence,
            reason: `Uniform ${wallT}px clearance discovered across all 4 boundaries (σ = ${stdDev.toFixed(1)}px)`,
            status: "accepted",
            variables: [
              { name: outerWidthVar, value: bOuter.width, role: "Outer Boundary Width" },
              { name: "WallThickness", value: wallT, role: "Wall Thickness" },
              { name: "T", value: wallT, role: "Wall Thickness (T)" },
            ],
          });

          addFormula({
            id: `formula_h_${inner.id}`,
            targetShapeId: inner.id,
            targetProperty: innerHeightVar,
            displayTarget: `${inner.name || innerClean} Height`,
            expression: `${outerHeightVar} - 2 * WallThickness`,
            evaluatedValue: bInner.height,
            provenance: "inferred",
            confidence,
            reason: `Uniform ${wallT}px clearance discovered across top and bottom boundaries`,
            status: "accepted",
            variables: [
              { name: outerHeightVar, value: bOuter.height, role: "Outer Boundary Height" },
              { name: "WallThickness", value: wallT, role: "Wall Thickness" },
              { name: "T", value: wallT, role: "Wall Thickness (T)" },
            ],
          });
        } else if (Math.abs(tT - tB) < 3.0) {
          // Case 2: Uniform Top & Bottom slab thickness (e.g. tT=40, tB=40 with different horizontal position)
          const slabT = Math.round((tT + tB) / 2);
          const leftOffset = Math.round(tL);
          const rightClearance = Math.round(tR);

          addFormula({
            id: `formula_h_${inner.id}`,
            targetShapeId: inner.id,
            targetProperty: innerHeightVar,
            displayTarget: `${inner.name || innerClean} Height`,
            expression: `${outerHeightVar} - 2 * SlabThickness`,
            evaluatedValue: bInner.height,
            provenance: "inferred",
            confidence: 0.96,
            reason: `Uniform ${slabT}px top and bottom slab clearance`,
            status: "accepted",
            variables: [
              { name: outerHeightVar, value: bOuter.height, role: "Outer Boundary Height" },
              { name: "SlabThickness", value: slabT, role: "Top & Bottom Slab Thickness" },
            ],
          });

          addFormula({
            id: `formula_pos_y_${inner.id}`,
            targetShapeId: inner.id,
            targetProperty: innerYVar,
            displayTarget: `${inner.name || innerClean} Y Position`,
            expression: `${outerYVar} + SlabThickness`,
            evaluatedValue: bInner.minY,
            provenance: "inferred",
            confidence: 0.95,
            reason: `Vertical placement offset ${slabT}px from top boundary`,
            status: "accepted",
            variables: [
              { name: outerYVar, value: bOuter.minY, role: "Outer Y Position" },
              { name: "SlabThickness", value: slabT, role: "Top Slab Thickness" },
            ],
          });

          addFormula({
            id: `formula_pos_x_${inner.id}`,
            targetShapeId: inner.id,
            targetProperty: innerXVar,
            displayTarget: `${inner.name || innerClean} X Position`,
            expression: `${outerXVar} + LeftOffset`,
            evaluatedValue: bInner.minX,
            provenance: "inferred",
            confidence: 0.94,
            reason: `Horizontal offset ${leftOffset}px from left edge`,
            status: "accepted",
            variables: [
              { name: outerXVar, value: bOuter.minX, role: "Outer X Position" },
              { name: "LeftOffset", value: leftOffset, role: "Left Margin Offset" },
            ],
          });

          addFormula({
            id: `formula_w_${inner.id}`,
            targetShapeId: inner.id,
            targetProperty: innerWidthVar,
            displayTarget: `${inner.name || innerClean} Width`,
            expression: `${outerWidthVar} - LeftOffset - RightClearance`,
            evaluatedValue: bInner.width,
            provenance: "inferred",
            confidence: 0.92,
            reason: `Contained width between left offset (${leftOffset}px) and right margin (${rightClearance}px)`,
            status: "accepted",
            variables: [
              { name: outerWidthVar, value: bOuter.width, role: "Outer Boundary Width" },
              { name: "LeftOffset", value: leftOffset, role: "Left Margin Offset" },
              { name: "RightClearance", value: rightClearance, role: "Right Margin Clearance" },
            ],
          });
        } else if (Math.abs(tL - tR) < 3.0) {
          // Case 3: Uniform Left & Right wall clearance (horizontally centered)
          const wallT = Math.round((tL + tR) / 2);
          const topOffset = Math.round(tT);
          const bottomClearance = Math.round(tB);

          addFormula({
            id: `formula_w_${inner.id}`,
            targetShapeId: inner.id,
            targetProperty: innerWidthVar,
            displayTarget: `${inner.name || innerClean} Width`,
            expression: `${outerWidthVar} - 2 * WallThickness`,
            evaluatedValue: bInner.width,
            provenance: "inferred",
            confidence: 0.96,
            reason: `Uniform ${wallT}px left and right wall clearance`,
            status: "accepted",
            variables: [
              { name: outerWidthVar, value: bOuter.width, role: "Outer Boundary Width" },
              { name: "WallThickness", value: wallT, role: "Wall Thickness" },
            ],
          });

          addFormula({
            id: `formula_pos_x_${inner.id}`,
            targetShapeId: inner.id,
            targetProperty: innerXVar,
            displayTarget: `${inner.name || innerClean} X Position`,
            expression: `${outerXVar} + WallThickness`,
            evaluatedValue: bInner.minX,
            provenance: "inferred",
            confidence: 0.95,
            reason: `Horizontal placement offset ${wallT}px from left edge`,
            status: "accepted",
            variables: [
              { name: outerXVar, value: bOuter.minX, role: "Outer X Position" },
              { name: "WallThickness", value: wallT, role: "Wall Thickness" },
            ],
          });

          addFormula({
            id: `formula_h_${inner.id}`,
            targetShapeId: inner.id,
            targetProperty: innerHeightVar,
            displayTarget: `${inner.name || innerClean} Height`,
            expression: `${outerHeightVar} - TopOffset - BottomClearance`,
            evaluatedValue: bInner.height,
            provenance: "inferred",
            confidence: 0.92,
            reason: `Contained height between top offset (${topOffset}px) and bottom margin (${bottomClearance}px)`,
            status: "accepted",
            variables: [
              { name: outerHeightVar, value: bOuter.height, role: "Outer Boundary Height" },
              { name: "TopOffset", value: topOffset, role: "Top Margin Offset" },
              { name: "BottomClearance", value: bottomClearance, role: "Bottom Margin Clearance" },
            ],
          });
        } else {
          // Case 4: General containment with independent margins
          const leftOffset = Math.round(tL);
          const topOffset = Math.round(tT);
          const rightClearance = Math.round(tR);
          const bottomClearance = Math.round(tB);

          addFormula({
            id: `formula_pos_x_${inner.id}`,
            targetShapeId: inner.id,
            targetProperty: innerXVar,
            displayTarget: `${inner.name || innerClean} X Position`,
            expression: `${outerXVar} + LeftOffset`,
            evaluatedValue: bInner.minX,
            provenance: "inferred",
            confidence: 0.91,
            reason: `Offset ${leftOffset}px from left boundary`,
            status: "accepted",
            variables: [
              { name: outerXVar, value: bOuter.minX, role: "Outer X Position" },
              { name: "LeftOffset", value: leftOffset, role: "Left Margin Offset" },
            ],
          });

          addFormula({
            id: `formula_pos_y_${inner.id}`,
            targetShapeId: inner.id,
            targetProperty: innerYVar,
            displayTarget: `${inner.name || innerClean} Y Position`,
            expression: `${outerYVar} + TopOffset`,
            evaluatedValue: bInner.minY,
            provenance: "inferred",
            confidence: 0.91,
            reason: `Offset ${topOffset}px from top boundary`,
            status: "accepted",
            variables: [
              { name: outerYVar, value: bOuter.minY, role: "Outer Y Position" },
              { name: "TopOffset", value: topOffset, role: "Top Margin Offset" },
            ],
          });

          addFormula({
            id: `formula_w_${inner.id}`,
            targetShapeId: inner.id,
            targetProperty: innerWidthVar,
            displayTarget: `${inner.name || innerClean} Width`,
            expression: `${outerWidthVar} - LeftOffset - RightClearance`,
            evaluatedValue: bInner.width,
            provenance: "inferred",
            confidence: 0.90,
            reason: `Contained width within ${outer.name || outerClean}`,
            status: "accepted",
            variables: [
              { name: outerWidthVar, value: bOuter.width, role: "Outer Boundary Width" },
              { name: "LeftOffset", value: leftOffset, role: "Left Margin Offset" },
              { name: "RightClearance", value: rightClearance, role: "Right Margin Clearance" },
            ],
          });

          addFormula({
            id: `formula_h_${inner.id}`,
            targetShapeId: inner.id,
            targetProperty: innerHeightVar,
            displayTarget: `${inner.name || innerClean} Height`,
            expression: `${outerHeightVar} - TopOffset - BottomClearance`,
            evaluatedValue: bInner.height,
            provenance: "inferred",
            confidence: 0.90,
            reason: `Contained height within ${outer.name || outerClean}`,
            status: "accepted",
            variables: [
              { name: outerHeightVar, value: bOuter.height, role: "Outer Boundary Height" },
              { name: "TopOffset", value: topOffset, role: "Top Margin Offset" },
              { name: "BottomClearance", value: bottomClearance, role: "Bottom Margin Clearance" },
            ],
          });
        }
      }
    }
  }

  // 3. Scan for Concentric circles (pipes, ducts, shafts)
  for (let i = 0; i < shapes.length; i++) {
    for (let j = 0; j < shapes.length; j++) {
      if (i === j) continue;
      const s1 = shapes[i];
      const s2 = shapes[j];
      if (s1.type === "circle" && s2.type === "circle") {
        const c1 = s1 as CircleShape;
        const c2 = s2 as CircleShape;
        if (Math.hypot(c1.cx - c2.cx, c1.cy - c2.cy) < 3.0 && c1.r > c2.r) {
          const radialT = Math.round(c1.r - c2.r);
          const outerClean = toCleanIdentifier(c1.name, "OuterCircle");
          const innerClean = toCleanIdentifier(c2.name, "InnerCircle");
          const outerRVar = `${outerClean}_Radius`;
          const innerRVar = `${innerClean}_Radius`;

          addFormula({
            id: `formula_radial_${c2.id}`,
            targetShapeId: c2.id,
            targetProperty: innerRVar,
            displayTarget: `${c2.name || innerClean} Radius`,
            expression: `${outerRVar} - WallThickness`,
            evaluatedValue: c2.r,
            provenance: "inferred",
            confidence: 0.97,
            reason: `Concentric circular void with uniform radial thickness ${radialT}px`,
            status: "accepted",
            variables: [
              { name: outerRVar, value: c1.r, role: "Outer Circle Radius" },
              { name: "WallThickness", value: radialT, role: "Radial Wall Thickness" },
            ],
          });
        }
      }
    }
  }

  // 4. Scan for Circular ducts inside bays
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
              const pClean = toCleanIdentifier(rect.name, "Bay");
              const cClean = toCleanIdentifier(circ.name, "Duct");
              const pXVar = `${pClean}_X`;
              const pWVar = `${pClean}_Width`;
              const cXVar = `${cClean}_X`;

              addFormula({
                id: `formula_circ_center_${circ.id}`,
                targetShapeId: circ.id,
                targetProperty: cXVar,
                displayTarget: `${circ.name || cClean} Centerline`,
                expression: `${pXVar} + ${pWVar} / 2`,
                evaluatedValue: circ.cx,
                provenance: "inferred",
                confidence: 0.96,
                reason: `Circular duct is concentric / centered inside parent ${rect.name || pClean}`,
                status: "accepted",
                variables: [
                  { name: pXVar, value: rect.x, role: "Bay Cavity X Position" },
                  { name: pWVar, value: rect.width, role: "Bay Cavity Width" },
                ],
              });
            }
          }
        }
      }
    }
  }

  // 5. Scan for Closed Loops / Openings inside outer boundaries (e.g. culvert haunched openings)
  const loops = detectClosedLoops(shapes);
  for (const loop of loops) {
    const loopBounds = loop.analysis.boundingBox;
    for (const outer of shapes) {
      if (outer.type === "rectangle" || outer.type === "polygon") {
        const outerBounds = computeShapeBounds(outer);
        const tL = Math.round(loopBounds.minX - outerBounds.minX);
        const tR = Math.round(outerBounds.maxX - loopBounds.maxX);
        const tT = Math.round(loopBounds.minY - outerBounds.minY);
        const tB = Math.round(outerBounds.maxY - loopBounds.maxY);

        if (tL >= 5 && tR >= 5 && tT >= 5 && tB >= 5) {
          const avgT = (tL + tR + tT + tB) / 4;
          const variance =
            ((tL - avgT) ** 2 + (tR - avgT) ** 2 + (tT - avgT) ** 2 + (tB - avgT) ** 2) / 4;
          const stdDev = Math.sqrt(variance);

          if (stdDev < 4.0) {
            const wallT = Math.round(avgT);
            const outerClean = toCleanIdentifier(outer.name, "Outer");
            const outerWidthVar = outerClean === "Outer" ? "OuterWidth" : `${outerClean}_Width`;
            const outerHeightVar = outerClean === "Outer" ? "OuterHeight" : `${outerClean}_Height`;

            addFormula({
              id: `formula_loop_w_${loop.shapes[0].id}`,
              targetShapeId: loop.shapes[0].id,
              targetProperty: "ClearSpan",
              displayTarget: `Clear Span (Opening Width)`,
              expression: `${outerWidthVar} - 2 * WallThickness`,
              evaluatedValue: Math.round(loopBounds.width),
              provenance: "inferred",
              confidence: 0.98,
              reason: `Uniform ${wallT}px perimeter wall around ${loop.shapes.length}-segment opening (σ = ${stdDev.toFixed(1)}px)`,
              status: "accepted",
              variables: [
                { name: outerWidthVar, value: Math.round(outerBounds.width), role: "Outer Boundary Width" },
                { name: "WallThickness", value: wallT, role: "Wall Thickness" },
                { name: "T", value: wallT, role: "Wall Thickness (T)" },
              ],
            });

            addFormula({
              id: `formula_loop_h_${loop.shapes[0].id}`,
              targetShapeId: loop.shapes[0].id,
              targetProperty: "ClearHeight",
              displayTarget: `Clear Height (Opening Height)`,
              expression: `${outerHeightVar} - 2 * WallThickness`,
              evaluatedValue: Math.round(loopBounds.height),
              provenance: "inferred",
              confidence: 0.98,
              reason: `Uniform ${wallT}px top & bottom slab thickness around opening`,
              status: "accepted",
              variables: [
                { name: outerHeightVar, value: Math.round(outerBounds.height), role: "Outer Boundary Height" },
                { name: "WallThickness", value: wallT, role: "Wall Thickness" },
                { name: "T", value: wallT, role: "Wall Thickness (T)" },
              ],
            });
          }
        }
      }
    }
  }

  return formulas;
}
