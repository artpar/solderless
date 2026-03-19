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
import { EventBus, BOARD_CHANGED, LAYERS_CHANGED, COMPONENT_HOVERED, COMPONENT_CLICKED, TOGGLE_COLLAPSE, RESET_VIEWPORT, ANGLE_CHANGED, ROTATION_CHANGED } from './EventBus'
import { hexToNum } from './util'
import { toIsometric, setIsoAngle, getIsoAngle, setIsoRotation, getIsoRotation } from '../layout/isometric'
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
  private pressedKeys = new Set<string>()

  constructor() {
    super({ key: 'CircuitScene' })
  }

  create(): void {
    this.alive = true
    this.cameras.main.setBackgroundColor(hexToNum(COLORS.boardBg))
    this.cameras.main.setRoundPixels(true)

    // --- Camera controls ---
    this.setupControls()

    // Clean up EventBus listeners when Phaser destroys this scene
    this.events.on('destroy', () => this.shutdown())

    // EventBus listeners for subsequent updates
    EventBus.on(BOARD_CHANGED, this.onBoardChanged, this)
    EventBus.on(LAYERS_CHANGED, this.onLayersChanged, this)
    EventBus.on(RESET_VIEWPORT, this.resetCamera, this)
    EventBus.on(ANGLE_CHANGED, this.onAngleChanged, this)
    EventBus.on(ROTATION_CHANGED, this.onRotationChanged, this)

    // Camera will be centered on board after buildScene

    // Read initial data from shared ref (avoids race with EventBus)
    this.positioned = sceneDataRef.positioned
    this.board = sceneDataRef.board
    this.layers = { ...sceneDataRef.layers }
    if (this.positioned) {
      this.buildScene()
    }
  }

  private rebuildTimer: number | null = null

  update(): void {
    if (!this.alive) return
    const cam = this.cameras.main
    const speed = 300 / cam.zoom
    const dt = this.game.loop.delta / 1000

    // WASD / Arrow keys — pan
    let dx = 0
    let dy = 0
    if (this.pressedKeys.has('a') || this.pressedKeys.has('arrowleft')) dx -= speed * dt
    if (this.pressedKeys.has('d') || this.pressedKeys.has('arrowright')) dx += speed * dt
    if (this.pressedKeys.has('w') || this.pressedKeys.has('arrowup')) dy -= speed * dt
    if (this.pressedKeys.has('s') || this.pressedKeys.has('arrowdown')) dy += speed * dt

    if (dx !== 0 || dy !== 0) {
      const cos = Math.cos(-cam.rotation)
      const sin = Math.sin(-cam.rotation)
      cam.scrollX += dx * cos - dy * sin
      cam.scrollY += dx * sin + dy * cos
    }

    // Q/E — continuous rotation, R/F — continuous tilt
    const rotSpeed = 60 // degrees per second
    const tiltSpeed = 25
    let viewChanged = false

    if (this.pressedKeys.has('q')) {
      setIsoRotation(getIsoRotation() - rotSpeed * dt)
      viewChanged = true
    } else if (this.pressedKeys.has('e')) {
      setIsoRotation(getIsoRotation() + rotSpeed * dt)
      viewChanged = true
    }
    if (this.pressedKeys.has('r')) {
      setIsoAngle(getIsoAngle() + tiltSpeed * dt)
      viewChanged = true
    } else if (this.pressedKeys.has('f')) {
      setIsoAngle(getIsoAngle() - tiltSpeed * dt)
      viewChanged = true
    }

    if (viewChanged) {
      this.scheduleRebuild(true)
    }
  }

  /** Throttled rebuild — at most once per 33ms (~30fps) while view is changing */
  private scheduleRebuild(preserveCamera = false): void {
    if (this.rebuildTimer !== null) return
    this.rebuildTimer = window.setTimeout(() => {
      this.rebuildTimer = null
      this.buildScene(preserveCamera)
    }, 33)
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
      applyDiff(this, diff, this.componentObjects, this.wireObjects, this.layers, data.positioned.colorContext)
    } else {
      this.buildScene()
    }
  }

  private onLayersChanged = (layers: Layers) => {
    if (!this.alive) return
    this.layers = layers
    this.updateWireVisibility()
  }

  private onAngleChanged = (degrees: number) => {
    if (!this.alive) return
    setIsoAngle(degrees)
    this.buildScene(true)
  }

  private onRotationChanged = (degrees: number) => {
    if (!this.alive) return
    setIsoRotation(degrees)
    this.buildScene(true)
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

    // Keyboard shortcuts (skip when typing in inputs)
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const key = e.key.toLowerCase()
      this.pressedKeys.add(key)

      // Home — reset view (discrete)
      if (key === 'home') {
        setIsoAngle(26.57)
        setIsoRotation(0)
        this.buildScene()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      this.pressedKeys.delete(e.key.toLowerCase())
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    this.nativeListeners.push(() => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    })
  }

  private resetCamera = () => {
    if (!this.alive) return
    this.cameras.main.rotation = 0
    setIsoAngle(26.57)
    setIsoRotation(0)
    this.buildScene()
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

  buildScene(preserveCamera = false): void {
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
      const g = createWireObject(this, routed, highlighted, this.positioned.colorContext)
      const NESTING_STEP = 30
      const rawZ = routed.points[0]?.z ?? 0
      const nestingZ = Math.floor(rawZ / NESTING_STEP) * NESTING_STEP
      g.setDepth(nestingZ * 1000 - 1)
      this.wireObjects.push(g)
    }
    this.updateWireVisibility()

    // Components (depth sorted)
    const sorted = sortByDepth(placed)
    sorted.forEach((pc, index) => {
      const container = createComponentObject(this, pc, this.positioned!.colorContext)
      container.setDepth(pc.worldZ * 1000 + index)

      container.on('pointerover', () => {
        this.highlightComponent(pc.component.id)
        EventBus.emit(COMPONENT_HOVERED, pc.component.id)
      })
      container.on('pointerout', () => {
        this.clearHighlight()
        EventBus.emit(COMPONENT_HOVERED, null)
      })
      container.on('pointerdown', () => {
        // Toggle collapse on subcircuit click
        if (pc.component.kind === 'subcircuit' && pc.component.subCircuit) {
          EventBus.emit(TOGGLE_COLLAPSE, pc.component.id)
        }
        EventBus.emit(COMPONENT_CLICKED, pc.component.id)
      })

      this.componentObjects.set(pc.component.id, container)
    })

    // Tooltip
    this.tooltip = createTooltip(this)

    // Center camera on board (skip when just rotating/tilting)
    if (!preserveCamera) this.centerOnBoard()
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
      const g = createWireObject(this, routed, highlighted, this.positioned.colorContext)
      const NESTING_STEP = 30
      const rawZ = routed.points[0]?.z ?? 0
      const nestingZ = Math.floor(rawZ / NESTING_STEP) * NESTING_STEP
      g.setDepth(nestingZ * 1000 - 1)
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
    if (this.rebuildTimer !== null) {
      clearTimeout(this.rebuildTimer)
      this.rebuildTimer = null
    }
    this.nativeListeners.forEach(fn => fn())
    this.nativeListeners = []
    EventBus.off(BOARD_CHANGED, this.onBoardChanged, this)
    EventBus.off(LAYERS_CHANGED, this.onLayersChanged, this)
    EventBus.off(RESET_VIEWPORT, this.resetCamera, this)
    EventBus.off(ANGLE_CHANGED, this.onAngleChanged, this)
    EventBus.off(ROTATION_CHANGED, this.onRotationChanged, this)
  }
}
