// Circuit IR — the central data structure between analysis and rendering

export interface Pin {
  id: string
  label: string
  kind: 'input' | 'output' | 'exception'
  componentId: string
}

export interface Component {
  id: string
  kind:
    | 'gate'
    | 'mux'
    | 'demux'
    | 'register'
    | 'subcircuit'
    | 'io-port'
    | 'constant'
    | 'connector'
    | 'comparator'
    | 'latch'
    | 'named-wire'
  operation: string
  label: string
  inputPins: Pin[]
  outputPins: Pin[]
  sourceLocation: { start: number; end: number; line: number } | null
  isReachable: boolean
  subCircuit?: CircuitBoard
}

export interface Wire {
  id: string
  kind: 'data' | 'control' | 'exception'
  sourcePin: string
  targetPin: string
  isLive: boolean
}

export interface ClockSegment {
  from: string
  to: string
  kind:
    | 'sequential'
    | 'branch-true'
    | 'branch-false'
    | 'loop-back'
    | 'call-enter'
    | 'call-return'
}

export interface ScopeRegion {
  id: string
  kind: 'block' | 'function' | 'class' | 'module'
  containedComponents: string[]
  penetratingWires: string[]
  children: ScopeRegion[]
}

export interface CircuitBoard {
  id: string
  name: string
  components: Component[]
  wires: Wire[]
  subBoards: CircuitBoard[]
  inputPins: Pin[]
  outputPins: Pin[]
  exceptionPin: Pin | null
  clockLine: ClockSegment[]
  scopeRegions: ScopeRegion[]
}

// Helpers

let _nextId = 0
export function genId(prefix: string): string {
  return `${prefix}_${_nextId++}`
}

export function resetIdCounter(): void {
  _nextId = 0
}

export function makePin(
  componentId: string,
  label: string,
  kind: Pin['kind'],
): Pin {
  return { id: genId('pin'), label, kind, componentId }
}

export function makeComponent(
  kind: Component['kind'],
  operation: string,
  label: string,
  inputCount: number,
  outputCount: number,
  sourceLocation: Component['sourceLocation'],
): Component {
  const id = genId('comp')
  const inputPins: Pin[] = []
  const outputPins: Pin[] = []
  for (let i = 0; i < inputCount; i++) {
    inputPins.push(makePin(id, `in${i}`, 'input'))
  }
  for (let i = 0; i < outputCount; i++) {
    outputPins.push(makePin(id, `out${i}`, 'output'))
  }
  return {
    id,
    kind,
    operation,
    label,
    inputPins,
    outputPins,
    sourceLocation,
    isReachable: true,
  }
}

export function makeWire(
  sourcePin: string,
  targetPin: string,
  kind: Wire['kind'] = 'data',
): Wire {
  return {
    id: genId('wire'),
    kind,
    sourcePin,
    targetPin,
    isLive: true,
  }
}

export function makeBoard(name: string): CircuitBoard {
  return {
    id: genId('board'),
    name,
    components: [],
    wires: [],
    subBoards: [],
    inputPins: [],
    outputPins: [],
    exceptionPin: null,
    clockLine: [],
    scopeRegions: [],
  }
}
