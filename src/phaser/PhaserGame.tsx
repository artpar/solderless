// React component wrapping Phaser.Game

import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { CircuitScene } from './CircuitScene'
import { PositionedBoard } from '../layout/layout'
import { CircuitBoard } from '../analysis/circuit-ir'
import { EventBus, BOARD_CHANGED, LAYERS_CHANGED, COMPONENT_HOVERED, COMPONENT_CLICKED, RESET_VIEWPORT } from './EventBus'

interface PhaserGameProps {
  positioned: PositionedBoard | null
  board: CircuitBoard | null
  layers: { showData: boolean; showClock: boolean; showException: boolean }
  onComponentHover?: (id: string | null) => void
  onComponentClick?: (id: string | null) => void
}

// Shared mutable store — scene reads from this when ready
export const sceneDataRef: {
  positioned: PositionedBoard | null
  board: CircuitBoard | null
  layers: { showData: boolean; showClock: boolean; showException: boolean }
} = {
  positioned: null,
  board: null,
  layers: { showData: true, showClock: true, showException: true },
}

export function PhaserGame({ positioned, board, layers, onComponentHover, onComponentClick }: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)

  // Always keep shared data up to date
  sceneDataRef.positioned = positioned
  sceneDataRef.board = board
  sceneDataRef.layers = layers

  // Create game on mount
  useEffect(() => {
    if (!containerRef.current) return

    const el = containerRef.current
    const dpr = window.devicePixelRatio || 1
    const cssW = el.clientWidth || 800
    const cssH = el.clientHeight || 600

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: el,
      backgroundColor: '#1a472a',
      scene: [CircuitScene],
      scale: {
        mode: Phaser.Scale.NONE,
        width: Math.round(cssW * dpr),
        height: Math.round(cssH * dpr),
        zoom: 1 / dpr,
      },
      render: {
        antialias: true,
        pixelArt: false,
      },
      input: {
        mouse: { preventDefaultWheel: false },
      },
      audio: { noAudio: true },
    })

    gameRef.current = game

    // Resize canvas to match container at native DPR resolution
    const onResize = () => {
      if (!gameRef.current) return
      const d = window.devicePixelRatio || 1
      const w = el.clientWidth || 800
      const h = el.clientHeight || 600
      gameRef.current.scale.setGameSize(Math.round(w * d), Math.round(h * d))
      gameRef.current.scale.setZoom(1 / d)
    }
    const observer = new ResizeObserver(onResize)
    observer.observe(el)

    return () => {
      observer.disconnect()
      game.destroy(true)
      gameRef.current = null
      // Clean up any leftover canvases (HMR safety)
      const canvases = el.querySelectorAll('canvas')
      canvases.forEach(c => c.remove())
    }
  }, [])

  // Notify scene of data changes (after initial mount)
  useEffect(() => {
    EventBus.emit(BOARD_CHANGED, { positioned, board })
  }, [positioned, board])

  useEffect(() => {
    EventBus.emit(LAYERS_CHANGED, layers)
  }, [layers])

  // Listen for component hover/click from Phaser
  useEffect(() => {
    const onHover = (id: string | null) => onComponentHover?.(id)
    const onClick = (id: string | null) => onComponentClick?.(id)
    EventBus.on(COMPONENT_HOVERED, onHover)
    EventBus.on(COMPONENT_CLICKED, onClick)
    return () => {
      EventBus.off(COMPONENT_HOVERED, onHover)
      EventBus.off(COMPONENT_CLICKED, onClick)
    }
  }, [onComponentHover, onComponentClick])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
    />
  )
}
