export * from "../geometry/gadAssemblyEngine";
import {
  detectGADAssemblies,
  isShapeInGADAssembly,
  solveGADAssemblyAdjustment,
  GADAssembly,
  GADFeature,
  GADClearanceSpec,
  GADShapeRole,
} from "../geometry/gadAssemblyEngine";

export type WallThicknessSpec = GADClearanceSpec;
export type WallAssemblyVoid = GADFeature;
export type WallAssembly = GADAssembly;
export type WallShapeRole = GADShapeRole;

export const detectWallAssemblies = detectGADAssemblies;
export const isShapeInWallAssembly = isShapeInGADAssembly;
export const solveWallAssemblyAdjustment = solveGADAssemblyAdjustment;
