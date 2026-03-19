// Re-export shared utilities needed by the scene

export { COLORS } from '../shared/colors'

import { CircuitBoard } from '../analysis/circuit-ir'

/** Get all wire IDs connected to a component */
export function getConnectedWires(
  board: CircuitBoard,
  componentId: string,
): Set<string> {
  const pinIds = new Set<string>()
  for (const comp of board.components) {
    if (comp.id === componentId) {
      for (const pin of [...comp.inputPins, ...comp.outputPins]) {
        pinIds.add(pin.id)
      }
    }
  }

  const wireIds = new Set<string>()
  for (const wire of board.wires) {
    if (pinIds.has(wire.sourcePin) || pinIds.has(wire.targetPin)) {
      wireIds.add(wire.id)
    }
  }

  for (const seg of board.clockLine) {
    if (seg.from === componentId || seg.to === componentId) {
      wireIds.add(`clock_${seg.from}_${seg.to}`)
    }
  }

  return wireIds
}
