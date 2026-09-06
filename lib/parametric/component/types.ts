import { Shape, ComponentPort, ComponentInstanceAttachment } from "../../geometry/types";

export interface ComponentPortDefinition extends ComponentPort {}

export interface ComponentParameterConfig {
  name: string;
  label: string;
  defaultValue: number;
  unit?: string;
  role: "DRIVING" | "DERIVED" | "FIXED";
  formula?: string;
}

export interface UniversalComponentDefinition {
  id: string;
  name: string;
  category: "culvert" | "bridge" | "substructure" | "superstructure" | "general";
  parameters: ComponentParameterConfig[];
  ports: ComponentPortDefinition[];
  generator: (params: Record<string, number>, origin?: { x: number; y: number }, angleDeg?: number) => {
    shapes: Shape[];
    ports: Record<string, { x: number; y: number; angleDeg: number }>;
  };
}

export interface ComponentAssemblyNode {
  instanceId: string;
  componentDefId: string;
  parameterOverrides: Record<string, number>;
  attachedVia?: ComponentInstanceAttachment;
}
