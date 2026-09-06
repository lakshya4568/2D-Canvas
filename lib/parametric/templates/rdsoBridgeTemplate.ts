import { Shape, RectangleShape, LineShape, CircleShape } from "../../geometry/types";

export interface RDSOBridgeParams {
  cellCount: number;
  clearSpan: number;
  wallThickness: number;
  barrelLength: number;
  curtainWallSpan: number;
  dropWallThickness: number;
  trackSpacing: number;
  gap: number;
}

export const defaultRDSOBridgeParams: RDSOBridgeParams = {
  cellCount: 3,
  clearSpan: 2000,
  wallThickness: 350,
  barrelLength: 6850,
  curtainWallSpan: 9150,
  dropWallThickness: 250,
  trackSpacing: 6260,
  gap: 10,
};

export function generateRDSOBridgeAssembly(params: Partial<RDSOBridgeParams> = {}): {
  shapes: Shape[];
  ports: Record<string, { x: number; y: number; angleDeg: number }>;
} {
  const p = { ...defaultRDSOBridgeParams, ...params };
  const shapes: Shape[] = [];

  const cx = 500;
  const cy = 400;

  const totalBoxSpan = p.cellCount * p.clearSpan + (p.cellCount + 1) * p.wallThickness + (p.cellCount - 1) * p.gap;
  const startX = cx - totalBoxSpan / 2;

  const clBridge: LineShape = {
    id: "rdso_cl_bridge",
    name: "C/L OF BRIDGE NO.1",
    type: "line",
    x1: cx,
    y1: cy - 350,
    x2: cx,
    y2: cy + 350,
    strokeColor: "#ef4444",
    strokeWidth: 1.5,
    strokeDasharray: "10 5 2 5",
    isReference: true,
  } as any;
  shapes.push(clBridge);

  const clUpTrack: LineShape = {
    id: "rdso_cl_up_track",
    name: "C/L OF EXISTING UP MAIN LINE",
    type: "line",
    x1: cx - 450,
    y1: cy - 40,
    x2: cx + 450,
    y2: cy - 40,
    strokeColor: "#ef4444",
    strokeWidth: 1.5,
    strokeDasharray: "10 5 2 5",
    isReference: true,
  } as any;
  shapes.push(clUpTrack);

  const clDnTrack: LineShape = {
    id: "rdso_cl_dn_track",
    name: "C/L OF PROPOSED DN MAIN LINE",
    type: "line",
    x1: cx - 450,
    y1: cy - 40 - (p.trackSpacing / 40),
    x2: cx + 450,
    y2: cy - 40 - (p.trackSpacing / 40),
    strokeColor: "#ef4444",
    strokeWidth: 1.5,
    strokeDasharray: "10 5 2 5",
    isReference: true,
  } as any;
  shapes.push(clDnTrack);

  let currentX = startX;
  const unitLength = p.barrelLength / 35;

  for (let i = 0; i < p.cellCount; i++) {
    const unitSpan = p.clearSpan + 2 * p.wallThickness;
    const boxOuter: RectangleShape = {
      id: `rdso_box_outer_${i}`,
      name: `BOX-UNIT ${i + 1}`,
      type: "rectangle",
      x: currentX,
      y: cy - unitLength / 2,
      width: unitSpan,
      height: unitLength,
      strokeColor: "#f8fafc",
      strokeWidth: 2,
    };
    shapes.push(boxOuter);

    const boxInner: RectangleShape = {
      id: `rdso_box_inner_${i}`,
      name: `Box Cavity ${i + 1}`,
      type: "rectangle",
      x: currentX + p.wallThickness,
      y: cy - unitLength / 2 + p.wallThickness / 2,
      width: p.clearSpan,
      height: unitLength - p.wallThickness,
      strokeColor: "#10b981",
      strokeWidth: 1.5,
      strokeDasharray: "4 3",
    };
    shapes.push(boxInner);

    currentX += unitSpan + p.gap;
  }

  const curtainWidth = p.curtainWallSpan / 30;
  const curtainH = 25;
  const curtainWall: RectangleShape = {
    id: "rdso_curtain_wall",
    name: "CURTAIN WALL",
    type: "rectangle",
    x: cx - curtainWidth / 2,
    y: cy - unitLength / 2 - 80,
    width: curtainWidth,
    height: curtainH,
    strokeColor: "#e2e8f0",
    strokeWidth: 1.5,
    strokeDasharray: "3 2",
  };
  shapes.push(curtainWall);

  const dropWallW = totalBoxSpan + 140;
  const dropWallH = p.dropWallThickness / 15;
  const dropWall: RectangleShape = {
    id: "rdso_drop_wall",
    name: "DROP WALL 250mm THK",
    type: "rectangle",
    x: cx - dropWallW / 2,
    y: cy + unitLength / 2 + 60,
    width: dropWallW,
    height: dropWallH,
    strokeColor: "#94a3b8",
    strokeWidth: 2,
  };
  shapes.push(dropWall);

  const returnWallLeft: LineShape = {
    id: "rdso_return_wall_left",
    name: "RETURN WALL LEFT (SLOPE 1.5:1)",
    type: "line",
    x1: startX,
    y1: cy + unitLength / 2,
    x2: startX - 60,
    y2: cy + unitLength / 2 + 60,
    strokeColor: "#f59e0b",
    strokeWidth: 2,
  };
  shapes.push(returnWallLeft);

  const returnWallRight: LineShape = {
    id: "rdso_return_wall_right",
    name: "RETURN WALL RIGHT (SLOPE 1:2)",
    type: "line",
    x1: currentX - p.gap,
    y1: cy + unitLength / 2,
    x2: currentX - p.gap + 60,
    y2: cy + unitLength / 2 + 60,
    strokeColor: "#f59e0b",
    strokeWidth: 2,
  };
  shapes.push(returnWallRight);

  const flareLeft: LineShape = {
    id: "rdso_flare_left",
    name: "FLARE 45 DEGREE",
    type: "line",
    x1: startX,
    y1: cy - unitLength / 2,
    x2: startX - 70,
    y2: cy - unitLength / 2 - 70,
    strokeColor: "#a855f7",
    strokeWidth: 2,
  };
  shapes.push(flareLeft);

  const flareRight: LineShape = {
    id: "rdso_flare_right",
    name: "FLARE 45 DEGREE RIGHT",
    type: "line",
    x1: currentX - p.gap,
    y1: cy - unitLength / 2,
    x2: currentX - p.gap + 70,
    y2: cy - unitLength / 2 - 70,
    strokeColor: "#a855f7",
    strokeWidth: 2,
  };
  shapes.push(flareRight);

  const ports = {
    cl_bridge: { x: cx, y: cy, angleDeg: 90 },
    track_up: { x: cx, y: cy - 40, angleDeg: 0 },
    track_dn: { x: cx, y: cy - 40 - (p.trackSpacing / 40), angleDeg: 0 },
    wing_left: { x: startX, y: cy + unitLength / 2, angleDeg: 225 },
    wing_right: { x: currentX - p.gap, y: cy + unitLength / 2, angleDeg: 315 },
    drop_wall: { x: cx, y: cy + unitLength / 2 + 60, angleDeg: 0 },
  };

  return { shapes, ports };
}
