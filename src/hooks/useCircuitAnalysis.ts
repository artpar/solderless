// Source string → CircuitBoard (memoized)
// Supports single-file mode and project mode

import { useMemo } from 'react'
import { CircuitBoard } from '../analysis/circuit-ir'
import { buildCircuit } from '../analysis/ast-to-circuit'
import { buildProjectCircuit } from '../analysis/project-circuit'
import { PositionedBoard, layoutBoard } from '../layout/layout'
import { ProjectFile } from '../analysis/project-loader'

export function useCircuitAnalysis(source: string): {
  board: CircuitBoard | null
  positioned: PositionedBoard | null
  error: string | null
} {
  return useMemo(() => {
    if (!source.trim()) {
      return { board: null, positioned: null, error: null }
    }

    try {
      const board = buildCircuit(source)
      const positioned = layoutBoard(board)
      return { board, positioned, error: null }
    } catch (e) {
      return {
        board: null,
        positioned: null,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  }, [source])
}

export function useProjectAnalysis(files: ProjectFile[] | null, projectName: string): {
  board: CircuitBoard | null
  positioned: PositionedBoard | null
  error: string | null
} {
  return useMemo(() => {
    if (!files || files.length === 0) {
      return { board: null, positioned: null, error: null }
    }

    try {
      const board = buildProjectCircuit(files, projectName)
      const positioned = layoutBoard(board)
      return { board, positioned, error: null }
    } catch (e) {
      return {
        board: null,
        positioned: null,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  }, [files, projectName])
}
