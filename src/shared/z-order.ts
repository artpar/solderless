// Isometric depth sorting

import { PlacedComponent } from '../layout/placement'
import { isoDepth } from '../layout/isometric'

export function sortByDepth(placed: PlacedComponent[]): PlacedComponent[] {
  return [...placed].sort((a, b) => {
    // Primary: lower worldZ drawn first (containers behind children)
    if (a.worldZ !== b.worldZ) return a.worldZ - b.worldZ
    // Secondary: higher isoDepth drawn first (back-to-front within same z-level)
    const da = isoDepth({ x: a.worldX, y: a.worldY, z: a.worldZ })
    const db = isoDepth({ x: b.worldX, y: b.worldY, z: b.worldZ })
    return db - da
  })
}
