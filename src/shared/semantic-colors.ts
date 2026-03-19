// Semantic coloring: type-tinted components, scope-colored wires, content-hashed subcircuit floors

import { CircuitBoard, Component, Wire, ScopeRegion, TypeTag } from '../analysis/circuit-ir'
import { COLORS, getComponentColor, getTypeColor } from './colors'

export interface ColorContext {
  componentBodyColor: Map<string, string>  // comp.id → hex
  wireColor: Map<string, string>           // wire.id → hex (data wires only)
}

// --- HSL utilities ---

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  s = Math.max(0, Math.min(100, s)) / 100
  l = Math.max(0, Math.min(100, l)) / 100

  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2

  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }

  const ri = Math.round((r + m) * 255)
  const gi = Math.round((g + m) * 255)
  const bi = Math.round((b + m) * 255)
  return `#${((ri << 16) | (gi << 8) | bi).toString(16).padStart(6, '0')}`
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = ((num >> 16) & 0xff) / 255
  const g = ((num >> 8) & 0xff) / 255
  const b = (num & 0xff) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min

  if (d === 0) return { h: 0, s: 0, l: l * 100 }

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (max === g) h = ((b - r) / d + 2) * 60
  else h = ((r - g) / d + 4) * 60

  return { h, s: s * 100, l: l * 100 }
}

function djb2(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return hash >>> 0
}

// --- Component color: blend type hue into kind color ---

const SKIP_BLEND_TYPES: Set<TypeTag> = new Set(['any', 'unknown'])

function blendTypeIntoKind(kindColor: string, typeTag: TypeTag): string {
  if (SKIP_BLEND_TYPES.has(typeTag)) return kindColor

  const kindHsl = hexToHsl(kindColor)
  const typeHsl = hexToHsl(getTypeColor(typeTag))

  // Shift kind hue 40% toward type hue (shortest arc)
  let dh = typeHsl.h - kindHsl.h
  if (dh > 180) dh -= 360
  if (dh < -180) dh += 360

  const blendedH = kindHsl.h + dh * 0.4
  return hslToHex(blendedH, kindHsl.s, kindHsl.l)
}

function getDominantOutputType(comp: Component): TypeTag | null {
  const pin = comp.outputPins[0] ?? comp.inputPins[0]
  if (!pin) return null
  return pin.typeShape.tag
}

function computeComponentColor(comp: Component, board: CircuitBoard): string {
  if (!comp.isReachable) return COLORS.deadComp

  // Subcircuit with body → content-hash floor color
  if (comp.kind === 'subcircuit' && comp.subCircuit && comp.subCircuit.components.length > 0) {
    return subcircuitFloorColor(comp.subCircuit)
  }

  // Everything else → blend type into kind
  const kindColor = getComponentColor(comp.kind, true)
  const typeTag = getDominantOutputType(comp)
  if (!typeTag) return kindColor

  return blendTypeIntoKind(kindColor, typeTag)
}

// --- Subcircuit floor color: content-hash based ---

function subcircuitFloorColor(subBoard: CircuitBoard): string {
  // Build sorted frequency vector of kind:operation pairs
  const freq = new Map<string, number>()
  for (const c of subBoard.components) {
    const key = `${c.kind}:${c.operation}`
    freq.set(key, (freq.get(key) ?? 0) + 1)
  }

  const vector = Array.from(freq.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`)
    .join(',')

  const hash = djb2(vector)
  // Full hue wheel but remap away from green (80–160) — the board background color
  // Map 0–280 of usable hue space onto the non-green portions: 160–360 and 0–80
  const slot = hash % 280
  const hue = slot < 200 ? 160 + slot : slot - 200 // 160→360, then 0→80
  // Vary saturation and lightness from different hash bits for visual spread
  const sat = 28 + ((hash >> 8) % 20)   // 28–47
  const lit = 20 + ((hash >> 16) % 12)  // 20–31
  return hslToHex(hue, sat, lit)
}

// --- Scope wire colors ---

function buildPinToComponentMap(board: CircuitBoard): Map<string, string> {
  const map = new Map<string, string>()

  function walk(b: CircuitBoard): void {
    for (const comp of b.components) {
      for (const pin of [...comp.inputPins, ...comp.outputPins]) {
        map.set(pin.id, comp.id)
      }
      if (comp.subCircuit) walk(comp.subCircuit)
    }
  }
  walk(board)
  return map
}

function assignScopeWireColors(
  board: CircuitBoard,
  wireColorMap: Map<string, string>,
): void {
  const pinToComp = buildPinToComponentMap(board)

  // Build set of penetrating wire IDs for quick lookup
  const allPenetratingWireIds = new Set<string>()
  function collectPenetrating(regions: ScopeRegion[]): void {
    for (const region of regions) {
      for (const wid of region.penetratingWires) {
        allPenetratingWireIds.add(wid)
      }
      collectPenetrating(region.children)
    }
  }
  collectPenetrating(board.scopeRegions)

  // Walk scope tree, children override parents (deeper = more specific)
  function walkScopes(regions: ScopeRegion[], depth: number): void {
    for (const scope of regions) {
      const hue = djb2(scope.id) % 360
      // Attenuate saturation by depth: start at 50, decrease
      const sat = Math.max(20, 50 - depth * 8)
      const normalColor = hslToHex(hue, sat, 45)
      // Penetrating wires: boosted saturation + lightness
      const penetratingColor = hslToHex(hue, Math.min(70, sat + 25), 55)

      const containedSet = new Set(scope.containedComponents)
      const penetratingSet = new Set(scope.penetratingWires)

      // Find data wires where both endpoints are in this scope
      for (const wire of board.wires) {
        if (wire.kind !== 'data') continue

        const srcComp = pinToComp.get(wire.sourcePin)
        const tgtComp = pinToComp.get(wire.targetPin)
        if (!srcComp || !tgtComp) continue

        if (containedSet.has(srcComp) && containedSet.has(tgtComp)) {
          if (penetratingSet.has(wire.id) || allPenetratingWireIds.has(wire.id)) {
            wireColorMap.set(wire.id, penetratingColor)
          } else {
            wireColorMap.set(wire.id, normalColor)
          }
        }
      }

      // Children override
      walkScopes(scope.children, depth + 1)
    }
  }

  walkScopes(board.scopeRegions, 0)
}

// --- Main entry point ---

export function buildColorContext(board: CircuitBoard): ColorContext {
  const componentBodyColor = new Map<string, string>()
  const wireColor = new Map<string, string>()

  // Component colors
  function walkComponents(b: CircuitBoard): void {
    for (const comp of b.components) {
      componentBodyColor.set(comp.id, computeComponentColor(comp, b))
      if (comp.subCircuit) walkComponents(comp.subCircuit)
    }
  }
  walkComponents(board)

  // Scope wire colors
  assignScopeWireColors(board, wireColor)

  // Recurse into sub-boards
  for (const sub of board.subBoards) {
    const subCtx = buildColorContext(sub)
    for (const [k, v] of subCtx.componentBodyColor) componentBodyColor.set(k, v)
    for (const [k, v] of subCtx.wireColor) wireColor.set(k, v)
  }

  return { componentBodyColor, wireColor }
}
