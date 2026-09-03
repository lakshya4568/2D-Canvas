import { Shape, RectangleShape, LineShape } from "../../geometry/types";

export interface RCCBridgeParams {
  span: number;
  deckWidth: number;
  deckThickness: number;
  pierWidth: number;
  pierHeight: number;
  pierSpacing: number;
  parapetHeight: number;
  wallThickness: number;
}

export const defaultRCCBridgeParams: RCCBridgeParams = {
  span: 600,
  deckWidth: 700,
  deckThickness: 60,
  pierWidth: 60,
  pierHeight: 180,
  pierSpacing: 340,
  parapetHeight: 35,
  wallThickness: 30,
};

/**
 * Generates a fully parametric RCC Bridge CAD assembly.
 * Anchored around a vertical centerline axis at (500, 300).
 */
export function generateRCCBridgeAssembly(params: Partial<RCCBridgeParams> = {}): Shape[] {
  const p: RCCBridgeParams = { ...defaultRCCBridgeParams, ...params };
  const centerX = 500;
  const deckTopY = 200;

  // Deck slab
  const deckX = centerX - p.deckWidth / 2;
  const deckY = deckTopY;

  const deckSlab: RectangleShape = {
    id: "bridge_deck_slab",
    name: "RCC Bridge Deck",
    type: "rectangle",
    x: deckX,
    y: deckY,
    width: p.deckWidth,
    height: p.deckThickness,
    strokeColor: "#f8fafc",
    strokeWidth: 2,
  };

  // Centerline reference line
  const centerline: LineShape = {
    id: "bridge_centerline",
    name: "Bridge Centerline",
    type: "line",
    x1: centerX,
    y1: deckTopY - 60,
    x2: centerX,
    y2: deckTopY + p.deckThickness + p.pierHeight + 60,
    strokeColor: "#38bdf8",
    strokeWidth: 1.5,
    strokeDasharray: "8 4 2 4",
    isReference: true,
  } as any;

  // Parapets
  const leftParapet: RectangleShape = {
    id: "bridge_parapet_left",
    name: "Left Parapet Barrier",
    type: "rectangle",
    x: deckX,
    y: deckTopY - p.parapetHeight,
    width: 25,
    height: p.parapetHeight,
    strokeColor: "#94a3b8",
    strokeWidth: 2,
  };

  const rightParapet: RectangleShape = {
    id: "bridge_parapet_right",
    name: "Right Parapet Barrier",
    type: "rectangle",
    x: deckX + p.deckWidth - 25,
    y: deckTopY - p.parapetHeight,
    width: 25,
    height: p.parapetHeight,
    strokeColor: "#94a3b8",
    strokeWidth: 2,
  };

  // Symmetric Piers about Centerline
  const pierY = deckTopY + p.deckThickness;
  const leftPierX = centerX - p.pierSpacing / 2 - p.pierWidth / 2;
  const rightPierX = centerX + p.pierSpacing / 2 - p.pierWidth / 2;

  const leftPier: RectangleShape = {
    id: "bridge_pier_left",
    name: "Pier Column (Left)",
    type: "rectangle",
    x: leftPierX,
    y: pierY,
    width: p.pierWidth,
    height: p.pierHeight,
    strokeColor: "#e2e8f0",
    strokeWidth: 2,
  };

  const rightPier: RectangleShape = {
    id: "bridge_pier_right",
    name: "Pier Column (Right)",
    type: "rectangle",
    x: rightPierX,
    y: pierY,
    width: p.pierWidth,
    height: p.pierHeight,
    strokeColor: "#e2e8f0",
    strokeWidth: 2,
  };

  // Internal Cellular Voids inside the Deck Slab
  const cellWidth = (p.deckWidth - 4 * p.wallThickness) / 2;
  const cellHeight = Math.max(15, p.deckThickness - 2 * p.wallThickness);

  const leftCell: RectangleShape = {
    id: "deck_cell_1",
    name: "Deck Cell 1",
    type: "rectangle",
    x: deckX + p.wallThickness,
    y: deckY + p.wallThickness,
    width: cellWidth,
    height: cellHeight,
    strokeColor: "#38bdf8",
    strokeWidth: 1.5,
  };

  const rightCell: RectangleShape = {
    id: "deck_cell_2",
    name: "Deck Cell 2",
    type: "rectangle",
    x: deckX + 2 * p.wallThickness + cellWidth,
    y: deckY + p.wallThickness,
    width: cellWidth,
    height: cellHeight,
    strokeColor: "#38bdf8",
    strokeWidth: 1.5,
  };

  return [
    deckSlab,
    centerline,
    leftParapet,
    rightParapet,
    leftPier,
    rightPier,
    leftCell,
    rightCell,
  ];
}
