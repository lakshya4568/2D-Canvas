/**
 * Parametric Template System for 2D CAD
 * Reusable parametric models with configurable variables, formulas, constraints, and preset CAD library.
 */

import { Shape } from "../geometry/types";
import { ParametricVariable } from "./model";
import { GeometricConstraint } from "./constraints";

export interface TemplateParameterConfig {
  name: string;
  label: string;
  defaultValue: number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  description?: string;
}

export interface TemplateDefinition {
  id: string;
  name: string;
  category: "Architectural" | "Mechanical" | "Structural" | "Geometric";
  description: string;
  version: string;
  parameters: TemplateParameterConfig[];
  formulas: { variable: string; formula: string }[];
  constraints: Omit<GeometricConstraint, "id">[];
  generator: (params: Record<string, number>) => {
    shapes: Shape[];
    variables: Record<string, ParametricVariable>;
    constraints: GeometricConstraint[];
  };
}

/**
 * Built-in CAD Template Library
 */
export const BUILTIN_TEMPLATES: TemplateDefinition[] = [
  {
    id: "parametric_frame_cutout",
    name: "Parametric Frame with Inner Cutout",
    category: "Mechanical",
    description: "Dual-wall frame with outer profile and parametric inner cutout (matches CAD drawing sketch).",
    version: "1.0.0",
    parameters: [
      { name: "Width", label: "Outer Width", defaultValue: 400, unit: "mm", min: 100, max: 1000, step: 10 },
      { name: "Height", label: "Outer Height", defaultValue: 240, unit: "mm", min: 80, max: 600, step: 10 },
      { name: "WallThickness", label: "Wall Thickness", defaultValue: 30, unit: "mm", min: 5, max: 80, step: 5 },
    ],
    formulas: [
      { variable: "InnerWidth", formula: "Width - (WallThickness * 2)" },
      { variable: "InnerHeight", formula: "Height - (WallThickness * 2)" },
      { variable: "InnerX", formula: "100 + WallThickness" },
      { variable: "InnerY", formula: "100 + WallThickness" },
    ],
    constraints: [],
    generator: (params) => {
      const W = params.Width ?? 400;
      const H = params.Height ?? 240;
      const T = params.WallThickness ?? 30;

      const innerW = W - T * 2;
      const innerH = H - T * 2;

      const outerId = "template_outer_" + Date.now();
      const innerId = "template_inner_" + Date.now();

      const shapes: Shape[] = [
        {
          id: outerId,
          name: "Outer_Frame",
          type: "rectangle",
          x: 100,
          y: 100,
          width: W,
          height: H,
          strokeColor: "#0066ff",
          strokeWidth: 2,
          fillColor: "transparent",
        },
        {
          id: innerId,
          name: "Inner_Cutout",
          type: "rectangle",
          x: 100 + T,
          y: 100 + T,
          width: innerW,
          height: innerH,
          strokeColor: "#22c55e",
          strokeWidth: 1.5,
          strokeDasharray: "4 3",
          fillColor: "transparent",
        },
      ];

      const variables: Record<string, ParametricVariable> = {
        Width: { name: "Width", value: W, unit: "mm" },
        Height: { name: "Height", value: H, unit: "mm" },
        WallThickness: { name: "WallThickness", value: T, unit: "mm" },
        InnerWidth: { name: "InnerWidth", value: innerW, formula: "Width - (WallThickness * 2)", unit: "mm" },
        InnerHeight: { name: "InnerHeight", value: innerH, formula: "Height - (WallThickness * 2)", unit: "mm" },
      };

      return { shapes, variables, constraints: [] };
    },
  },
  {
    id: "square_tube_profile",
    name: "Square Box Tube Profile",
    category: "Structural",
    description: "Square hollow section with locked aspect ratio (H = W) and uniform wall thickness.",
    version: "1.0.0",
    parameters: [
      { name: "Size", label: "Tube Size (W=H)", defaultValue: 250, unit: "mm", min: 50, max: 600, step: 10 },
      { name: "Thickness", label: "Wall Thickness", defaultValue: 20, unit: "mm", min: 2, max: 50, step: 2 },
    ],
    formulas: [
      { variable: "W", formula: "Size" },
      { variable: "H", formula: "W" },
      { variable: "InnerSize", formula: "W - (Thickness * 2)" },
    ],
    constraints: [],
    generator: (params) => {
      const S = params.Size ?? 250;
      const T = params.Thickness ?? 20;
      const innerS = S - T * 2;

      const outerId = "tube_out_" + Date.now();
      const innerId = "tube_in_" + Date.now();

      const shapes: Shape[] = [
        {
          id: outerId,
          name: "Tube_Outer",
          type: "rectangle",
          x: 120,
          y: 120,
          width: S,
          height: S,
          strokeColor: "#f8fafc",
          strokeWidth: 2,
        },
        {
          id: innerId,
          name: "Tube_Inner",
          type: "rectangle",
          x: 120 + T,
          y: 120 + T,
          width: innerS,
          height: innerS,
          strokeColor: "#94a3b8",
          strokeWidth: 1.5,
        },
      ];

      const variables: Record<string, ParametricVariable> = {
        Size: { name: "Size", value: S },
        Thickness: { name: "Thickness", value: T },
        InnerSize: { name: "InnerSize", value: innerS, formula: "Size - (Thickness * 2)" },
      };

      return { shapes, variables, constraints: [] };
    },
  },
  {
    id: "bolt_circle_flange",
    name: "Concentric Bolt Circle Flange",
    category: "Mechanical",
    description: "Parametric circular flange with outer rim, bolt circle (PCD), and center bore.",
    version: "1.0.0",
    parameters: [
      { name: "FlangeRadius", label: "Flange Radius (R)", defaultValue: 140, unit: "mm", min: 50, max: 400, step: 10 },
      { name: "CenterBoreRatio", label: "Bore Ratio", defaultValue: 0.4, min: 0.1, max: 0.8, step: 0.05 },
      { name: "BoltCircleRatio", label: "PCD Ratio", defaultValue: 0.72, min: 0.5, max: 0.9, step: 0.02 },
    ],
    formulas: [
      { variable: "BoreRadius", formula: "FlangeRadius * CenterBoreRatio" },
      { variable: "PCDRadius", formula: "FlangeRadius * BoltCircleRatio" },
    ],
    constraints: [],
    generator: (params) => {
      const R = params.FlangeRadius ?? 140;
      const boreRatio = params.CenterBoreRatio ?? 0.4;
      const pcdRatio = params.BoltCircleRatio ?? 0.72;

      const boreR = R * boreRatio;
      const pcdR = R * pcdRatio;
      const cx = 300;
      const cy = 250;

      const shapes: Shape[] = [
        {
          id: "flange_outer_" + Date.now(),
          name: "Flange_Outer",
          type: "circle",
          cx,
          cy,
          r: R,
          strokeColor: "#0066ff",
          strokeWidth: 2,
        },
        {
          id: "flange_pcd_" + Date.now(),
          name: "Bolt_Circle_PCD",
          type: "circle",
          cx,
          cy,
          r: pcdR,
          strokeColor: "#ff9500",
          strokeWidth: 1,
          strokeDasharray: "4 3",
        },
        {
          id: "flange_bore_" + Date.now(),
          name: "Center_Bore",
          type: "circle",
          cx,
          cy,
          r: boreR,
          strokeColor: "#22c55e",
          strokeWidth: 1.5,
        },
      ];

      const variables: Record<string, ParametricVariable> = {
        FlangeRadius: { name: "FlangeRadius", value: R },
        BoreRadius: { name: "BoreRadius", value: boreR, formula: "FlangeRadius * CenterBoreRatio" },
        PCDRadius: { name: "PCDRadius", value: pcdR, formula: "FlangeRadius * BoltCircleRatio" },
      };

      return { shapes, variables, constraints: [] };
    },
  },
  {
    id: "parametric_slab_lines",
    name: "Parametric Slab (8 Connected Lines)",
    category: "Structural",
    description: "Outer frame and inner cutout built entirely from 8 individual lines with mutual formula dependencies (top_outer_rect, top_inner_rect).",
    version: "1.0.0",
    parameters: [
      { name: "top_outer_rect", label: "Top Outer Line Length", defaultValue: 300, unit: "mm", min: 100, max: 800, step: 10 },
      { name: "height_outer_rect", label: "Outer Frame Height", defaultValue: 180, unit: "mm", min: 80, max: 500, step: 10 },
      { name: "wall_thickness", label: "Wall Margin / Thickness", defaultValue: 25, unit: "mm", min: 5, max: 60, step: 5 },
    ],
    formulas: [
      { variable: "top_inner_rect", formula: "top_outer_rect - (wall_thickness * 2)" },
      { variable: "height_inner_rect", formula: "height_outer_rect - (wall_thickness * 2)" },
    ],
    constraints: [],
    generator: (params) => {
      const W = params.top_outer_rect ?? 300;
      const H = params.height_outer_rect ?? 180;
      const T = params.wall_thickness ?? 25;
      const inW = W - T * 2;
      const inH = H - T * 2;

      const ox = 120;
      const oy = 100;
      const ix = ox + T;
      const iy = oy + T;

      const shapes: Shape[] = [
        // 4 Outer Frame Lines
        { id: "line_top_outer_" + Date.now(), name: "top_outer_rect", type: "line", x1: ox, y1: oy, x2: ox + W, y2: oy, strokeColor: "#0066ff", strokeWidth: 2 },
        { id: "line_right_outer_" + Date.now(), name: "right_outer_rect", type: "line", x1: ox + W, y1: oy, x2: ox + W, y2: oy + H, strokeColor: "#0066ff", strokeWidth: 2 },
        { id: "line_bot_outer_" + Date.now(), name: "bottom_outer_rect", type: "line", x1: ox + W, y1: oy + H, x2: ox, y2: oy + H, strokeColor: "#0066ff", strokeWidth: 2 },
        { id: "line_left_outer_" + Date.now(), name: "left_outer_rect", type: "line", x1: ox, y1: oy + H, x2: ox, y2: oy, strokeColor: "#0066ff", strokeWidth: 2 },
        // 4 Inner Cutout Lines
        { id: "line_top_inner_" + Date.now(), name: "top_inner_rect", type: "line", x1: ix, y1: iy, x2: ix + inW, y2: iy, strokeColor: "#22c55e", strokeWidth: 1.5, strokeDasharray: "4 3" },
        { id: "line_right_inner_" + Date.now(), name: "right_inner_rect", type: "line", x1: ix + inW, y1: iy, x2: ix + inW, y2: iy + inH, strokeColor: "#22c55e", strokeWidth: 1.5, strokeDasharray: "4 3" },
        { id: "line_bot_inner_" + Date.now(), name: "bottom_inner_rect", type: "line", x1: ix + inW, y1: iy + inH, x2: ix, y2: iy + inH, strokeColor: "#22c55e", strokeWidth: 1.5, strokeDasharray: "4 3" },
        { id: "line_left_inner_" + Date.now(), name: "left_inner_rect", type: "line", x1: ix, y1: iy + inH, x2: ix, y2: iy, strokeColor: "#22c55e", strokeWidth: 1.5, strokeDasharray: "4 3" },
      ];

      const variables: Record<string, ParametricVariable> = {
        top_outer_rect: { name: "top_outer_rect", value: W, unit: "mm" },
        height_outer_rect: { name: "height_outer_rect", value: H, unit: "mm" },
        wall_thickness: { name: "wall_thickness", value: T, unit: "mm" },
        bottom_outer_rect: { name: "bottom_outer_rect", value: W, formula: "top_outer_rect", unit: "mm" },
        left_outer_rect: { name: "left_outer_rect", value: H, formula: "height_outer_rect", unit: "mm" },
        right_outer_rect: { name: "right_outer_rect", value: H, formula: "height_outer_rect", unit: "mm" },
        top_inner_rect: { name: "top_inner_rect", value: inW, formula: "top_outer_rect - (wall_thickness * 2)", unit: "mm" },
        height_inner_rect: { name: "height_inner_rect", value: inH, formula: "height_outer_rect - (wall_thickness * 2)", unit: "mm" },
        bottom_inner_rect: { name: "bottom_inner_rect", value: inW, formula: "top_inner_rect", unit: "mm" },
        left_inner_rect: { name: "left_inner_rect", value: inH, formula: "height_inner_rect", unit: "mm" },
        right_inner_rect: { name: "right_inner_rect", value: inH, formula: "height_inner_rect", unit: "mm" },
      };

      return { shapes, variables, constraints: [] };
    },
  },
  {
    id: "parametric_slab_miters",
    name: "Parametric Slab with Corner Miters (12 Connected Lines)",
    category: "Structural",
    description: "Complete slab frame with 4 outer lines, 4 inner lines, and 4 diagonal corner miters (length 35) driven by relative coordinates.",
    version: "1.1.0",
    parameters: [
      { name: "top_outer_rect", label: "Top Outer Line Length", defaultValue: 300, unit: "mm", min: 100, max: 800, step: 10 },
      { name: "height_outer_rect", label: "Outer Frame Height", defaultValue: 180, unit: "mm", min: 80, max: 500, step: 10 },
      { name: "wall_thickness", label: "Wall Margin / Thickness", defaultValue: 25, unit: "mm", min: 5, max: 60, step: 5 },
    ],
    formulas: [
      { variable: "top_inner_rect", formula: "top_outer_rect - (wall_thickness * 2)" },
      { variable: "height_inner_rect", formula: "height_outer_rect - (wall_thickness * 2)" },
      { variable: "miter_length", formula: "wall_thickness * sqrt(2)" },
    ],
    constraints: [],
    generator: (params) => {
      const W = params.top_outer_rect ?? 300;
      const H = params.height_outer_rect ?? 180;
      const T = params.wall_thickness ?? 25;
      const inW = W - T * 2;
      const inH = H - T * 2;
      const miterL = Number((T * Math.SQRT2).toFixed(1));

      const ox = 120;
      const oy = 100;
      const ix = ox + T;
      const iy = oy + T;

      const shapes: Shape[] = [
        // 4 Outer Frame Lines
        { id: "line_top_outer_" + Date.now(), name: "top_outer_rect", type: "line", x1: ox, y1: oy, x2: ox + W, y2: oy, strokeColor: "#0066ff", strokeWidth: 2 },
        { id: "line_right_outer_" + Date.now(), name: "right_outer_rect", type: "line", x1: ox + W, y1: oy, x2: ox + W, y2: oy + H, strokeColor: "#0066ff", strokeWidth: 2 },
        { id: "line_bot_outer_" + Date.now(), name: "bottom_outer_rect", type: "line", x1: ox + W, y1: oy + H, x2: ox, y2: oy + H, strokeColor: "#0066ff", strokeWidth: 2 },
        { id: "line_left_outer_" + Date.now(), name: "left_outer_rect", type: "line", x1: ox, y1: oy + H, x2: ox, y2: oy, strokeColor: "#0066ff", strokeWidth: 2 },
        // 4 Inner Cutout Lines
        { id: "line_top_inner_" + Date.now(), name: "top_inner_rect", type: "line", x1: ix, y1: iy, x2: ix + inW, y2: iy, strokeColor: "#22c55e", strokeWidth: 1.5, strokeDasharray: "4 3" },
        { id: "line_right_inner_" + Date.now(), name: "right_inner_rect", type: "line", x1: ix + inW, y1: iy, x2: ix + inW, y2: iy + inH, strokeColor: "#22c55e", strokeWidth: 1.5, strokeDasharray: "4 3" },
        { id: "line_bot_inner_" + Date.now(), name: "bottom_inner_rect", type: "line", x1: ix + inW, y1: iy + inH, x2: ix, y2: iy + inH, strokeColor: "#22c55e", strokeWidth: 1.5, strokeDasharray: "4 3" },
        { id: "line_left_inner_" + Date.now(), name: "left_inner_rect", type: "line", x1: ix, y1: iy + inH, x2: ix, y2: iy, strokeColor: "#22c55e", strokeWidth: 1.5, strokeDasharray: "4 3" },
        // 4 Corner Miter Lines
        { id: "miter_tl_" + Date.now(), name: "miter_top_left", type: "line", x1: ox, y1: oy, x2: ix, y2: iy, strokeColor: "#f59e0b", strokeWidth: 1.5 },
        { id: "miter_tr_" + Date.now(), name: "miter_top_right", type: "line", x1: ox + W, y1: oy, x2: ix + inW, y2: iy, strokeColor: "#f59e0b", strokeWidth: 1.5 },
        { id: "miter_br_" + Date.now(), name: "miter_bottom_right", type: "line", x1: ox + W, y1: oy + H, x2: ix + inW, y2: iy + inH, strokeColor: "#f59e0b", strokeWidth: 1.5 },
        { id: "miter_bl_" + Date.now(), name: "miter_bottom_left", type: "line", x1: ox, y1: oy + H, x2: ix, y2: iy + inH, strokeColor: "#f59e0b", strokeWidth: 1.5 },
      ];

      const variables: Record<string, ParametricVariable> = {
        top_outer_rect: { name: "top_outer_rect", value: W, unit: "mm" },
        height_outer_rect: { name: "height_outer_rect", value: H, unit: "mm" },
        wall_thickness: { name: "wall_thickness", value: T, unit: "mm" },
        bottom_outer_rect: { name: "bottom_outer_rect", value: W, formula: "top_outer_rect", unit: "mm" },
        left_outer_rect: { name: "left_outer_rect", value: H, formula: "height_outer_rect", unit: "mm" },
        right_outer_rect: { name: "right_outer_rect", value: H, formula: "height_outer_rect", unit: "mm" },
        top_inner_rect: { name: "top_inner_rect", value: inW, formula: "top_outer_rect - (wall_thickness * 2)", unit: "mm" },
        height_inner_rect: { name: "height_inner_rect", value: inH, formula: "height_outer_rect - (wall_thickness * 2)", unit: "mm" },
        bottom_inner_rect: { name: "bottom_inner_rect", value: inW, formula: "top_inner_rect", unit: "mm" },
        left_inner_rect: { name: "left_inner_rect", value: inH, formula: "height_inner_rect", unit: "mm" },
        right_inner_rect: { name: "right_inner_rect", value: inH, formula: "height_inner_rect", unit: "mm" },
        miter_length: { name: "miter_length", value: miterL, formula: "wall_thickness * sqrt(2)", unit: "mm" },
      };

      return { shapes, variables, constraints: [] };
    },
  },
  {
    id: "chamfered_octagonal_polygon",
    name: "8-Sided Chamfered Polygon (Closed Shape with 8 Edges)",
    category: "Structural",
    description: "Irregular closed polygon with 8 parametric edges, corner chamfers, exact Shoelace area, and mathematical centroid calculation.",
    version: "1.2.0",
    parameters: [
      { name: "top_edge_length", label: "Top Edge Length", defaultValue: 177, unit: "mm", min: 50, max: 400, step: 1 },
      { name: "tr_chamfer_length", label: "Top-Right Chamfer", defaultValue: 38, unit: "mm", min: 10, max: 100, step: 1 },
      { name: "right_edge_length", label: "Right Edge Length", defaultValue: 92, unit: "mm", min: 30, max: 300, step: 1 },
      { name: "br_chamfer_length", label: "Bottom-Right Chamfer", defaultValue: 38, unit: "mm", min: 10, max: 100, step: 1 },
      { name: "bottom_edge_length", label: "Bottom Edge Length", defaultValue: 176, unit: "mm", min: 50, max: 400, step: 1 },
      { name: "bl_chamfer_length", label: "Bottom-Left Chamfer", defaultValue: 46, unit: "mm", min: 10, max: 100, step: 1 },
      { name: "left_edge_length", label: "Left Edge Length", defaultValue: 79, unit: "mm", min: 30, max: 300, step: 1 },
      { name: "tl_chamfer_length", label: "Top-Left Chamfer", defaultValue: 44, unit: "mm", min: 10, max: 100, step: 1 },
    ],
    formulas: [],
    constraints: [
      { type: "horizontal", shapeIds: ["edge_top"], enabled: true },
      { type: "vertical", shapeIds: ["edge_right"], enabled: true },
      { type: "parallel", shapeIds: ["edge_bottom", "edge_top"], enabled: true },
      { type: "parallel", shapeIds: ["edge_left", "edge_right"], enabled: true },
    ],
    generator: (params) => {
      const L_top = params.top_edge_length ?? 177;
      const L_tr = params.tr_chamfer_length ?? 38;
      const L_right = params.right_edge_length ?? 92;
      const L_br = params.br_chamfer_length ?? 38;
      const L_bot = params.bottom_edge_length ?? 176;
      const L_bl = params.bl_chamfer_length ?? 46;
      const L_left = params.left_edge_length ?? 79;
      const L_tl = params.tl_chamfer_length ?? 44;

      const ox = 150;
      const oy = 100;

      // 8 Vertices
      const v0 = { x: ox, y: oy };
      const v1 = { x: ox + L_top, y: oy };
      const v2 = { x: v1.x + L_tr * Math.SQRT1_2, y: v1.y + L_tr * Math.SQRT1_2 };
      const v3 = { x: v2.x, y: v2.y + L_right };
      const v4 = { x: v3.x - L_br * Math.SQRT1_2, y: v3.y + L_br * Math.SQRT1_2 };

      const v7 = { x: v0.x - L_tl * Math.SQRT1_2, y: v0.y + L_tl * Math.SQRT1_2 };
      const v6 = { x: v7.x, y: v7.y + L_left };
      const v5 = { x: v6.x + L_bl * Math.SQRT1_2, y: v4.y };

      const actualBotLen = Math.abs(v4.x - v5.x);

      const shapes: Shape[] = [
        { id: "edge_top", name: "edge_top", type: "line", x1: v0.x, y1: v0.y, x2: v1.x, y2: v1.y, strokeColor: "#000000", strokeWidth: 2 },
        { id: "edge_tr", name: "edge_tr", type: "line", x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y, strokeColor: "#000000", strokeWidth: 2 },
        { id: "edge_right", name: "edge_right", type: "line", x1: v2.x, y1: v2.y, x2: v3.x, y2: v3.y, strokeColor: "#000000", strokeWidth: 2 },
        { id: "edge_br", name: "edge_br", type: "line", x1: v3.x, y1: v3.y, x2: v4.x, y2: v4.y, strokeColor: "#000000", strokeWidth: 2 },
        { id: "edge_bottom", name: "edge_bottom", type: "line", x1: v4.x, y1: v4.y, x2: v5.x, y2: v5.y, strokeColor: "#000000", strokeWidth: 2 },
        { id: "edge_bl", name: "edge_bl", type: "line", x1: v5.x, y1: v5.y, x2: v6.x, y2: v6.y, strokeColor: "#000000", strokeWidth: 2 },
        { id: "edge_left", name: "edge_left", type: "line", x1: v6.x, y1: v6.y, x2: v7.x, y2: v7.y, strokeColor: "#000000", strokeWidth: 2 },
        { id: "edge_tl", name: "edge_tl", type: "line", x1: v7.x, y1: v7.y, x2: v0.x, y2: v0.y, strokeColor: "#000000", strokeWidth: 2 },
      ];

      const variables: Record<string, ParametricVariable> = {
        top_edge_length: { name: "top_edge_length", value: L_top, unit: "mm" },
        edge_top: { name: "edge_top", value: L_top, unit: "mm" },
        tr_chamfer_length: { name: "tr_chamfer_length", value: L_tr, unit: "mm" },
        edge_tr: { name: "edge_tr", value: L_tr, unit: "mm" },
        right_edge_length: { name: "right_edge_length", value: L_right, unit: "mm" },
        edge_right: { name: "edge_right", value: L_right, unit: "mm" },
        br_chamfer_length: { name: "br_chamfer_length", value: L_br, unit: "mm" },
        edge_br: { name: "edge_br", value: L_br, unit: "mm" },
        bottom_edge_length: { name: "bottom_edge_length", value: actualBotLen, formula: "top_edge_length - 1", unit: "mm" },
        edge_bottom: { name: "edge_bottom", value: actualBotLen, formula: "top_edge_length - 1", unit: "mm" },
        bl_chamfer_length: { name: "bl_chamfer_length", value: L_bl, unit: "mm" },
        edge_bl: { name: "edge_bl", value: L_bl, unit: "mm" },
        left_edge_length: { name: "left_edge_length", value: L_left, unit: "mm" },
        edge_left: { name: "edge_left", value: L_left, unit: "mm" },
        tl_chamfer_length: { name: "tl_chamfer_length", value: L_tl, unit: "mm" },
        edge_tl: { name: "edge_tl", value: L_tl, unit: "mm" },
      };

      return { shapes, variables, constraints: [] };
    },
  },
  {
    id: "single_cell_box_culvert",
    name: "Single-Cell Box Culvert (45° Haunches)",
    category: "Structural",
    description: "Reinforced concrete box culvert with outer boundary, internal octagonal void, 45° corner haunches, and constant wall thickness.",
    version: "2.0.0",
    parameters: [
      { name: "clear_span", label: "Clear Span", defaultValue: 300, unit: "mm", min: 100, max: 1000, step: 10 },
      { name: "clear_height", label: "Clear Height", defaultValue: 200, unit: "mm", min: 100, max: 800, step: 10 },
      { name: "wall_thickness", label: "Wall Thickness", defaultValue: 30, unit: "mm", min: 10, max: 100, step: 5 },
      { name: "haunch_leg", label: "Haunch Leg", defaultValue: 35, unit: "mm", min: 10, max: 80, step: 5 },
    ],
    formulas: [],
    constraints: [],
    generator: (params) => {
      const s = params.clear_span ?? 300;
      const H = params.clear_height ?? 200;
      const t = params.wall_thickness ?? 30;
      const h = params.haunch_leg ?? 35;

      const outerW = s + 2 * t;
      const outerH = H + 2 * t;
      const ox = 100;
      const oy = 80;

      const shapes: Shape[] = [
        {
          id: "culvert_outer",
          name: "culvert_outer",
          type: "rectangle",
          x: ox,
          y: oy,
          width: outerW,
          height: outerH,
          strokeColor: "#38bdf8",
          strokeWidth: 2.5,
          fillColor: "rgba(56, 189, 248, 0.05)",
        },
        { id: "culvert_inner_top", name: "roof", type: "line", x1: ox + t + h, y1: oy + t, x2: ox + t + s - h, y2: oy + t, strokeColor: "#f8fafc", strokeWidth: 2 },
        { id: "culvert_haunch_tr", name: "haunch_tr", type: "line", x1: ox + t + s - h, y1: oy + t, x2: ox + t + s, y2: oy + t + h, strokeColor: "#a855f7", strokeWidth: 2 },
        { id: "culvert_inner_right", name: "right_wall", type: "line", x1: ox + t + s, y1: oy + t + h, x2: ox + t + s, y2: oy + t + H - h, strokeColor: "#f8fafc", strokeWidth: 2 },
        { id: "culvert_haunch_br", name: "haunch_br", type: "line", x1: ox + t + s, y1: oy + t + H - h, x2: ox + t + s - h, y2: oy + t + H, strokeColor: "#a855f7", strokeWidth: 2 },
        { id: "culvert_inner_bottom", name: "floor", type: "line", x1: ox + t + s - h, y1: oy + t + H, x2: ox + t + h, y2: oy + t + H, strokeColor: "#f8fafc", strokeWidth: 2 },
        { id: "culvert_haunch_bl", name: "haunch_bl", type: "line", x1: ox + t + h, y1: oy + t + H, x2: ox + t, y2: oy + t + H - h, strokeColor: "#a855f7", strokeWidth: 2 },
        { id: "culvert_inner_left", name: "left_wall", type: "line", x1: ox + t, y1: oy + t + H - h, x2: ox + t, y2: oy + t + h, strokeColor: "#f8fafc", strokeWidth: 2 },
        { id: "culvert_haunch_tl", name: "haunch_tl", type: "line", x1: ox + t, y1: oy + t + h, x2: ox + t + h, y2: oy + t, strokeColor: "#a855f7", strokeWidth: 2 },
      ];

      const variables: Record<string, ParametricVariable> = {
        clear_span: { name: "clear_span", value: s, unit: "mm" },
        clear_height: { name: "clear_height", value: H, unit: "mm" },
        wall_thickness: { name: "wall_thickness", value: t, unit: "mm" },
        haunch_leg: { name: "haunch_leg", value: h, unit: "mm" },
        outer_width: { name: "outer_width", value: outerW, formula: "clear_span + (wall_thickness * 2)", unit: "mm" },
        outer_height: { name: "outer_height", value: outerH, formula: "clear_height + (wall_thickness * 2)", unit: "mm" },
      };

      return { shapes, variables, constraints: [] };
    },
  },
  {
    id: "two_span_box_culvert",
    name: "Two-Span Multi-Cell Culvert (Intermediate Wall)",
    category: "Structural",
    description: "Two-span box culvert with common dividing wall, 45° corner haunches, and independent bay span controls.",
    version: "2.0.0",
    parameters: [
      { name: "bay1_span", label: "Bay 1 Clear Span", defaultValue: 250, unit: "mm", min: 100, max: 800, step: 10 },
      { name: "bay2_span", label: "Bay 2 Clear Span", defaultValue: 250, unit: "mm", min: 100, max: 800, step: 10 },
      { name: "clear_height", label: "Clear Height", defaultValue: 200, unit: "mm", min: 100, max: 600, step: 10 },
      { name: "ext_wall", label: "Exterior Wall Thickness", defaultValue: 30, unit: "mm", min: 10, max: 80, step: 5 },
      { name: "mid_wall", label: "Dividing Wall Thickness", defaultValue: 40, unit: "mm", min: 10, max: 100, step: 5 },
      { name: "haunch_leg", label: "Haunch Leg", defaultValue: 35, unit: "mm", min: 10, max: 80, step: 5 },
    ],
    formulas: [],
    constraints: [],
    generator: (params) => {
      const s1 = params.bay1_span ?? 250;
      const s2 = params.bay2_span ?? 250;
      const H = params.clear_height ?? 200;
      const tExt = params.ext_wall ?? 30;
      const tMid = params.mid_wall ?? 40;
      const h = params.haunch_leg ?? 35;

      const totalW = tExt + s1 + tMid + s2 + tExt;
      const totalH = H + 2 * tExt;
      const ox = 60;
      const oy = 80;

      const shapes: Shape[] = [
        {
          id: "two_span_outer",
          name: "outer_frame",
          type: "rectangle",
          x: ox,
          y: oy,
          width: totalW,
          height: totalH,
          strokeColor: "#38bdf8",
          strokeWidth: 2.5,
          fillColor: "rgba(56, 189, 248, 0.05)",
        },
        { id: "b1_top", name: "b1_top", type: "line", x1: ox + tExt + h, y1: oy + tExt, x2: ox + tExt + s1 - h, y2: oy + tExt, strokeColor: "#f8fafc", strokeWidth: 2 },
        { id: "b1_haunch_tr", name: "b1_htr", type: "line", x1: ox + tExt + s1 - h, y1: oy + tExt, x2: ox + tExt + s1, y2: oy + tExt + h, strokeColor: "#a855f7", strokeWidth: 2 },
        { id: "b1_right", name: "b1_right", type: "line", x1: ox + tExt + s1, y1: oy + tExt + h, x2: ox + tExt + s1, y2: oy + tExt + H - h, strokeColor: "#f8fafc", strokeWidth: 2 },
        { id: "b1_haunch_br", name: "b1_hbr", type: "line", x1: ox + tExt + s1, y1: oy + tExt + H - h, x2: ox + tExt + s1 - h, y2: oy + tExt + H, strokeColor: "#a855f7", strokeWidth: 2 },
        { id: "b1_bottom", name: "b1_bottom", type: "line", x1: ox + tExt + s1 - h, y1: oy + tExt + H, x2: ox + tExt + h, y2: oy + tExt + H, strokeColor: "#f8fafc", strokeWidth: 2 },
        { id: "b1_haunch_bl", name: "b1_hbl", type: "line", x1: ox + tExt + h, y1: oy + tExt + H, x2: ox + tExt, y2: oy + tExt + H - h, strokeColor: "#a855f7", strokeWidth: 2 },
        { id: "b1_left", name: "b1_left", type: "line", x1: ox + tExt, y1: oy + tExt + H - h, x2: ox + tExt, y2: oy + tExt + h, strokeColor: "#f8fafc", strokeWidth: 2 },
        { id: "b1_haunch_tl", name: "b1_htl", type: "line", x1: ox + tExt, y1: oy + tExt + h, x2: ox + tExt + h, y2: oy + tExt, strokeColor: "#a855f7", strokeWidth: 2 },

        { id: "b2_top", name: "b2_top", type: "line", x1: ox + tExt + s1 + tMid + h, y1: oy + tExt, x2: ox + tExt + s1 + tMid + s2 - h, y2: oy + tExt, strokeColor: "#f8fafc", strokeWidth: 2 },
        { id: "b2_haunch_tr", name: "b2_htr", type: "line", x1: ox + tExt + s1 + tMid + s2 - h, y1: oy + tExt, x2: ox + tExt + s1 + tMid + s2, y2: oy + tExt + h, strokeColor: "#a855f7", strokeWidth: 2 },
        { id: "b2_right", name: "b2_right", type: "line", x1: ox + tExt + s1 + tMid + s2, y1: oy + tExt + h, x2: ox + tExt + s1 + tMid + s2, y2: oy + tExt + H - h, strokeColor: "#f8fafc", strokeWidth: 2 },
        { id: "b2_haunch_br", name: "b2_hbr", type: "line", x1: ox + tExt + s1 + tMid + s2, y1: oy + tExt + H - h, x2: ox + tExt + s1 + tMid + s2 - h, y2: oy + tExt + H, strokeColor: "#a855f7", strokeWidth: 2 },
        { id: "b2_bottom", name: "b2_bottom", type: "line", x1: ox + tExt + s1 + tMid + s2 - h, y1: oy + tExt + H, x2: ox + tExt + s1 + tMid + h, y2: oy + tExt + H, strokeColor: "#f8fafc", strokeWidth: 2 },
        { id: "b2_haunch_bl", name: "b2_hbl", type: "line", x1: ox + tExt + s1 + tMid + h, y1: oy + tExt + H, x2: ox + tExt + s1 + tMid, y2: oy + tExt + H - h, strokeColor: "#a855f7", strokeWidth: 2 },
        { id: "b2_left", name: "b2_left", type: "line", x1: ox + tExt + s1 + tMid, y1: oy + tExt + H - h, x2: ox + tExt + s1 + tMid, y2: oy + tExt + h, strokeColor: "#f8fafc", strokeWidth: 2 },
        { id: "b2_haunch_tl", name: "b2_htl", type: "line", x1: ox + tExt + s1 + tMid, y1: oy + tExt + h, x2: ox + tExt + s1 + tMid + h, y2: oy + tExt, strokeColor: "#a855f7", strokeWidth: 2 },
      ];

      const variables: Record<string, ParametricVariable> = {
        bay1_span: { name: "bay1_span", value: s1, unit: "mm" },
        bay2_span: { name: "bay2_span", value: s2, unit: "mm" },
        clear_height: { name: "clear_height", value: H, unit: "mm" },
        ext_wall: { name: "ext_wall", value: tExt, unit: "mm" },
        mid_wall: { name: "mid_wall", value: tMid, unit: "mm" },
        haunch_leg: { name: "haunch_leg", value: h, unit: "mm" },
        total_width: { name: "total_width", value: totalW, formula: "ext_wall + bay1_span + mid_wall + bay2_span + ext_wall", unit: "mm" },
      };

      return { shapes, variables, constraints: [] };
    },
  },
  {
    id: "rcc_bridge",
    name: "RCC Box Girder Bridge (Multi-Cell & Piers)",
    category: "Structural",
    description: "Fully parametric RCC bridge assembly with deck slab, centerline, symmetric piers, parapets, and cellular voids.",
    version: "1.0.0",
    parameters: [
      { name: "span", label: "Overall Span", defaultValue: 600, unit: "mm", min: 300, max: 1200, step: 20 },
      { name: "deck_width", label: "Deck Width", defaultValue: 700, unit: "mm", min: 400, max: 1400, step: 20 },
      { name: "deck_thickness", label: "Deck Slab Thickness", defaultValue: 60, unit: "mm", min: 30, max: 150, step: 5 },
      { name: "pier_spacing", label: "Pier Spacing", defaultValue: 340, unit: "mm", min: 100, max: 800, step: 10 },
      { name: "pier_width", label: "Pier Width", defaultValue: 60, unit: "mm", min: 20, max: 150, step: 5 },
      { name: "wall_thickness", label: "Internal Wall Thickness", defaultValue: 30, unit: "mm", min: 10, max: 60, step: 5 },
    ],
    formulas: [
      { variable: "cell_width", formula: "(deck_width - 4 * wall_thickness) / 2" },
      { variable: "pier_left_x", formula: "500 - pier_spacing / 2 - pier_width / 2" },
      { variable: "pier_right_x", formula: "500 + pier_spacing / 2 - pier_width / 2" },
    ],
    constraints: [],
    generator: (params) => {
      const span = params.span ?? 600;
      const deckWidth = params.deck_width ?? 700;
      const deckThickness = params.deck_thickness ?? 60;
      const pierSpacing = params.pier_spacing ?? 340;
      const pierWidth = params.pier_width ?? 60;
      const wallThickness = params.wall_thickness ?? 30;

      const centerX = 500;
      const deckTopY = 200;
      const deckX = centerX - deckWidth / 2;
      const pierY = deckTopY + deckThickness;

      const cellWidth = (deckWidth - 4 * wallThickness) / 2;
      const cellHeight = Math.max(15, deckThickness - 2 * wallThickness);

      const shapes: Shape[] = [
        {
          id: "bridge_deck_slab",
          name: "RCC Bridge Deck",
          type: "rectangle",
          x: deckX,
          y: deckTopY,
          width: deckWidth,
          height: deckThickness,
          strokeColor: "#f8fafc",
          strokeWidth: 2,
        },
        {
          id: "bridge_centerline",
          name: "Bridge Centerline",
          type: "line",
          x1: centerX,
          y1: deckTopY - 60,
          x2: centerX,
          y2: deckTopY + deckThickness + 180 + 60,
          strokeColor: "#38bdf8",
          strokeWidth: 1.5,
          strokeDasharray: "8 4 2 4",
        },
        {
          id: "bridge_parapet_left",
          name: "Left Parapet Barrier",
          type: "rectangle",
          x: deckX,
          y: deckTopY - 35,
          width: 25,
          height: 35,
          strokeColor: "#94a3b8",
          strokeWidth: 2,
        },
        {
          id: "bridge_parapet_right",
          name: "Right Parapet Barrier",
          type: "rectangle",
          x: deckX + deckWidth - 25,
          y: deckTopY - 35,
          width: 25,
          height: 35,
          strokeColor: "#94a3b8",
          strokeWidth: 2,
        },
        {
          id: "bridge_pier_left",
          name: "Pier Column (Left)",
          type: "rectangle",
          x: centerX - pierSpacing / 2 - pierWidth / 2,
          y: pierY,
          width: pierWidth,
          height: 180,
          strokeColor: "#e2e8f0",
          strokeWidth: 2,
        },
        {
          id: "bridge_pier_right",
          name: "Pier Column (Right)",
          type: "rectangle",
          x: centerX + pierSpacing / 2 - pierWidth / 2,
          y: pierY,
          width: pierWidth,
          height: 180,
          strokeColor: "#e2e8f0",
          strokeWidth: 2,
        },
        {
          id: "deck_cell_1",
          name: "Deck Cell 1",
          type: "rectangle",
          x: deckX + wallThickness,
          y: deckTopY + wallThickness,
          width: cellWidth,
          height: cellHeight,
          strokeColor: "#38bdf8",
          strokeWidth: 1.5,
        },
        {
          id: "deck_cell_2",
          name: "Deck Cell 2",
          type: "rectangle",
          x: deckX + 2 * wallThickness + cellWidth,
          y: deckTopY + wallThickness,
          width: cellWidth,
          height: cellHeight,
          strokeColor: "#38bdf8",
          strokeWidth: 1.5,
        },
      ];

      const variables: Record<string, ParametricVariable> = {
        span: { name: "span", value: span, unit: "mm" },
        deck_width: { name: "deck_width", value: deckWidth, unit: "mm" },
        deck_thickness: { name: "deck_thickness", value: deckThickness, unit: "mm" },
        pier_spacing: { name: "pier_spacing", value: pierSpacing, unit: "mm" },
        pier_width: { name: "pier_width", value: pierWidth, unit: "mm" },
        wall_thickness: { name: "wall_thickness", value: wallThickness, unit: "mm" },
        cell_width: { name: "cell_width", value: cellWidth, formula: "(deck_width - 4 * wall_thickness) / 2", unit: "mm" },
        pier_left_x: { name: "pier_left_x", value: centerX - pierSpacing / 2 - pierWidth / 2, formula: "500 - pier_spacing / 2 - pier_width / 2", unit: "mm" },
        pier_right_x: { name: "pier_right_x", value: centerX + pierSpacing / 2 - pierWidth / 2, formula: "500 + pier_spacing / 2 - pier_width / 2", unit: "mm" },
      };

      return { shapes, variables, constraints: [] };
    },
  },
];
