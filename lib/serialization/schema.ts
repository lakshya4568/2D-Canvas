import { z } from "zod";

export const lineExportSchema = z.object({
  type: z.literal("line"),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
  opacity: z.number().optional(),
  strokeDasharray: z.string().optional(),
  rotation: z.number().optional(),
});

export const arrowExportSchema = z.object({
  type: z.literal("arrow"),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
  opacity: z.number().optional(),
  strokeDasharray: z.string().optional(),
  rotation: z.number().optional(),
});

export const rectExportSchema = z.object({
  type: z.literal("rectangle"),
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
  fillColor: z.string().optional(),
  opacity: z.number().optional(),
  strokeDasharray: z.string().optional(),
  rotation: z.number().optional(),
});

export const circleExportSchema = z.object({
  type: z.literal("circle"),
  cx: z.number(),
  cy: z.number(),
  r: z.number().nonnegative(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
  fillColor: z.string().optional(),
  opacity: z.number().optional(),
  strokeDasharray: z.string().optional(),
  rotation: z.number().optional(),
});

export const ellipseExportSchema = z.object({
  type: z.literal("ellipse"),
  cx: z.number(),
  cy: z.number(),
  rx: z.number().nonnegative(),
  ry: z.number().nonnegative(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
  fillColor: z.string().optional(),
  opacity: z.number().optional(),
  strokeDasharray: z.string().optional(),
  rotation: z.number().optional(),
});

export const polygonExportSchema = z.object({
  type: z.literal("polygon"),
  cx: z.number(),
  cy: z.number(),
  r: z.number().nonnegative(),
  sides: z.number().int().min(3),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
  fillColor: z.string().optional(),
  opacity: z.number().optional(),
  strokeDasharray: z.string().optional(),
  rotation: z.number().optional(),
});

export const starExportSchema = z.object({
  type: z.literal("star"),
  cx: z.number(),
  cy: z.number(),
  innerR: z.number().nonnegative(),
  outerR: z.number().nonnegative(),
  points: z.number().int().min(3),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
  fillColor: z.string().optional(),
  opacity: z.number().optional(),
  strokeDasharray: z.string().optional(),
  rotation: z.number().optional(),
});

export const shapeExportSchema = z.discriminatedUnion("type", [
  lineExportSchema,
  arrowExportSchema,
  rectExportSchema,
  circleExportSchema,
  ellipseExportSchema,
  polygonExportSchema,
  starExportSchema,
]);

export const documentExportSchema = z.object({
  version: z.string().optional(),
  shapes: z.array(shapeExportSchema),
});

export type ShapeExportData = z.infer<typeof shapeExportSchema>;
export type DocumentExportData = z.infer<typeof documentExportSchema>;
