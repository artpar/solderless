import { TypeTag } from '../analysis/circuit-ir'

// PCB color palette

export const COLORS = {
  // Board
  boardBg: '#1a472a',        // dark green PCB
  boardGrid: '#1e5c34',      // slightly lighter grid dots
  boardEdge: '#0f2d1a',      // board edge

  // Wire types
  dataWire: '#c87533',       // copper
  dataWireHi: '#e8a050',     // copper highlighted
  clockWire: '#d4a017',      // amber
  clockWireHi: '#ffd700',    // amber highlighted
  exceptionWire: '#cc3333',  // red
  exceptionWireHi: '#ff5555',// red highlighted

  // Component body
  compBody: '#2a2a2a',       // dark gray IC body
  compBodyHi: '#3a3a3a',     // highlighted
  compBorder: '#555555',     // border
  compBorderHi: '#888888',

  // Component types
  gate: '#334455',           // blue-gray
  mux: '#443355',            // purple
  demux: '#443355',
  register: '#553344',       // burgundy
  subcircuit: '#2d4a2d',     // green (like a chip)
  constant: '#444444',       // neutral
  connector: '#445544',      // green-gray
  comparator: '#334455',
  latch: '#554433',          // brown
  namedWire: '#3a4a3a',      // light green

  // Text
  labelText: '#cccccc',
  labelTextHi: '#ffffff',
  pinText: '#999999',

  // Dead code
  deadComp: '#333333',
  deadWire: '#444444',
  deadLabel: '#555555',

  // Scope regions
  scopeBorder: '#2a5a3a',
  scopeFill: 'rgba(30, 80, 50, 0.15)',

  // Shadows
  shadow: 'rgba(0, 0, 0, 0.3)',
} as const

export function getComponentColor(kind: string, isReachable: boolean): string {
  if (!isReachable) return COLORS.deadComp
  const colorMap: Record<string, string> = {
    gate: COLORS.gate,
    mux: COLORS.mux,
    demux: COLORS.demux,
    register: COLORS.register,
    subcircuit: COLORS.subcircuit,
    'io-port': COLORS.connector,
    constant: COLORS.constant,
    connector: COLORS.connector,
    comparator: COLORS.comparator,
    latch: COLORS.latch,
    'named-wire': COLORS.namedWire,
  }
  return colorMap[kind] ?? COLORS.compBody
}

export const TYPE_COLORS: Record<TypeTag, string> = {
  boolean: '#4488cc',
  null: '#666688',
  undefined: '#666688',
  void: '#555566',
  symbol: '#8866aa',
  number: '#cc8844',
  any: '#777777',
  unknown: '#777777',
  enum: '#887744',
  string: '#44aa66',
  bigint: '#aa6644',
  never: '#333333',
  object: '#557788',
  array: '#558855',
  tuple: '#668855',
  union: '#886655',
  intersection: '#556688',
  function: '#446655',
}

export function getTypeColor(tag: TypeTag): string {
  return TYPE_COLORS[tag] ?? '#777777'
}

export function getWireColor(kind: string, isLive: boolean, highlighted: boolean): string {
  if (!isLive) return COLORS.deadWire
  if (kind === 'data') return highlighted ? COLORS.dataWireHi : COLORS.dataWire
  if (kind === 'control') return highlighted ? COLORS.clockWireHi : COLORS.clockWire
  if (kind === 'exception') return highlighted ? COLORS.exceptionWireHi : COLORS.exceptionWire
  return COLORS.dataWire
}
