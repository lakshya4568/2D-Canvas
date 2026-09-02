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
        top_inner_rect: { name: "top_inner_rect", value: inW, formula: "top_outer_rect - (wall_thickness * 2)", unit: "mm" },
        height_inner_rect: { name: "height_inner_rect", value: inH, formula: "height_outer_rect - (wall_thickness * 2)", unit: "mm" },
      };

      return { shapes, variables, constraints: [] };
    },
  },
];
