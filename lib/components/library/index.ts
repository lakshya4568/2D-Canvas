/**
 * The component library shipped with the editor.
 *
 * A project can add its own definitions (they are data); `componentRegistry`
 * is the lookup the engine resolves children through.
 */

import type { ComponentDefinition } from "../types";
import { makeRegistry } from "../instantiate";
import { STRUCTURE_COMPONENTS } from "./structures";
import { ASSEMBLIES } from "./assemblies";
import { CULVERT_VIEWS } from "./culverts";

export const COMPONENT_LIBRARY: ComponentDefinition[] = [...CULVERT_VIEWS, ...ASSEMBLIES, ...STRUCTURE_COMPONENTS];

export const componentRegistry = makeRegistry(COMPONENT_LIBRARY);

export function findDefinition(id: string): ComponentDefinition | undefined {
  return componentRegistry.get(id);
}

export { STRUCTURE_COMPONENTS, ASSEMBLIES, CULVERT_VIEWS };
