// CircuitBoard → Canvas render

import { useEffect, useRef, useCallback, useState } from 'react'
import { PositionedBoard } from '../layout/layout'
import { CircuitBoard } from '../analysis/circuit-ir'
import {
  render,
  RenderState,
  createDefaultRenderState,
  hitTest,
  getConnectedWires,
} from '../renderer/renderer'
import { ViewportState } from './useViewport'

export function useCanvasRenderer(
  positioned: PositionedBoard | null,
  board: CircuitBoard | null,
  viewport: ViewportState,
  layers: { showData: boolean; showClock: boolean; showException: boolean },
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [highlightedComp, setHighlightedComp] = useState<string | null>(null)
  const [highlightedWires, setHighlightedWires] = useState<Set<string>>(new Set())
  const [expandedSubcircuits, setExpandedSubcircuits] = useState<Set<string>>(new Set())
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })

  // Resize handler — updates canvasSize state to trigger re-render
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const w = parent.clientWidth
      const h = parent.clientHeight
      const dpr = window.devicePixelRatio || 1
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      setCanvasSize({ w, h })
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas.parentElement!)

    return () => observer.disconnect()
  }, [])

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !positioned || canvasSize.w === 0) return

    const state: RenderState = {
      ...createDefaultRenderState(),
      panX: viewport.panX,
      panY: viewport.panY,
      zoom: viewport.zoom,
      showData: layers.showData,
      showClock: layers.showClock,
      showException: layers.showException,
      highlightedComponentId: highlightedComp,
      highlightedWires,
      expandedSubcircuits,
    }

    render(canvas, positioned, state)
  }, [positioned, viewport, layers, highlightedComp, highlightedWires, expandedSubcircuits, canvasSize])

  // Mouse hover for highlighting
  const onCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas || !positioned || !board) return

      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      const compId = hitTest(
        positioned,
        {
          ...createDefaultRenderState(),
          panX: viewport.panX,
          panY: viewport.panY,
          zoom: viewport.zoom,
        },
        canvasSize.w,
        canvasSize.h,
        x,
        y,
      )

      setHighlightedComp(compId)
      if (compId) {
        setHighlightedWires(getConnectedWires(board, compId))
      } else {
        setHighlightedWires(new Set())
      }
    },
    [positioned, board, viewport, canvasSize],
  )

  // Click to expand/collapse subcircuits
  const onCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas || !positioned || !board) return

      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      const compId = hitTest(
        positioned,
        {
          ...createDefaultRenderState(),
          panX: viewport.panX,
          panY: viewport.panY,
          zoom: viewport.zoom,
        },
        canvasSize.w,
        canvasSize.h,
        x,
        y,
      )

      if (!compId) return

      // Check if clicked component is a subcircuit
      const comp = board.components.find((c) => c.id === compId)
      if (comp?.subCircuit) {
        setExpandedSubcircuits((prev) => {
          const next = new Set(prev)
          if (next.has(compId)) {
            next.delete(compId)
          } else {
            next.add(compId)
          }
          return next
        })
      }
    },
    [positioned, board, viewport, canvasSize],
  )

  return {
    canvasRef,
    onCanvasMouseMove,
    onCanvasClick,
    highlightedComp,
  }
}
