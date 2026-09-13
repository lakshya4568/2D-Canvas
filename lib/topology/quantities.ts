/**
 * Quantities taken off the solved planar map (UPCE-ADDENDUM-2.0 §7, Module 6).
 *
 * A bill of quantities that is typed by hand, or computed from the parameters
 * rather than from the geometry, drifts the moment anyone edits the drawing —
 * and it drifts silently, because nothing checks it against what was drawn. The
 * only figure that cannot drift is the one measured off the same faces the
 * renderer draws:
 *
 *     Volume = Area_DCEL(componentId) x L_barrel
 *
 * Solid faces are even nesting depth and voids are odd. The arrangement reports
 * a face's GROSS area — the area inside its outer boundary, with nothing taken
 * out for the holes it encloses — so the voids have to be subtracted here. That
 * is the one step in a take-off it is fatal to skip: a box culvert's concrete
 * would come out at the full outside rectangle, overstating the pour by the
 * entire waterway, and every figure downstream would be wrong in the same
 * direction by the same invisible amount.
 *
 * Nothing here knows what the component is. A box culvert barrel, a retaining
 * wall stem and a pier cap are all "a face with an area and a length along the
 * axis you are not looking at".
 */

import { DcelFace, Point2D } from "../geometry/topology/types";
import { FusionResult, SolidRegion } from "./booleanFusion";

export interface QuantityLine {
  /** What was measured: a merged solid, or one face of it. */
  id: string;
  description: string;
  /** Net plan area in mm^2: gross, less any void it encloses. */
  areaMm2: number;
  /** Gross area before the enclosed voids were taken out. */
  grossAreaMm2: number;
  /** Length perpendicular to the section, in mm. */
  lengthMm: number;
  /** areaMm2 * lengthMm, in mm^3. */
  volumeMm3: number;
  /** The same volume in m^3, which is what a schedule is written in. */
  volumeM3: number;
  kind: "solid" | "void";
}

export interface QuantityTakeOff {
  lines: QuantityLine[];
  /** Concrete: every solid, summed. */
  totalSolidM3: number;
  /** Excavation or waterway, depending on what the voids are. */
  totalVoidM3: number;
}

const MM3_PER_M3 = 1e9;

function line(
  id: string,
  description: string,
  areaMm2: number,
  grossAreaMm2: number,
  lengthMm: number,
  kind: "solid" | "void"
): QuantityLine {
  const volumeMm3 = areaMm2 * lengthMm;
  return {
    id,
    description,
    areaMm2,
    grossAreaMm2,
    lengthMm,
    volumeMm3,
    volumeM3: volumeMm3 / MM3_PER_M3,
    kind,
  };
}

/** Ray cast, for deciding which solid a void sits in. */
function pointInPolygon(pt: Point2D, poly: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Turns a fused arrangement into a measurement schedule.
 *
 * `barrelLength` is the dimension the section does not show — the length of the
 * culvert along the flow, the length of a wall along its run. One number,
 * because a section is a section: if different components run for different
 * lengths they are different take-offs, and pretending otherwise is how a
 * schedule ends up wrong in a way nobody can see.
 */
export function takeOffFromFusion(
  fusion: Pick<FusionResult, "externalFaces" | "voidFaces">,
  barrelLength: number
): QuantityTakeOff {
  const lines: QuantityLine[] = [];

  fusion.externalFaces.forEach((solid: SolidRegion, i: number) => {
    // Take out every void this solid encloses. Matched by the void's centroid
    // rather than by nesting depth alone, because two solids on one sheet each
    // have their own voids and both sit at depth 1.
    const enclosed = fusion.voidFaces.filter(
      (v) => solid.outer.length > 2 && pointInPolygon(v.centroid, solid.outer)
    );
    const voidArea = enclosed.reduce((sum, v) => sum + Math.abs(v.area), 0);

    lines.push(
      line(
        solid.id,
        solid.faceIds.length > 1
          ? `Solid ${i + 1} (${solid.faceIds.length} regions fused)`
          : `Solid ${i + 1}`,
        solid.area - voidArea,
        solid.area,
        barrelLength,
        "solid"
      )
    );
  });

  fusion.voidFaces.forEach((face: DcelFace, i: number) => {
    const area = Math.abs(face.area);
    lines.push(line(face.id, `Void ${i + 1}`, area, area, barrelLength, "void"));
  });

  return {
    lines,
    totalSolidM3: lines.filter((l) => l.kind === "solid").reduce((s, l) => s + l.volumeM3, 0),
    totalVoidM3: lines.filter((l) => l.kind === "void").reduce((s, l) => s + l.volumeM3, 0),
  };
}

/**
 * Volume of one named face, for a schedule that itemises by component.
 *
 * Returns zero for a face the map does not hold rather than throwing: a schedule
 * that is missing a line is a visible problem, and one that crashes the panel it
 * lives in is a worse one.
 */
export function volumeOfFace(fusion: Pick<FusionResult, "allFaces">, faceId: string, barrelLength: number): number {
  const face = fusion.allFaces.find((f) => f.id === faceId);
  if (!face) return 0;
  return (Math.abs(face.area) * barrelLength) / MM3_PER_M3;
}
