// Layout orchestrator: CircuitBoard → PositionedBoard

import { CircuitBoard } from '../analysis/circuit-ir'
import { placeComponents, PlacementResult } from './placement'
import { routeWires, RoutingResult, RoutedWire } from './wire-routing'
import { buildColorContext, ColorContext } from '../shared/semantic-colors'

export interface PositionedBoard {
  board: CircuitBoard
  placement: PlacementResult
  routing: RoutingResult
  subBoards: PositionedBoard[]
  colorContext: ColorContext
}

export function layoutBoard(board: CircuitBoard): PositionedBoard {
  // Placement handles the full hierarchy — children placed inside parents
  const placement = placeComponents(board)

  // Route wires from this board and all nested sub-circuits
  // All placed components (at all levels) are in the flat placed list
  const allWires: RoutedWire[] = []

  // Route top-level board wires
  const topRouting = routeWires(board, placement.placed)
  allWires.push(...topRouting.wires)

  // Route wires from nested sub-circuit boards
  collectSubBoardWires(board, placement.placed, allWires)

  const routing: RoutingResult = { wires: allWires }

  // subBoards still laid out separately (e.g. separate files)
  const subBoards: PositionedBoard[] = []
  for (const sub of board.subBoards) {
    subBoards.push(layoutBoard(sub))
  }

  const colorContext = buildColorContext(board)

  return {
    board,
    placement,
    routing,
    subBoards,
    colorContext,
  }
}

/** Recursively collect and route wires from sub-circuit boards */
function collectSubBoardWires(
  board: CircuitBoard,
  placed: import('./placement').PlacedComponent[],
  allWires: RoutedWire[],
): void {
  for (const comp of board.components) {
    if (comp.subCircuit && comp.subCircuit.components.length > 0) {
      const subRouting = routeWires(comp.subCircuit, placed)
      allWires.push(...subRouting.wires)
      // Recurse into deeper levels
      collectSubBoardWires(comp.subCircuit, placed, allWires)
    }
  }
}
