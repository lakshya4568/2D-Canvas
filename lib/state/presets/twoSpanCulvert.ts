import { Point2D } from "../../geometry/topology/types";
import { solveLevenbergMarquardt, SystemModel } from "../../solver/levenbergMarquardt";
import { createMatrix } from "../../solver/matrix/denseMatrix";
import { SolvedHaunchMetric } from "./singleCellCulvert";

export interface TwoSpanCulvertConfig {
  bay1Span: number;
  bay2Span: number;
  clearHeight: number;
  extWallThickness: number;
  midWallThickness: number;
  haunchLeg: number;
}

export interface SolvedTwoSpanCulvert {
  converged: boolean;
  bay1Span: number;
  bay2Span: number;
  totalWidth: number;
  totalHeight: number;
  midWallThickness: number;
  extWallThickness: number;
  bay1Haunches: SolvedHaunchMetric[];
  bay2Haunches: SolvedHaunchMetric[];
  maxJointDiscontinuity: number;
  outerLoop: Point2D[];
  bay1Loop: Point2D[];
  bay2Loop: Point2D[];
}

export class TwoSpanCulvertModel {
  public config: TwoSpanCulvertConfig;
  public outerLoop: Point2D[];
  public bay1Loop: Point2D[];
  public bay2Loop: Point2D[];

  constructor(config: TwoSpanCulvertConfig) {
    this.config = { ...config };

    const tExt = config.extWallThickness;
    const tMid = config.midWallThickness;
    const h = config.haunchLeg;
    const s1 = config.bay1Span;
    const s2 = config.bay2Span;
    const H = config.clearHeight;

    const totalW = tExt + s1 + tMid + s2 + tExt;
    const totalH = H + 2 * tExt;

    this.outerLoop = [
      { x: 0, y: 0 },
      { x: totalW, y: 0 },
      { x: totalW, y: totalH },
      { x: 0, y: totalH },
    ];

    // Bay 1 offset = (tExt, tExt)
    this.bay1Loop = [
      { x: tExt + h, y: tExt },
      { x: tExt + s1 - h, y: tExt },
      { x: tExt + s1, y: tExt + h },
      { x: tExt + s1, y: tExt + H - h },
      { x: tExt + s1 - h, y: tExt + H },
      { x: tExt + h, y: tExt + H },
      { x: tExt, y: tExt + H - h },
      { x: tExt, y: tExt + h },
    ];

    // Bay 2 offset = (tExt + s1 + tMid, tExt)
    const bay2OriginX = tExt + s1 + tMid;
    this.bay2Loop = [
      { x: bay2OriginX + h, y: tExt },
      { x: bay2OriginX + s2 - h, y: tExt },
      { x: bay2OriginX + s2, y: tExt + h },
      { x: bay2OriginX + s2, y: tExt + H - h },
      { x: bay2OriginX + s2 - h, y: tExt + H },
      { x: bay2OriginX + h, y: tExt + H },
      { x: bay2OriginX, y: tExt + H - h },
      { x: bay2OriginX, y: tExt + h },
    ];
  }

  public getTotalWidth(): number {
    return this.outerLoop[1].x - this.outerLoop[0].x;
  }
}

export function createTwoSpanCulvertModel(
  config: TwoSpanCulvertConfig
): TwoSpanCulvertModel {
  return new TwoSpanCulvertModel(config);
}

export function solveTwoSpanCulvertBay1(
  culvert: TwoSpanCulvertModel,
  targetBay1Span: number
): SolvedTwoSpanCulvert {
  const tExt = culvert.config.extWallThickness;
  const tMid = culvert.config.midWallThickness;
  const h = culvert.config.haunchLeg;
  const H = culvert.config.clearHeight;
  const s2Fixed = culvert.config.bay2Span;

  // 20 points:
  // V0..V3 (0..3): outer
  // U0..U7 (4..11): bay 1
  // W0..W7 (12..19): bay 2
  // Total = 40 state variables
  const initialX = new Array<number>(40);
  for (let i = 0; i < 4; i++) {
    initialX[2 * i] = culvert.outerLoop[i].x;
    initialX[2 * i + 1] = culvert.outerLoop[i].y;
  }
  for (let i = 0; i < 8; i++) {
    initialX[2 * (4 + i)] = culvert.bay1Loop[i].x;
    initialX[2 * (4 + i) + 1] = culvert.bay1Loop[i].y;
  }
  for (let i = 0; i < 8; i++) {
    initialX[2 * (12 + i)] = culvert.bay2Loop[i].x;
    initialX[2 * (12 + i) + 1] = culvert.bay2Loop[i].y;
  }

  const model: SystemModel = {
    evaluateResiduals(X: number[]): number[] {
      const x = (idx: number) => X[2 * idx];
      const y = (idx: number) => X[2 * idx + 1];

      return [
        // 0-1. V0 at (0, 0)
        x(0),
        y(0),
        // 2. V0-V1 horizontal
        y(1) - y(0),
        // 3. V1-V2 vertical
        x(2) - x(1),
        // 4. V3-V2 horizontal
        y(2) - y(3),
        // 5. V0-V3 vertical
        x(3) - x(0),
        // 6. Outer height
        (y(3) - y(0)) - (H + 2 * tExt),
        // 7. Left ext wall: x(U7) - x(V0) = tExt
        (x(11) - x(0)) - tExt,
        // 8. Right ext wall: x(V1) - x(W2) = tExt
        (x(1) - x(14)) - tExt,
        // 9. Bay 1 top wall: y(U0) - y(V0) = tExt
        (y(4) - y(0)) - tExt,
        // 10. Bay 1 bottom wall: y(V3) - y(U5) = tExt
        (y(3) - y(9)) - tExt,
        // 11. Bay 2 top wall: y(W0) - y(V0) = tExt
        (y(12) - y(0)) - tExt,
        // 12. Bay 2 bottom wall: y(V3) - y(W5) = tExt
        (y(3) - y(17)) - tExt,
        // 13. Mid wall thickness: x(W7) - x(U2) = tMid
        (x(19) - x(6)) - tMid,
        // 14-21. Bay 1 haunches (4 haunches x 2 eq = 8)
        (x(6) - x(5)) - h,
        (y(6) - y(5)) - h,
        (x(8) - x(7)) + h,
        (y(8) - y(7)) - h,
        (x(10) - x(9)) + h,
        (y(10) - y(9)) + h,
        (x(4) - x(11)) - h,
        (y(4) - y(11)) + h,
        // 22-25. Bay 1 walls
        y(5) - y(4), // roof horiz
        x(7) - x(6), // right wall vert
        y(8) - y(9), // floor horiz
        x(11) - x(10), // left wall vert
        // 26-33. Bay 2 haunches (4 haunches x 2 eq = 8)
        (x(14) - x(13)) - h,
        (y(14) - y(13)) - h,
        (x(16) - x(15)) + h,
        (y(16) - y(15)) - h,
        (x(18) - x(17)) + h,
        (y(18) - y(17)) + h,
        (x(12) - x(19)) - h,
        (y(12) - y(19)) + h,
        // 34-37. Bay 2 walls
        y(13) - y(12), // roof horiz
        x(15) - x(14), // right wall vert
        y(16) - y(17), // floor horiz
        x(19) - x(18), // left wall vert
        // 38. Bay 2 span invariant: x(W2) - x(W7) = s2Fixed
        (x(14) - x(19)) - s2Fixed,
        // 39. Driving Bay 1 span: x(U2) - x(U7) = targetBay1Span
        (x(6) - x(11)) - targetBay1Span,
      ];
    },

    evaluateJacobian(X: number[]): number[][] {
      const numEquations = 40;
      const numVars = 40;
      const J = createMatrix(numEquations, numVars);

      const setJ = (row: number, pointIdx: number, isY: boolean, val: number) => {
        J[row][2 * pointIdx + (isY ? 1 : 0)] = val;
      };

      setJ(0, 0, false, 1.0);
      setJ(1, 0, true, 1.0);

      setJ(2, 0, true, -1.0);
      setJ(2, 1, true, 1.0);

      setJ(3, 1, false, -1.0);
      setJ(3, 2, false, 1.0);

      setJ(4, 3, true, -1.0);
      setJ(4, 2, true, 1.0);

      setJ(5, 0, false, -1.0);
      setJ(5, 3, false, 1.0);

      setJ(6, 0, true, -1.0);
      setJ(6, 3, true, 1.0);

      setJ(7, 0, false, -1.0);
      setJ(7, 11, false, 1.0);

      setJ(8, 1, false, 1.0);
      setJ(8, 14, false, -1.0);

      setJ(9, 0, true, -1.0);
      setJ(9, 4, true, 1.0);

      setJ(10, 3, true, 1.0);
      setJ(10, 9, true, -1.0);

      setJ(11, 0, true, -1.0);
      setJ(11, 12, true, 1.0);

      setJ(12, 3, true, 1.0);
      setJ(12, 17, true, -1.0);

      // 13. x(19) - x(6) - tMid
      setJ(13, 6, false, -1.0);
      setJ(13, 19, false, 1.0);

      // Bay 1 haunches (14-21)
      setJ(14, 5, false, -1.0); setJ(14, 6, false, 1.0);
      setJ(15, 5, true, -1.0); setJ(15, 6, true, 1.0);

      setJ(16, 7, false, -1.0); setJ(16, 8, false, 1.0);
      setJ(17, 7, true, -1.0); setJ(17, 8, true, 1.0);

      setJ(18, 9, false, -1.0); setJ(18, 10, false, 1.0);
      setJ(19, 9, true, -1.0); setJ(19, 10, true, 1.0);

      setJ(20, 11, false, -1.0); setJ(20, 4, false, 1.0);
      setJ(21, 11, true, -1.0); setJ(21, 4, true, 1.0);

      // Bay 1 walls (22-25)
      setJ(22, 4, true, -1.0); setJ(22, 5, true, 1.0);
      setJ(23, 6, false, -1.0); setJ(23, 7, false, 1.0);
      setJ(24, 9, true, -1.0); setJ(24, 8, true, 1.0);
      setJ(25, 10, false, -1.0); setJ(25, 11, false, 1.0);

      // Bay 2 haunches (26-33)
      setJ(26, 13, false, -1.0); setJ(26, 14, false, 1.0);
      setJ(27, 13, true, -1.0); setJ(27, 14, true, 1.0);

      setJ(28, 15, false, -1.0); setJ(28, 16, false, 1.0);
      setJ(29, 15, true, -1.0); setJ(29, 16, true, 1.0);

      setJ(30, 17, false, -1.0); setJ(30, 18, false, 1.0);
      setJ(31, 17, true, -1.0); setJ(31, 18, true, 1.0);

      setJ(32, 19, false, -1.0); setJ(32, 12, false, 1.0);
      setJ(33, 19, true, -1.0); setJ(33, 12, true, 1.0);

      // Bay 2 walls (34-37)
      setJ(34, 12, true, -1.0); setJ(34, 13, true, 1.0);
      setJ(35, 14, false, -1.0); setJ(35, 15, false, 1.0);
      setJ(36, 17, true, -1.0); setJ(36, 16, true, 1.0);
      setJ(37, 18, false, -1.0); setJ(37, 19, false, 1.0);

      // 38. x(14) - x(19) - s2Fixed
      setJ(38, 19, false, -1.0);
      setJ(38, 14, false, 1.0);

      // 39. x(6) - x(11) - targetBay1Span
      setJ(39, 11, false, -1.0);
      setJ(39, 6, false, 1.0);

      return J;
    },
  };

  const solveRes = solveLevenbergMarquardt(model, initialX, {
    maxIterations: 50,
    toleranceResidual: 1e-8,
  });

  const S = solveRes.solution;
  const outerLoop: Point2D[] = [];
  for (let i = 0; i < 4; i++) {
    outerLoop.push({ x: S[2 * i], y: S[2 * i + 1] });
  }
  const bay1Loop: Point2D[] = [];
  for (let i = 0; i < 8; i++) {
    bay1Loop.push({ x: S[2 * (4 + i)], y: S[2 * (4 + i) + 1] });
  }
  const bay2Loop: Point2D[] = [];
  for (let i = 0; i < 8; i++) {
    bay2Loop.push({ x: S[2 * (12 + i)], y: S[2 * (12 + i) + 1] });
  }

  culvert.outerLoop = outerLoop;
  culvert.bay1Loop = bay1Loop;
  culvert.bay2Loop = bay2Loop;

  const bay1Span = bay1Loop[2].x - bay1Loop[7].x;
  const bay2Span = bay2Loop[2].x - bay2Loop[7].x;
  const totalWidth = outerLoop[1].x - outerLoop[0].x;
  const totalHeight = outerLoop[3].y - outerLoop[0].y;
  const midWallThickness = bay2Loop[7].x - bay1Loop[2].x;

  const extractHaunches = (loop: Point2D[]): SolvedHaunchMetric[] => [
    {
      legX: Math.abs(loop[2].x - loop[1].x),
      legY: Math.abs(loop[2].y - loop[1].y),
      angleDeg: (Math.atan2(Math.abs(loop[2].y - loop[1].y), Math.abs(loop[2].x - loop[1].x)) * 180) / Math.PI,
    },
    {
      legX: Math.abs(loop[4].x - loop[3].x),
      legY: Math.abs(loop[4].y - loop[3].y),
      angleDeg: (Math.atan2(Math.abs(loop[4].y - loop[3].y), Math.abs(loop[4].x - loop[3].x)) * 180) / Math.PI,
    },
    {
      legX: Math.abs(loop[6].x - loop[5].x),
      legY: Math.abs(loop[6].y - loop[5].y),
      angleDeg: (Math.atan2(Math.abs(loop[6].y - loop[5].y), Math.abs(loop[6].x - loop[5].x)) * 180) / Math.PI,
    },
    {
      legX: Math.abs(loop[0].x - loop[7].x),
      legY: Math.abs(loop[0].y - loop[7].y),
      angleDeg: (Math.atan2(Math.abs(loop[0].y - loop[7].y), Math.abs(loop[0].x - loop[7].x)) * 180) / Math.PI,
    },
  ];

  return {
    converged: solveRes.converged,
    bay1Span,
    bay2Span,
    totalWidth,
    totalHeight,
    midWallThickness,
    extWallThickness: tExt,
    bay1Haunches: extractHaunches(bay1Loop),
    bay2Haunches: extractHaunches(bay2Loop),
    maxJointDiscontinuity: 0.0,
    outerLoop,
    bay1Loop,
    bay2Loop,
  };
}
