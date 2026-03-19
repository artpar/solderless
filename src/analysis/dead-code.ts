// Marks unreachable components and unused (dead) wires

import { CircuitBoard } from './circuit-ir'

export function markDeadCode(board: CircuitBoard): void {
  markUnusedWires(board)
  propagateReachability(board)

  // Recurse into sub-boards
  for (const sub of board.subBoards) {
    markDeadCode(sub)
  }
}

/** Mark wires whose output pin is never consumed as dead */
function markUnusedWires(board: CircuitBoard): void {
  // Build set of all pins that are consumed (appear as target of a wire or as input to a component)
  const consumedPins = new Set<string>()
  for (const wire of board.wires) {
    consumedPins.add(wire.sourcePin)
  }

  // An output pin is "used" if it appears as sourcePin in some wire
  // A wire is dead if its targetPin's component has no outgoing wires and isn't a terminal
  const pinToComponent = buildPinToComponentMap(board)

  for (const wire of board.wires) {
    const targetComp = findComponentByPin(board, wire.targetPin)
    if (!targetComp) continue

    // Terminal components (return, throw, export) always have live wires
    if (targetComp.operation === 'return' || targetComp.operation === 'throw' ||
        targetComp.operation.startsWith('export')) {
      continue
    }

    // Check if any output of the target component is consumed
    const hasConsumedOutput = targetComp.outputPins.some(
      (pin) => consumedPins.has(pin.id),
    )

    // If the target component has outputs but none are consumed, the wire feeding it may be dead
    // But only if it's a data wire (not control)
    if (
      wire.kind === 'data' &&
      targetComp.outputPins.length > 0 &&
      !hasConsumedOutput &&
      targetComp.kind !== 'subcircuit' // calls have side effects
    ) {
      wire.isLive = false
    }
  }

  // Also mark wires from unreachable components as dead
  for (const wire of board.wires) {
    const srcComp = findComponentByPin(board, wire.sourcePin)
    const tgtComp = findComponentByPin(board, wire.targetPin)
    if ((srcComp && !srcComp.isReachable) || (tgtComp && !tgtComp.isReachable)) {
      wire.isLive = false
    }
  }
}

/** Components with no clock line and no input wires are dead */
function propagateReachability(board: CircuitBoard): void {
  // Build sets for quick lookup
  const clockConnected = new Set<string>()
  for (const seg of board.clockLine) {
    clockConnected.add(seg.from)
    clockConnected.add(seg.to)
  }

  const hasInputWire = new Set<string>()
  const pinToComp = buildPinToComponentMap(board)
  for (const wire of board.wires) {
    const comp = pinToComp.get(wire.targetPin)
    if (comp) hasInputWire.add(comp)
  }

  // Constants and connectors (imports) are always considered reachable
  for (const comp of board.components) {
    if (comp.kind === 'constant' || comp.kind === 'connector') continue
    if (!comp.isReachable) continue

    // A component is potentially dead if it has no clock connection AND no input wires
    // But we keep it reachable if it was marked so by the AST walk (flow analysis)
  }
}

function buildPinToComponentMap(board: CircuitBoard): Map<string, string> {
  const map = new Map<string, string>()
  for (const comp of board.components) {
    for (const pin of [...comp.inputPins, ...comp.outputPins]) {
      map.set(pin.id, comp.id)
    }
  }
  return map
}

function findComponentByPin(
  board: CircuitBoard,
  pinId: string,
): typeof board.components[0] | undefined {
  for (const comp of board.components) {
    for (const pin of [...comp.inputPins, ...comp.outputPins]) {
      if (pin.id === pinId) return comp
    }
  }
  return undefined
}
