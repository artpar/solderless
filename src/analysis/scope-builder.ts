// Builds ScopeRegion tree from AST and detects closure wires

import ts from 'typescript'
import { CircuitBoard, ScopeRegion, genId } from './circuit-ir'

export function buildScopes(
  sourceFile: ts.SourceFile,
  board: CircuitBoard,
  sf: ts.SourceFile,
): ScopeRegion[] {
  const moduleScope: ScopeRegion = {
    id: genId('scope'),
    kind: 'module',
    containedComponents: board.components.map((c) => c.id),
    penetratingWires: [],
    children: [],
  }

  // Build child scopes from sub-boards (functions, classes)
  for (const comp of board.components) {
    if (comp.subCircuit) {
      const childKind: ScopeRegion['kind'] =
        comp.operation === 'class' ? 'class' : 'function'

      const childScope: ScopeRegion = {
        id: genId('scope'),
        kind: childKind,
        containedComponents: comp.subCircuit.components.map((c) => c.id),
        penetratingWires: [],
        children: buildChildScopes(comp.subCircuit),
      }
      moduleScope.children.push(childScope)
    }
  }

  return [moduleScope]
}

function buildChildScopes(board: CircuitBoard): ScopeRegion[] {
  const scopes: ScopeRegion[] = []

  for (const comp of board.components) {
    if (comp.subCircuit) {
      const childKind: ScopeRegion['kind'] =
        comp.operation === 'class' ? 'class' : 'function'

      scopes.push({
        id: genId('scope'),
        kind: childKind,
        containedComponents: comp.subCircuit.components.map((c) => c.id),
        penetratingWires: [],
        children: buildChildScopes(comp.subCircuit),
      })
    }
  }

  return scopes
}

/** Detect closure wires: wires that cross scope boundaries */
export function detectClosureWires(board: CircuitBoard): void {
  // Build a set of component IDs in this board
  const localComponentIds = new Set(board.components.map((c) => c.id))

  // Build a map of pin → component
  const pinToComponent = new Map<string, string>()
  for (const comp of board.components) {
    for (const pin of [...comp.inputPins, ...comp.outputPins]) {
      pinToComponent.set(pin.id, comp.id)
    }
  }

  // For each sub-board, check if any wires reference pins from the parent
  for (const sub of board.subBoards) {
    const subPinIds = new Set<string>()
    for (const comp of sub.components) {
      for (const pin of [...comp.inputPins, ...comp.outputPins]) {
        subPinIds.add(pin.id)
      }
    }

    // Wires in the sub that reference parent pins are closure wires
    for (const wire of sub.wires) {
      const srcLocal = subPinIds.has(wire.sourcePin)
      const tgtLocal = subPinIds.has(wire.targetPin)

      if (!srcLocal || !tgtLocal) {
        // This wire crosses scope boundary
        for (const scope of board.scopeRegions) {
          markPenetratingWire(scope, sub, wire.id)
        }
      }
    }

    // Recurse
    detectClosureWires(sub)
  }
}

function markPenetratingWire(
  scope: ScopeRegion,
  subBoard: CircuitBoard,
  wireId: string,
): void {
  // Check if any child scope contains this sub-board's components
  for (const child of scope.children) {
    const subCompIds = new Set(subBoard.components.map((c) => c.id))
    const overlap = child.containedComponents.some((id) => subCompIds.has(id))
    if (overlap) {
      child.penetratingWires.push(wireId)
      return
    }
    markPenetratingWire(child, subBoard, wireId)
  }
}
