import { Shape } from "../../geometry/types";
import { UniversalComponentDefinition, ComponentAssemblyNode } from "./types";

export interface ResolvedComponentAssembly {
  shapes: Shape[];
  instanceFrames: Map<string, { origin: { x: number; y: number }; angleDeg: number }>;
  resolvedPorts: Map<string, { x: number; y: number; angleDeg: number }>;
}

export class ComponentPortAssemblySolver {
  public static solveAssembly(
    componentRegistry: Map<string, UniversalComponentDefinition>,
    nodes: ComponentAssemblyNode[],
    rootOrigin: { x: number; y: number } = { x: 500, y: 300 }
  ): ResolvedComponentAssembly {
    const allShapes: Shape[] = [];
    const instanceFrames = new Map<string, { origin: { x: number; y: number }; angleDeg: number }>();
    const resolvedPorts = new Map<string, { x: number; y: number; angleDeg: number }>();

    const inDegree = new Map<string, number>();
    const nodeMap = new Map<string, ComponentAssemblyNode>();
    const childrenMap = new Map<string, string[]>();

    for (const node of nodes) {
      nodeMap.set(node.instanceId, node);
      inDegree.set(node.instanceId, 0);
      childrenMap.set(node.instanceId, []);
    }

    for (const node of nodes) {
      if (node.attachedVia && nodeMap.has(node.attachedVia.parentInstanceId)) {
        inDegree.set(node.instanceId, (inDegree.get(node.instanceId) || 0) + 1);
        childrenMap.get(node.attachedVia.parentInstanceId)!.push(node.instanceId);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const node = nodeMap.get(currentId)!;
      const def = componentRegistry.get(node.componentDefId);

      if (!def) continue;

      let frameOrigin = { ...rootOrigin };
      let frameAngle = 0;

      if (node.attachedVia) {
        const parentPortKey = `${node.attachedVia.parentInstanceId}:${node.attachedVia.parentPortId}`;
        const parentPort = resolvedPorts.get(parentPortKey);

        if (parentPort) {
          const rad = (parentPort.angleDeg * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);

          const dx = Number(node.attachedVia.offsetExpr?.dx || 0);
          const dy = Number(node.attachedVia.offsetExpr?.dy || 0);
          const rot = Number(node.attachedVia.offsetExpr?.dAngle || 0);

          frameOrigin = {
            x: parentPort.x + dx * cos - dy * sin,
            y: parentPort.y + dx * sin + dy * cos,
          };
          frameAngle = parentPort.angleDeg + rot;
        }
      }

      instanceFrames.set(node.instanceId, { origin: frameOrigin, angleDeg: frameAngle });

      const finalParams: Record<string, number> = {};
      for (const p of def.parameters) {
        finalParams[p.name] = p.defaultValue;
      }
      Object.assign(finalParams, node.parameterOverrides);

      const generated = def.generator(finalParams, frameOrigin, frameAngle);

      for (const s of generated.shapes) {
        allShapes.push({
          ...s,
          id: `${node.instanceId}_${s.id}`,
          groupId: s.groupId ? `${node.instanceId}_${s.groupId}` : node.instanceId,
        });
      }

      for (const [portId, portCoord] of Object.entries(generated.ports)) {
        resolvedPorts.set(`${node.instanceId}:${portId}`, portCoord);
      }

      for (const childId of childrenMap.get(currentId) || []) {
        const newDeg = (inDegree.get(childId) || 1) - 1;
        inDegree.set(childId, newDeg);
        if (newDeg === 0) queue.push(childId);
      }
    }

    return {
      shapes: allShapes,
      instanceFrames,
      resolvedPorts,
    };
  }
}
