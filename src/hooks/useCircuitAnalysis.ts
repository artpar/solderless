// Source string → CircuitBoard (memoized)
// Supports single-file mode and project mode

import { useMemo, useRef } from 'react'
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
  const boardRef = useRef<CircuitBoard | null>(null)
  const prevSource = useRef('')

  return useMemo(() => {
    if (!source.trim()) {
      boardRef.current = null
      prevSource.current = ''
      return { board: null, positioned: null, error: null }
    }

    try {
      // Only rebuild the board if source changed
      if (source !== prevSource.current) {
        boardRef.current = buildCircuit(source)
        prevSource.current = source
      }
      const board = boardRef.current!
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
  const boardRef = useRef<CircuitBoard | null>(null)
  const prevFiles = useRef<ProjectFile[] | null>(null)
  const prevName = useRef('')

  return useMemo(() => {
    if (!files || files.length === 0) {
      boardRef.current = null
      prevFiles.current = null
      prevName.current = ''
      return { board: null, positioned: null, error: null }
    }

    try {
      // Only rebuild board if files/name changed
      if (files !== prevFiles.current || projectName !== prevName.current) {
        boardRef.current = buildProjectCircuit(files, projectName)
        prevFiles.current = files
        prevName.current = projectName
      }
      const board = boardRef.current!
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
