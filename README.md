# Solderless — Circuit Board Code Visualizer

Visualizes TypeScript/JavaScript code as interactive isometric circuit board diagrams. Functions become components, variables become wires, and control flow becomes visible architecture.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5199`.

## How It Works

1. **Write or paste code** in the editor (left panel)
2. **AST analysis** converts code to a circuit representation — functions, calls, variables, control flow
3. **Layout engine** places components in 3D world-space and routes wires
4. **Phaser renderer** draws everything as an interactive isometric circuit board

## Camera Controls

| Action | Input |
|--------|-------|
| Pan | WASD / Arrow keys / Left-drag |
| Rotate | Q / E / Drag compass |
| Tilt | R (steeper) / F (flatter) / Drag compass vertically |
| Zoom | Scroll wheel / Trackpad pinch |
| Camera rotate | Shift + Left-drag |
| Reset view | Home key / Reset View button |

### Preset Views

Buttons in bottom-right corner: **Iso** (default), **Top** (bird's-eye), **Front**, **Side**, **Steep**

### Compass

The compass in the top-right shows orientation (N/E/S/W). Drag it to rotate/tilt, or click a cardinal direction to snap.

## Layers

Toggle visibility of wire types:
- **Data** — variable assignments, function arguments
- **Clock** — control flow (if/else, loops)
- **Exception** — error paths

## Project Structure

```
src/
  analysis/    — AST → circuit IR (scope tracking, dead-code detection, type resolution)
  layout/      — 3D placement, wire routing, isometric projection
  phaser/      — Phaser 3 scene, rendering objects (IsoBox, wires, tooltips)
  components/  — React UI (CodeEditor, CanvasView, FileTree, LayerToggle)
  hooks/       — useCircuitAnalysis
  shared/      — colors, z-order
```

## Tech Stack

- React 19 + TypeScript
- Phaser 3 (WebGL rendering)
- Vite (dev server + build)
- TypeScript Compiler API (AST analysis)
