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
  private lastPointer = { x: 0, y: 0 }
  private pinchStartDist = 0
  private pinchStartZoom = 1
  private pinchStartAngle = 0
  private pinchStartRotation = 0
  private alive = false

  constructor() {
    super({ key: 'CircuitScene' })
  }

  create(): void {
    this.alive = true
    this.cameras.main.setBackgroundColor(hexToNum(COLORS.boardBg))
    this.cameras.main.setRoundPixels(true)

    // --- Camera controls ---

    // Left-drag to pan
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        this.isDragging = true
        this.lastPointer = { x: pointer.x, y: pointer.y }
      }
    })

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isDragging && pointer.leftButtonDown()) {
        const dx = pointer.x - this.lastPointer.x
        const dy = pointer.y - this.lastPointer.y
        this.lastPointer = { x: pointer.x, y: pointer.y }

        const cam = this.cameras.main
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
    })

    // Scroll wheel: zoom toward cursor
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _gameObjects: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main
      const oldZoom = cam.zoom
      const factor = dy > 0 ? 0.9 : 1.1
      const newZoom = Phaser.Math.Clamp(oldZoom * factor, 0.1, 5.0)

      // Zoom toward pointer position
      const worldBefore = cam.getWorldPoint(pointer.x, pointer.y)
      cam.zoom = newZoom
      const worldAfter = cam.getWorldPoint(pointer.x, pointer.y)
      cam.scrollX += worldBefore.x - worldAfter.x
      cam.scrollY += worldBefore.y - worldAfter.y
    })

    // Pinch zoom + rotate (trackpad / touch)
    this.input.addPointer(1) // support 2 pointers
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const pointers = this.input.manager.pointers.filter(p => p.isDown)
      if (pointers.length === 2) {
        this.isDragging = false // cancel single-finger pan
        const [p1, p2] = pointers
        this.pinchStartDist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y)
        this.pinchStartZoom = this.cameras.main.zoom
        this.pinchStartAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
        this.pinchStartRotation = this.cameras.main.rotation
      }
    })

    this.input.on('pointermove', () => {
      const pointers = this.input.manager.pointers.filter(p => p.isDown)
      if (pointers.length === 2) {
        const [p1, p2] = pointers
        const cam = this.cameras.main

        // Pinch zoom
        const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y)
        if (this.pinchStartDist > 0) {
          const scale = dist / this.pinchStartDist
          cam.zoom = Phaser.Math.Clamp(this.pinchStartZoom * scale, 0.1, 5.0)
        }

        // Two-finger rotate
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
        cam.rotation = this.pinchStartRotation + (angle - this.pinchStartAngle)
      }
    })

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
    EventBus.off(BOARD_CHANGED, this.onBoardChanged, this)
    EventBus.off(LAYERS_CHANGED, this.onLayersChanged, this)
    EventBus.off(RESET_VIEWPORT, this.resetCamera, this)
  }
}
