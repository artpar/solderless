# Solderless — Development Guide

## Architecture

Code → AST → CircuitBoard IR → 3D Placement → Isometric Projection → Phaser Rendering

### Pipeline layers
1. **Analysis** (`src/analysis/`) — TypeScript Compiler API parses code into `CircuitBoard` IR (components, wires, pins with type shapes)
2. **Layout** (`src/layout/`) — Places components in 3D world-space, routes wires as `Point3D[]` paths
3. **Projection** (`src/layout/isometric.ts`) — Mutable tilt/rotation state on `globalThis.__isoState`, all projection deferred to render time
4. **Rendering** (`src/phaser/`) — Phaser 3 scene projects 3D → 2D at draw time, manages interaction

### Key invariants
- Layout is angle-independent — placement and wire routing work in 3D world-space
- Projection happens at render time only — never bake `IsoPoint` into stored data
- `globalThis.__isoState` holds projection state to survive Vite HMR module reloading
- React ↔ Phaser communication goes through `EventBus` (shared Phaser EventEmitter)

## Project structure

```
src/
  analysis/       — AST → CircuitBoard IR
    circuit-ir.ts     — Core IR types (Component, Wire, Pin, TypeShape)
    ast-to-circuit.ts — Main AST visitor
    scope-builder.ts  — Scope/binding tracking
    type-resolver.ts  — TypeScript type → TypeShape mapping
    dead-code.ts      — Dead code detection
    flow-adapter.ts   — Control flow analysis
    project-loader.ts — Multi-file project loading
    project-circuit.ts— Project-level circuit assembly
  layout/          — 3D placement + wire routing
    isometric.ts      — Projection math (mutable tilt/rotation)
    placement.ts      — Component placement algorithm
    wire-routing.ts   — Wire path routing (Point3D[])
    layout.ts         — Orchestrates placement + routing
  phaser/          — Phaser 3 rendering
    CircuitScene.ts   — Main scene (controls, lifecycle, rebuild)
    PhaserGame.tsx    — React wrapper, shared data ref
    EventBus.ts       — Event constants and emitter
    DiffEngine.ts     — Incremental scene updates
    objects/          — Renderable objects (IsoBox, WireFactory, ComponentFactory, TypePins, Tooltip, BoardBackground)
  components/      — React UI
    CanvasView.tsx    — Canvas container, presets, compass
    CodeEditor.tsx    — Code input panel
    FileTree.tsx      — Multi-file navigation
    LayerToggle.tsx   — Wire layer visibility
  hooks/
    useCircuitAnalysis.ts — Debounced code → board pipeline
  shared/
    colors.ts         — Color palette
    z-order.ts        — Depth sorting
```

## Dev workflow

```bash
npm install
npm run dev        # Vite dev server at http://localhost:5199
```

- Hot-reload is always running — never build manually
- Never run linting or type checking commands

## Conventions

- Inline styles (style objects) — no CSS files
- Single source of truth — no dual code paths
- No unnecessary transforms in glue layers
- Phaser scene cleanup: use `this.events.on('destroy', () => this.shutdown())` for EventBus listener removal
- Camera controls follow strategy game conventions: WASD pan, Q/E rotate, R/F tilt, scroll zoom
