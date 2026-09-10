/**
 * Parametric Types & Variable Definitions
 * UPCE-MASTER-1.0 §3, §29, §86
 */

export interface ParametricVariable {
  name: string;
  value: number;
  formula?: string;
  unit?: string;
  description?: string;
  min?: number;
  max?: number;
}

export interface ShapeParameterDef {
  key: string;
  label: string;
  value: number;
  readOnly?: boolean;
}
