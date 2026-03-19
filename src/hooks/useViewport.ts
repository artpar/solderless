// Pan/zoom state for canvas

import { useCallback, useRef, useState } from 'react'

export interface ViewportState {
  panX: number
  panY: number
  zoom: number
}

export function useViewport() {
  const [viewport, setViewport] = useState<ViewportState>({
    panX: -100,
    panY: -50,
    zoom: 0.85,
  })

  const isDragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return

    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }

    setViewport((v) => ({
      ...v,
      panX: v.panX + dx,
      panY: v.panY + dy,
    }))
  }, [])

  const onMouseUp = useCallback(() => {
    isDragging.current = false
  }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setViewport((v) => ({
      ...v,
      zoom: Math.max(0.1, Math.min(5, v.zoom * delta)),
    }))
  }, [])

  const resetViewport = useCallback(() => {
    setViewport({ panX: 0, panY: 0, zoom: 1 })
  }, [])

  return {
    viewport,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onWheel,
    resetViewport,
  }
}
