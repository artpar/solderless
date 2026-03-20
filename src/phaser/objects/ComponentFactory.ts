// Creates Phaser GameObjects for each PlacedComponent

import Phaser from 'phaser'
import { PlacedComponent } from '../../layout/placement'
import { toIsometric } from '../../layout/isometric'
import { COLORS, getComponentColor } from '../../shared/colors'
import { ColorContext } from '../../shared/semantic-colors'
import { drawIsoBoxOnGraphics, getTopFacePoints } from './IsoBox'
import { drawTypePinsOnGraphics } from './TypePins'
import { hexToNum, textStyle } from '../util'

export function createComponentObject(
  scene: Phaser.Scene,
  pc: PlacedComponent,
  colorContext?: ColorContext,
): Phaser.GameObjects.Container {
  const { component } = pc

  switch (component.kind) {
    case 'gate': return createGate(scene, pc, colorContext)
    case 'mux': return createLabeledBox(scene, pc, 'MUX', colorContext)
    case 'demux': return createLabeledBox(scene, pc, 'DEMUX', colorContext)
    case 'subcircuit': return createSubcircuit(scene, pc, colorContext)
    case 'register': return createRegister(scene, pc, colorContext)
    case 'connector': return createConnector(scene, pc, colorContext)
    case 'latch': return createLatch(scene, pc, colorContext)
    case 'io-port': return createIoPort(scene, pc, colorContext)
    case 'constant': return createConstant(scene, pc, colorContext)
    case 'comparator': return createComparator(scene, pc, colorContext)
    case 'named-wire': return createNamedWire(scene, pc, colorContext)
    default: return createGate(scene, pc, colorContext)
  }
}

// --- Shared helpers ---

function makeContainer(scene: Phaser.Scene, pc: PlacedComponent, colorContext?: ColorContext): {
  container: Phaser.GameObjects.Container
  g: Phaser.GameObjects.Graphics
  color: string
} {
  const container = scene.add.container(0, 0)
  const g = scene.add.graphics()
  const color = colorContext?.componentBodyColor.get(pc.component.id)
    ?? getComponentColor(pc.component.kind, pc.component.isReachable)

  drawIsoBoxOnGraphics(g, pc.worldX, pc.worldY, pc.worldZ,
    pc.width, pc.height, pc.depth, color, pc.component.isReachable)

  container.add(g)

  // Set interactive with full iso box hit area
  const hitPoly = getTopFacePoints(pc.worldX, pc.worldY, pc.worldZ,
    pc.width, pc.height, pc.depth)
  container.setInteractive(hitPoly, Phaser.Geom.Polygon.Contains)

  return { container, g, color }
}

function addCenterText(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  pc: PlacedComponent,
  text: string,
  opts: { font?: string; fontSize?: string; color?: string; offsetY?: number } = {},
): Phaser.GameObjects.Text {
  const center = toIsometric({
    x: pc.worldX + pc.width / 2,
    y: pc.worldY + pc.height / 2,
    z: pc.worldZ + pc.depth,
  })

  const { component: comp } = pc
  const textColor = comp.isReachable ? (opts.color ?? COLORS.labelText) : COLORS.deadLabel

  const t = scene.add.text(
    center.sx,
    center.sy + (opts.offsetY ?? 0),
    text,
    textStyle({
      fontSize: opts.fontSize ?? '10px',
      fontStyle: opts.font ?? '',
      color: textColor,
      align: 'center',
    }),
  )
  t.setOrigin(0.5, 0.5)
  if (!comp.isReachable) t.setAlpha(0.4)
  container.add(t)
  return t
}

function addTypePins(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  g: Phaser.GameObjects.Graphics,
  pc: PlacedComponent,
): void {
  const { component: comp, worldX, worldY, worldZ, width, height, depth } = pc

  const inputTexts = drawTypePinsOnGraphics(scene, g, worldX, worldY, worldZ,
    width, height, depth, comp.inputPins, 'input', comp.isReachable)
  // Filter out exception pins — they are wiring-only, not visual type blocks
  const visibleOutputPins = comp.outputPins.filter(p => p.kind !== 'exception')
  const outputTexts = drawTypePinsOnGraphics(scene, g, worldX, worldY, worldZ,
    width, height, depth, visibleOutputPins, 'output', comp.isReachable)

  for (const t of [...inputTexts, ...outputTexts]) {
    container.add(t)
  }
}

// --- Component types ---

function createGate(scene: Phaser.Scene, pc: PlacedComponent, colorContext?: ColorContext): Phaser.GameObjects.Container {
  const { container, g } = makeContainer(scene, pc, colorContext)
  const { component: comp } = pc

  // Operation symbol
  addCenterText(scene, container, pc, comp.operation, {
    font: 'bold', fontSize: '14px', offsetY: -2,
  })

  // Label below (if different from operation)
  if (comp.label !== comp.operation) {
    addCenterText(scene, container, pc, comp.label.slice(0, 15), {
      fontSize: '10px', color: COLORS.pinText, offsetY: 12,
    })
  }

  addTypePins(scene, container, g, pc)
  return container
}

function createLabeledBox(
  scene: Phaser.Scene,
  pc: PlacedComponent,
  mainLabel: string,
  colorContext?: ColorContext,
): Phaser.GameObjects.Container {
  const { container, g } = makeContainer(scene, pc, colorContext)
  const { component: comp } = pc

  addCenterText(scene, container, pc, mainLabel, {
    font: 'bold', fontSize: '12px', offsetY: -2,
  })
  addCenterText(scene, container, pc, comp.label.slice(0, 12), {
    fontSize: '11px', color: COLORS.pinText, offsetY: 10,
  })

  addTypePins(scene, container, g, pc)
  return container
}

function createRegister(scene: Phaser.Scene, pc: PlacedComponent, colorContext?: ColorContext): Phaser.GameObjects.Container {
  const { container, g } = makeContainer(scene, pc, colorContext)
  const { component: comp } = pc

  addCenterText(scene, container, pc, comp.label.slice(0, 12), {
    font: 'bold', fontSize: '12px', offsetY: -2,
  })
  addCenterText(scene, container, pc, comp.operation, {
    fontSize: '11px', color: COLORS.pinText, offsetY: 10,
  })

  addTypePins(scene, container, g, pc)
  return container
}

function createConnector(scene: Phaser.Scene, pc: PlacedComponent, colorContext?: ColorContext): Phaser.GameObjects.Container {
  const { container, g } = makeContainer(scene, pc, colorContext)
  const { component: comp } = pc

  let symbol = '\u25CF' // ●
  if (comp.operation.startsWith('import')) symbol = '\u2192' // →
  if (comp.operation.startsWith('export')) symbol = '\u2190' // ←
  if (comp.operation === 'return') symbol = '\u21A9' // ↩
  if (comp.operation === 'throw') symbol = '\u26A1' // ⚡

  const center = toIsometric({
    x: pc.worldX + pc.width / 2,
    y: pc.worldY + pc.height / 2,
    z: pc.worldZ + pc.depth,
  })

  const textColor = comp.isReachable ? COLORS.labelText : COLORS.deadLabel

  const symbolText = scene.add.text(
    center.sx - 15, center.sy, symbol,
    textStyle({ fontSize: '11px', fontStyle: 'bold', color: textColor }),
  )
  symbolText.setOrigin(0.5, 0.5)
  container.add(symbolText)

  const label = comp.label.length > 15 ? comp.label.slice(0, 13) + '..' : comp.label
  const labelText = scene.add.text(
    center.sx + 5, center.sy, label,
    textStyle({ fontSize: '10px', color: textColor }),
  )
  labelText.setOrigin(0.5, 0.5)
  container.add(labelText)

  addTypePins(scene, container, g, pc)
  return container
}

function createLatch(scene: Phaser.Scene, pc: PlacedComponent, colorContext?: ColorContext): Phaser.GameObjects.Container {
  const { container, g } = makeContainer(scene, pc, colorContext)

  addCenterText(scene, container, pc, 'AWAIT', {
    font: 'bold', fontSize: '12px', offsetY: -2,
  })
  addCenterText(scene, container, pc, '\u23F3 latch', {
    fontSize: '11px', color: COLORS.clockWire, offsetY: 10,
  })

  addTypePins(scene, container, g, pc)
  return container
}

function createIoPort(scene: Phaser.Scene, pc: PlacedComponent, colorContext?: ColorContext): Phaser.GameObjects.Container {
  const { container, g } = makeContainer(scene, pc, colorContext)

  addCenterText(scene, container, pc, pc.component.label.slice(0, 12), {
    font: 'bold', fontSize: '10px',
  })

  addTypePins(scene, container, g, pc)
  return container
}

function createConstant(scene: Phaser.Scene, pc: PlacedComponent, colorContext?: ColorContext): Phaser.GameObjects.Container {
  const { container, g } = makeContainer(scene, pc, colorContext)

  addCenterText(scene, container, pc, pc.component.label.slice(0, 12), {
    fontSize: '10px', color: '#88bb88',
  })

  return container
}

function createComparator(scene: Phaser.Scene, pc: PlacedComponent, colorContext?: ColorContext): Phaser.GameObjects.Container {
  // Start with a gate
  const container = createGate(scene, pc, colorContext)

  // Add diamond decoration on top
  const center = toIsometric({
    x: pc.worldX + pc.width / 2,
    y: pc.worldY + pc.height / 2,
    z: pc.worldZ + pc.depth + 2,
  })

  const dg = scene.add.graphics()
  const s = 4
  dg.lineStyle(1, hexToNum(COLORS.clockWire), 1)
  dg.beginPath()
  dg.moveTo(center.sx, center.sy - s - 12)
  dg.lineTo(center.sx + s, center.sy - 12)
  dg.lineTo(center.sx, center.sy + s - 12)
  dg.lineTo(center.sx - s, center.sy - 12)
  dg.closePath()
  dg.strokePath()
  container.add(dg)

  return container
}

function createNamedWire(scene: Phaser.Scene, pc: PlacedComponent, colorContext?: ColorContext): Phaser.GameObjects.Container {
  const { container, g } = makeContainer(scene, pc, colorContext)

  addCenterText(scene, container, pc, pc.component.label.slice(0, 12), {
    font: 'bold', fontSize: '10px', color: COLORS.dataWire,
  })

  return container
}

function createSubcircuit(scene: Phaser.Scene, pc: PlacedComponent, colorContext?: ColorContext): Phaser.GameObjects.Container {
  if (pc.component.collapsed) {
    return createChip(scene, pc, colorContext)
  }
  if (pc.isContainer) {
    return createPlatform(scene, pc, colorContext)
  }
  return createChip(scene, pc, colorContext)
}

function createPlatform(scene: Phaser.Scene, pc: PlacedComponent, colorContext?: ColorContext): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0)
  const g = scene.add.graphics()
  const { component: comp, worldX, worldY, worldZ, width, height, platformDepth } = pc
  const color = colorContext?.componentBodyColor.get(comp.id)
    ?? getComponentColor(comp.kind, comp.isReachable)

  // Entry point glow
  if (comp.isEntryPoint) {
    const glowG = scene.add.graphics()
    drawIsoBoxOnGraphics(glowG, worldX - 3, worldY - 3, worldZ - 1,
      width + 6, height + 6, platformDepth + 2, '#44aa66', true)
    glowG.setAlpha(0.3)
    container.add(glowG)
  }

  drawIsoBoxOnGraphics(g, worldX, worldY, worldZ, width, height, platformDepth, color, comp.isReachable)
  container.add(g)

  // Label on front face
  const labelPos = toIsometric({
    x: worldX + 8,
    y: worldY + height,
    z: worldZ + platformDepth / 2,
  })

  const textColor = comp.isReachable ? COLORS.labelText : COLORS.deadLabel
  const label = comp.label.length > 30 ? comp.label.slice(0, 28) + '..' : comp.label
  const labelText = scene.add.text(
    labelPos.sx, labelPos.sy, label,
    textStyle({ fontSize: '12px', fontStyle: 'bold', color: textColor }),
  )
  labelText.setOrigin(0, 0.5)
  container.add(labelText)

  // Operation type
  const opPos = toIsometric({
    x: worldX + 8,
    y: worldY + height,
    z: worldZ + platformDepth / 2 - 6,
  })
  const opText = scene.add.text(
    opPos.sx, opPos.sy + 12, comp.operation,
    textStyle({ fontSize: '11px', color: COLORS.pinText }),
  )
  opText.setOrigin(0, 0.5)
  container.add(opText)

  // Hit area for platform
  const hitPoly = getTopFacePoints(worldX, worldY, worldZ, width, height, platformDepth)
  container.setInteractive(hitPoly, Phaser.Geom.Polygon.Contains)

  return container
}

function createChip(scene: Phaser.Scene, pc: PlacedComponent, colorContext?: ColorContext): Phaser.GameObjects.Container {
  const { container, g } = makeContainer(scene, pc, colorContext)
  const { component: comp, worldX, worldY, worldZ, width, height, depth } = pc

  // Entry point glow
  if (comp.isEntryPoint) {
    const glowG = scene.add.graphics()
    drawIsoBoxOnGraphics(glowG, worldX - 3, worldY - 3, worldZ - 1,
      width + 6, height + 6, depth + 2, '#44aa66', true)
    glowG.setAlpha(0.3)
    container.addAt(glowG, 0)

    // Entry point badge
    addCenterText(scene, container, pc, '\u2605 entry', {
      fontSize: '8px', color: '#66dd88', offsetY: -16,
    })
  }

  // IC notch
  const notchLeft = toIsometric({ x: worldX + width * 0.35, y: worldY, z: worldZ + depth + 1 })
  const notchRight = toIsometric({ x: worldX + width * 0.65, y: worldY, z: worldZ + depth + 1 })
  const notchG = scene.add.graphics()
  notchG.lineStyle(2, hexToNum(comp.isReachable ? COLORS.compBorder : COLORS.deadComp), 1)
  notchG.beginPath()
  notchG.arc(
    (notchLeft.sx + notchRight.sx) / 2,
    (notchLeft.sy + notchRight.sy) / 2,
    6, 0, Math.PI, false,
  )
  notchG.strokePath()
  container.add(notchG)

  // Label
  const label = comp.label.length > 20 ? comp.label.slice(0, 18) + '..' : comp.label
  addCenterText(scene, container, pc, label, {
    font: 'bold', fontSize: '11px', offsetY: -4,
  })

  // Operation type
  addCenterText(scene, container, pc, comp.operation, {
    fontSize: '11px', color: COLORS.pinText, offsetY: 8,
  })

  // Expand/collapse hint
  if (comp.subCircuit) {
    const hint = comp.collapsed ? '\u25B6 expand' : '\u25B6 expand'
    addCenterText(scene, container, pc, hint, {
      fontSize: '8px', color: comp.isReachable ? '#55aa55' : COLORS.deadComp, offsetY: 18,
    })
  }

  // Skip type pin blocks for file/module subcircuit chips — too many pins create visual noise
  if (!comp.subCircuit) {
    addTypePins(scene, container, g, pc)
  }
  return container
}
