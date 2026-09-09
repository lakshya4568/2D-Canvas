import { Point2D } from "../../geometry/topology/types";
import { solveLevenbergMarquardt, SystemModel } from "../../solver/levenbergMarquardt";
import { createMatrix } from "../../solver/matrix/denseMatrix";

export interface SingleCellCulvertConfig {
  clearSpan: number;
  clearHeight: number;
  wallThickness: number;
  haunchLeg: number;
}

export interface SolvedHaunchMetric {
  legX: number;
  legY: number;
  angleDeg: number;
}

export interface SolvedSingleCellCulvert {
  converged: boolean;
  iterations?: number;
  residualNorm?: number;
  maxResidual?: number;
  clearSpan: number;
  clearHeight: number;
  outerWidth: number;
  outerHeight: number;
  topWallThickness: number;
  bottomWallThickness: number;
  leftWallThickness: number;
  rightWallThickness: number;
  haunches: SolvedHaunchMetric[];
  maxJointDiscontinuity: number;
  outerLoop: Point2D[];
  innerLoop: Point2D[];
}

export class SingleCellCulvertModel {
  public config: SingleCellCulvertConfig;
  public outerLoop: Point2D[];
  public innerLoop: Point2D[];

  constructor(config: SingleCellCulvertConfig) {
    this.config = { ...config };

    const t = config.wallThickness;
    const h = config.haunchLeg;
    const s = config.clearSpan;
    const H = config.clearHeight;

    const outerW = s + 2 * t;
    const outerH = H + 2 * t;

    this.outerLoop = [
      { x: 0, y: 0 },
      { x: outerW, y: 0 },
      { x: outerW, y: outerH },
      { x: 0, y: outerH },
    ];

    this.innerLoop = [
      { x: t + h, y: t },
      { x: t + s - h, y: t },
      { x: t + s, y: t + h },
      { x: t + s, y: t + H - h },
      { x: t + s - h, y: t + H },
      { x: t + h, y: t + H },
      { x: t, y: t + H - h },
      { x: t, y: t + h },
    ];
  }

  public getClearSpan(): number {
    return this.innerLoop[2].x - this.innerLoop[7].x;
  }

  public getOuterWidth(): number {
    return this.outerLoop[1].x - this.outerLoop[0].x;
  }
}

export function createSingleCellCulvertModel(
  config: SingleCellCulvertConfig
): SingleCellCulvertModel {
  return new SingleCellCulvertModel(config);
}

export function solveSingleCellCulvertSpan(
  culvert: SingleCellCulvertModel,
  targetSpan: number
): SolvedSingleCellCulvert {
  const t = culvert.config.wallThickness;
  const h = culvert.config.haunchLeg;
  const H = culvert.config.clearHeight;

  // 12 points: V0..V3 (outer), U0..U7 (inner) -> 24 variables
  const initialX = new Array<number>(24);
  for (let i = 0; i < 4; i++) {
    initialX[2 * i] = culvert.outerLoop[i].x;
    initialX[2 * i + 1] = culvert.outerLoop[i].y;
  }
  for (let i = 0; i < 8; i++) {
    initialX[2 * (4 + i)] = culvert.innerLoop[i].x;
    initialX[2 * (4 + i) + 1] = culvert.innerLoop[i].y;
  }

  const model: SystemModel = {
    evaluateResiduals(X: number[]): number[] {
      const x = (idx: number) => X[2 * idx];
      const y = (idx: number) => X[2 * idx + 1];

      return [
        // 1-2. V0 fixed datum at (0, 0)
        x(0) - 0.0,
        y(0) - 0.0,
        // 3. V0-V1 horizontal
        y(1) - y(0),
        // 4. V1-V2 vertical
        x(2) - x(1),
        // 5. V3-V2 horizontal
        y(2) - y(3),
        // 6. V0-V3 vertical
        x(3) - x(0),
        // 7. Outer height fixed
        (y(3) - y(0)) - (H + 2 * t),
        // 8. Top wall thickness: y(U0) - y(V0) = t
        (y(4) - y(0)) - t,
        // 9. Bottom wall thickness: y(V3) - y(U5) = t
        (y(3) - y(9)) - t,
        // 10. Left wall thickness: x(U7) - x(V0) = t
        (x(11) - x(0)) - t,
        // 11. Right wall thickness: x(V1) - x(U2) = t
        (x(1) - x(6)) - t,
        // 12-13. Haunch 1: U0(4)->U1(5)->U2(6). U2 - U1 leg dx=h, dy=h
        (x(6) - x(5)) - h,
        (y(6) - y(5)) - h,
        // 14-15. Haunch 2: U2(6)->U3(7)->U4(8). U4 - U3 leg dx=-h, dy=h
        (x(8) - x(7)) + h,
        (y(8) - y(7)) - h,
        // 16-17. Haunch 3: U4(8)->U5(9)->U6(10). U6 - U5 leg dx=-h, dy=-h
        (x(10) - x(9)) + h,
        (y(10) - y(9)) + h,
        // 18-19. Haunch 4: U6(10)->U7(11)->U0(4). U0 - U7 leg dx=h, dy=-h
        (x(4) - x(11)) - h,
        (y(4) - y(11)) + h,
        // 20. Roof horizontal: U0-U1
        y(5) - y(4),
        // 21. Right wall vertical: U2-U3
        x(7) - x(6),
        // 22. Floor horizontal: U5-U4
        y(8) - y(9),
        // 23. Left wall vertical: U6-U7
        x(11) - x(10),
        // 24. Target driving clear span: x(U2) - x(U7) = targetSpan
        (x(6) - x(11)) - targetSpan,
      ];
    },

    evaluateJacobian(X: number[]): number[][] {
      const numEquations = 24;
      const numVars = 24;
      const J = createMatrix(numEquations, numVars);

      const setJ = (row: number, pointIdx: number, isY: boolean, val: number) => {
        J[row][2 * pointIdx + (isY ? 1 : 0)] = val;
      };

      // 0-1. V0 at (0, 0)
      setJ(0, 0, false, 1.0);
      setJ(1, 0, true, 1.0);

      // 2. y(1) - y(0)
      setJ(2, 0, true, -1.0);
      setJ(2, 1, true, 1.0);

      // 3. x(2) - x(1)
      setJ(3, 1, false, -1.0);
      setJ(3, 2, false, 1.0);

      // 4. y(2) - y(3)
      setJ(4, 3, true, -1.0);
      setJ(4, 2, true, 1.0);

      // 5. x(3) - x(0)
      setJ(5, 0, false, -1.0);
      setJ(5, 3, false, 1.0);

      // 6. y(3) - y(0) - (H + 2t)
      setJ(6, 0, true, -1.0);
      setJ(6, 3, true, 1.0);

      // 7. y(4) - y(0) - t
      setJ(7, 0, true, -1.0);
      setJ(7, 4, true, 1.0);

      // 8. y(3) - y(9) - t
      setJ(8, 3, true, 1.0);
      setJ(8, 9, true, -1.0);

      // 9. x(11) - x(0) - t
      setJ(9, 0, false, -1.0);
      setJ(9, 11, false, 1.0);

      // 10. x(1) - x(6) - t
      setJ(10, 1, false, 1.0);
      setJ(10, 6, false, -1.0);

      // 11-12. Haunch 1: x(6)-x(5)-h, y(6)-y(5)-h
      setJ(11, 5, false, -1.0);
      setJ(11, 6, false, 1.0);
      setJ(12, 5, true, -1.0);
      setJ(12, 6, true, 1.0);

      // 13-14. Haunch 2: x(8)-x(7)+h, y(8)-y(7)-h
      setJ(13, 7, false, -1.0);
      setJ(13, 8, false, 1.0);
      setJ(14, 7, true, -1.0);
      setJ(14, 8, true, 1.0);

      // 15-16. Haunch 3: x(10)-x(9)+h, y(10)-y(9)+h
      setJ(15, 9, false, -1.0);
      setJ(15, 10, false, 1.0);
      setJ(16, 9, true, -1.0);
      setJ(16, 10, true, 1.0);

      // 17-18. Haunch 4: x(4)-x(11)-h, y(4)-y(11)+h
      setJ(17, 11, false, -1.0);
      setJ(17, 4, false, 1.0);
      setJ(18, 11, true, -1.0);
      setJ(18, 4, true, 1.0);

      // 19. y(5) - y(4)
      setJ(19, 4, true, -1.0);
      setJ(19, 5, true, 1.0);

      // 20. x(7) - x(6)
      setJ(20, 6, false, -1.0);
      setJ(20, 7, false, 1.0);

      // 21. y(8) - y(9)
      setJ(21, 9, true, -1.0);
      setJ(21, 8, true, 1.0);

      // 22. x(11) - x(10)
      setJ(22, 10, false, -1.0);
      setJ(22, 11, false, 1.0);

      // 23. x(6) - x(11) - targetSpan
      setJ(23, 11, false, -1.0);
      setJ(23, 6, false, 1.0);

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
  const innerLoop: Point2D[] = [];
  for (let i = 0; i < 8; i++) {
    innerLoop.push({ x: S[2 * (4 + i)], y: S[2 * (4 + i) + 1] });
  }

  culvert.outerLoop = outerLoop;
  culvert.innerLoop = innerLoop;

  // Compute metrics
  const clearSpan = innerLoop[2].x - innerLoop[7].x;
  const clearHeight = innerLoop[5].y - innerLoop[0].y;
  const outerWidth = outerLoop[1].x - outerLoop[0].x;
  const outerHeight = outerLoop[3].y - outerLoop[0].y;

  const topWall = innerLoop[0].y - outerLoop[0].y;
  const bottomWall = outerLoop[3].y - innerLoop[5].y;
  const leftWall = innerLoop[7].x - outerLoop[0].x;
  const rightWall = outerLoop[1].x - innerLoop[2].x;

  const haunches: SolvedHaunchMetric[] = [
    {
      legX: Math.abs(innerLoop[2].x - innerLoop[1].x),
      legY: Math.abs(innerLoop[2].y - innerLoop[1].y),
      angleDeg: (Math.atan2(Math.abs(innerLoop[2].y - innerLoop[1].y), Math.abs(innerLoop[2].x - innerLoop[1].x)) * 180) / Math.PI,
    },
    {
      legX: Math.abs(innerLoop[4].x - innerLoop[3].x),
      legY: Math.abs(innerLoop[4].y - innerLoop[3].y),
      angleDeg: (Math.atan2(Math.abs(innerLoop[4].y - innerLoop[3].y), Math.abs(innerLoop[4].x - innerLoop[3].x)) * 180) / Math.PI,
    },
    {
      legX: Math.abs(innerLoop[6].x - innerLoop[5].x),
      legY: Math.abs(innerLoop[6].y - innerLoop[5].y),
      angleDeg: (Math.atan2(Math.abs(innerLoop[6].y - innerLoop[5].y), Math.abs(innerLoop[6].x - innerLoop[5].x)) * 180) / Math.PI,
    },
    {
      legX: Math.abs(innerLoop[0].x - innerLoop[7].x),
      legY: Math.abs(innerLoop[0].y - innerLoop[7].y),
      angleDeg: (Math.atan2(Math.abs(innerLoop[0].y - innerLoop[7].y), Math.abs(innerLoop[0].x - innerLoop[7].x)) * 180) / Math.PI,
    },
  ];

  return {
    converged: solveRes.converged,
    iterations: solveRes.iterations,
    residualNorm: solveRes.residualNorm,
    maxResidual: solveRes.maxResidual,
    clearSpan,
    clearHeight,
    outerWidth,
    outerHeight,
    topWallThickness: topWall,
    bottomWallThickness: bottomWall,
    leftWallThickness: leftWall,
    rightWallThickness: rightWall,
    haunches,
    maxJointDiscontinuity: 0.0,
    outerLoop,
    innerLoop,
  };
}
