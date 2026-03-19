// Main Phaser scene for circuit board visualization

import Phaser from 'phaser'
import { PositionedBoard } from '../layout/layout'
import { CircuitBoard } from '../analysis/circuit-ir'
import { sortByDepth } from '../shared/z-order'
import { COLORS, getConnectedWires } from './sceneHelpers'
import { createBoardBackground } from './objects/BoardBackground'
import { createComponentObject } from './objects/ComponentFactory'
import { createWireObject } from './objects/WireFactory'
import { createTooltip, TooltipContainer } from './objects/Tooltip'
import { diffBoards, applyDiff } from './DiffEngine'
import { EventBus, BOARD_CHANGED, LAYERS_CHANGED, COMPONENT_HOVERED, COMPONENT_CLICKED, RESET_VIEWPORT } from './EventBus'
import { hexToNum } from './util'
import { toIsometric } from '../layout/isometric'
import { sceneDataRef } from './PhaserGame'

interface Layers {
  showData: boolean
  showClock: boolean
  showException: boolean
}

export class CircuitScene extends Phaser.Scene {
  private positioned: PositionedBoard | null = null
  private board: CircuitBoard | null = null
  private layers: Layers = { showData: true, showClock: true, showException: true }

  private boardBgContainer: Phaser.GameObjects.Container | null = null
  private componentObjects: Map<string, Phaser.GameObjects.Container> = new Map()
  private wireObjects: Phaser.GameObjects.Graphics[] = []

  private highlightedCompId: string | null = null
  private highlightedWireIds: Set<string> = new Set()
  private tooltip: TooltipContainer | null = null

  private isDragging = false
  private isRotating = false
  private lastPointer = { x: 0, y: 0 }
  private alive = false

  constructor() {
    super({ key: 'CircuitScene' })
  }

  create(): void {
    this.alive = true
    this.cameras.main.setBackgroundColor(hexToNum(COLORS.boardBg))
    this.cameras.main.setRoundPixels(true)

    // --- Camera controls ---
    this.setupControls()

    // EventBus listeners for subsequent updates
    EventBus.on(BOARD_CHANGED, this.onBoardChanged, this)
    EventBus.on(LAYERS_CHANGED, this.onLayersChanged, this)
    EventBus.on(RESET_VIEWPORT, this.resetCamera, this)

    // Camera will be centered on board after buildScene

    // Read initial data from shared ref (avoids race with EventBus)
    this.positioned = sceneDataRef.positioned
    this.board = sceneDataRef.board
    this.layers = { ...sceneDataRef.layers }
    if (this.positioned) {
      this.buildScene()
    }
  }

  private onBoardChanged = (data: { positioned: PositionedBoard | null; board: CircuitBoard | null }) => {
    if (!this.alive) return

    const prevPositioned = this.positioned
    this.positioned = data.positioned
    this.board = data.board

    if (!data.positioned) {
      this.clearScene()
      return
    }

    if (prevPositioned) {
      const diff = diffBoards(prevPositioned, data.positioned)
      applyDiff(this, diff, this.componentObjects, this.wireObjects, this.layers)
    } else {
      this.buildScene()
    }
  }

  private onLayersChanged = (layers: Layers) => {
    if (!this.alive) return
    this.layers = layers
    this.updateWireVisibility()
  }

  private nativeListeners: (() => void)[] = []

  private setupControls(): void {
    const canvas = this.game.canvas

    // Left-drag to pan, Shift+left-drag to rotate
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        this.lastPointer = { x: pointer.x, y: pointer.y }
        if (pointer.event.shiftKey) {
          this.isRotating = true
        } else {
          this.isDragging = true
        }
      }
    })

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) return
      const dx = pointer.x - this.lastPointer.x
      const dy = pointer.y - this.lastPointer.y
      this.lastPointer = { x: pointer.x, y: pointer.y }

      const cam = this.cameras.main

      if (this.isRotating) {
        // Horizontal drag rotates the view
        cam.rotation += dx * 0.003
      } else if (this.isDragging) {
        // Account for camera rotation when panning
        const cos = Math.cos(-cam.rotation)
        const sin = Math.sin(-cam.rotation)
        const worldDx = (dx * cos - dy * sin) / cam.zoom
        const worldDy = (dx * sin + dy * cos) / cam.zoom
        cam.scrollX -= worldDx
        cam.scrollY -= worldDy
      }
    })

    this.input.on('pointerup', () => {
      this.isDragging = false
      this.isRotating = false
    })

    // Scroll wheel: zoom toward cursor (smooth, proportional to dy)
    // ctrlKey+wheel = trackpad pinch (same behavior)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const cam = this.cameras.main

      // Normalize delta: trackpad pinch sends ctrlKey+wheel with small deltas,
      // mouse wheel sends larger discrete deltas
      let delta = e.deltaY
      if (e.deltaMode === 1) delta *= 16 // line mode → pixels
      // Clamp to avoid extreme jumps from momentum scrolling
      delta = Math.max(-100, Math.min(100, delta))

      const zoomFactor = 1 - delta * 0.002
      const oldZoom = cam.zoom
      const newZoom = Phaser.Math.Clamp(oldZoom * zoomFactor, 0.1, 5.0)

      // Convert CSS cursor position to game-space coords
      const rect = canvas.getBoundingClientRect()
      const gameX = (e.clientX - rect.left) * (canvas.width / rect.width)
      const gameY = (e.clientY - rect.top) * (canvas.height / rect.height)

      // Zoom toward cursor: adjust scroll so the world point under the cursor stays fixed
      // worldX = scrollX + originX + (gameX - originX) / zoom
      const originX = cam.width * 0.5
      const originY = cam.height * 0.5
      const zoomDiff = 1 / oldZoom - 1 / newZoom
      cam.scrollX += (gameX - originX) * zoomDiff
      cam.scrollY += (gameY - originY) * zoomDiff
      cam.zoom = newZoom
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    this.nativeListeners.push(() => canvas.removeEventListener('wheel', onWheel))

    // Safari gesturechange: trackpad rotate
    const onGesture = (e: Event) => {
      e.preventDefault()
      const ge = e as unknown as { rotation: number }
      if (typeof ge.rotation === 'number') {
        this.cameras.main.rotation = ge.rotation * (Math.PI / 180)
      }
    }
    canvas.addEventListener('gesturechange', onGesture, { passive: false } as EventListenerOptions)
    this.nativeListeners.push(() => canvas.removeEventListener('gesturechange', onGesture))

    // Prevent Safari gesturestart default to avoid page zoom
    const onGestureStart = (e: Event) => e.preventDefault()
    canvas.addEventListener('gesturestart', onGestureStart, { passive: false } as EventListenerOptions)
    this.nativeListeners.push(() => canvas.removeEventListener('gesturestart', onGestureStart))
  }

  private resetCamera = () => {
    if (!this.alive) return
    this.cameras.main.rotation = 0
    this.centerOnBoard()
  }

  private centerOnBoard(): void {
    if (!this.positioned) {
      this.cameras.main.scrollX = 0
      this.cameras.main.scrollY = 0
      this.cameras.main.zoom = 1
      return
    }

    const { boardWidth, boardHeight } = this.positioned.placement

    // Compute isometric bounding box from board corners
    const corners = [
      toIsometric({ x: 0, y: 0, z: 0 }),
      toIsometric({ x: boardWidth, y: 0, z: 0 }),
      toIsometric({ x: 0, y: boardHeight, z: 0 }),
      toIsometric({ x: boardWidth, y: boardHeight, z: 0 }),
    ]

    const minSx = Math.min(...corners.map(c => c.sx))
    const maxSx = Math.max(...corners.map(c => c.sx))
    const minSy = Math.min(...corners.map(c => c.sy))
    const maxSy = Math.max(...corners.map(c => c.sy))

    const boardIsoW = maxSx - minSx
    const boardIsoH = maxSy - minSy
    const centerX = (minSx + maxSx) / 2
    const centerY = (minSy + maxSy) / 2

    const cam = this.cameras.main
    const viewW = cam.width
    const viewH = cam.height

    // Fit board with 15% margin
    const zoom = Math.min(viewW / boardIsoW, viewH / boardIsoH) * 0.85
    cam.zoom = Phaser.Math.Clamp(zoom, 0.1, 5.0)
    cam.centerOn(centerX, centerY)
  }

  private clearScene(): void {
    this.boardBgContainer?.destroy()
    this.boardBgContainer = null
    this.componentObjects.forEach(c => c.destroy())
    this.componentObjects.clear()
    this.wireObjects.forEach(w => w.destroy())
    this.wireObjects = []
    this.tooltip?.destroy()
    this.tooltip = null
  }

  buildScene(): void {
    if (!this.alive) return
    this.clearScene()
    if (!this.positioned) return

    const { placement, routing } = this.positioned
    const { boardWidth, boardHeight, placed } = placement

    // Board background
    this.boardBgContainer = createBoardBackground(this, boardWidth, boardHeight)
    this.boardBgContainer.setDepth(-1000)

    // Wires (behind components)
    for (const routed of routing.wires) {
      const highlighted = this.highlightedWireIds.has(routed.wire.id)
      const g = createWireObject(this, routed, highlighted)
      g.setDepth(-500)
      this.wireObjects.push(g)
    }
    this.updateWireVisibility()

    // Components (depth sorted)
    const sorted = sortByDepth(placed)
    sorted.forEach((pc, index) => {
      const container = createComponentObject(this, pc)
      container.setDepth(index)

      container.on('pointerover', () => {
        this.highlightComponent(pc.component.id)
        EventBus.emit(COMPONENT_HOVERED, pc.component.id)
      })
      container.on('pointerout', () => {
        this.clearHighlight()
        EventBus.emit(COMPONENT_HOVERED, null)
      })
      container.on('pointerdown', () => {
        EventBus.emit(COMPONENT_CLICKED, pc.component.id)
      })

      this.componentObjects.set(pc.component.id, container)
    })

    // Tooltip
    this.tooltip = createTooltip(this)

    // Center camera on board
    this.centerOnBoard()
  }

  highlightComponent(id: string): void {
    if (!this.alive || this.highlightedCompId === id) return

    this.clearHighlight()
    this.highlightedCompId = id

    const container = this.componentObjects.get(id)
    if (container) {
      container.setAlpha(1)
    }

    if (this.board) {
      this.highlightedWireIds = getConnectedWires(this.board, id)
      this.rebuildWires()
    }

    if (this.tooltip && this.positioned) {
      const pc = this.positioned.placement.placed.find(p => p.component.id === id)
      if (pc) this.tooltip.show(pc)
    }
  }

  clearHighlight(): void {
    if (!this.alive) return
    if (this.highlightedCompId) {
      const prev = this.componentObjects.get(this.highlightedCompId)
      if (prev) {
        prev.setAlpha(1)
      }
    }
    this.highlightedCompId = null
    this.highlightedWireIds = new Set()
    this.rebuildWires()
    this.tooltip?.hide()
  }

  private rebuildWires(): void {
    if (!this.alive || !this.positioned) return
    this.wireObjects.forEach(w => w.destroy())
    this.wireObjects = []

    for (const routed of this.positioned.routing.wires) {
      const highlighted = this.highlightedWireIds.has(routed.wire.id)
      const g = createWireObject(this, routed, highlighted)
      g.setDepth(-500)
      this.wireObjects.push(g)
    }
    this.updateWireVisibility()
  }

  private updateWireVisibility(): void {
    if (!this.alive || !this.positioned) return
    const { routing } = this.positioned

    for (let i = 0; i < this.wireObjects.length && i < routing.wires.length; i++) {
      const routed = routing.wires[i]
      const visible =
        (routed.layer === 'data' && this.layers.showData) ||
        (routed.layer === 'control' && this.layers.showClock) ||
        (routed.layer === 'exception' && this.layers.showException)
      this.wireObjects[i].setVisible(visible)
    }
  }

  shutdown(): void {
    this.alive = false
    this.nativeListeners.forEach(fn => fn())
    this.nativeListeners = []
    EventBus.off(BOARD_CHANGED, this.onBoardChanged, this)
    EventBus.off(LAYERS_CHANGED, this.onLayersChanged, this)
    EventBus.off(RESET_VIEWPORT, this.resetCamera, this)
  }
}
