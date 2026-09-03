import { Point2D } from "../geometry/topology/types";

export interface RecognizedHaunch {
  startIndex: number;
  endIndex: number;
  startPoint: Point2D;
  endPoint: Point2D;
  legLength: number;
  angleDeg: number;
  signX: number;
  signY: number;
}

export function recognizeHaunches(
  polygonVertices: Point2D[],
  angleToleranceDeg: number = 2.5
): RecognizedHaunch[] {
  const n = polygonVertices.length;
  const haunches: RecognizedHaunch[] = [];

  for (let i = 0; i < n; i++) {
    const nextIdx = (i + 1) % n;
    const p1 = polygonVertices[i];
    const p2 = polygonVertices[nextIdx];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx < 1.0 || absDy < 1.0) continue;

    const angleRad = Math.atan2(Math.abs(dy), Math.abs(dx));
    const angleDeg = (angleRad * 180.0) / Math.PI;

    if (Math.abs(angleDeg - 45.0) <= angleToleranceDeg) {
      const leg = (absDx + absDy) / 2.0;
      haunches.push({
        startIndex: i,
        endIndex: nextIdx,
        startPoint: { ...p1 },
        endPoint: { ...p2 },
        legLength: leg,
        angleDeg,
        signX: dx >= 0 ? 1 : -1,
        signY: dy >= 0 ? 1 : -1,
      });
    }
  }

  return haunches;
}
