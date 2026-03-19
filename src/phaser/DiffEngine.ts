// Diff-based scene updates with tween animations

import Phaser from 'phaser'
import { PositionedBoard } from '../layout/layout'
import { PlacedComponent } from '../layout/placement'
import { sortByDepth } from '../shared/z-order'
import { createComponentObject } from './objects/ComponentFactory'
import { createWireObject } from './objects/WireFactory'
import { RoutedWire } from '../layout/wire-routing'

/** Stable key for a component across re-analyses */
function componentKey(pc: PlacedComponent): string {
  const loc = pc.component.sourceLocation
  return `${loc?.start ?? '?'}|${pc.component.kind}|${pc.component.operation}`
}

interface ComponentDiff {
  added: PlacedComponent[]
  removed: string[] // component IDs
  moved: Array<{ id: string; pc: PlacedComponent; prevId: string }>
  unchanged: PlacedComponent[]
}

interface WireDiff {
  added: RoutedWire[]
  removed: number[] // indices in old array
  kept: RoutedWire[]
}

export interface SceneDiff {
  components: ComponentDiff
  wires: WireDiff
}

export function diffBoards(
  prev: PositionedBoard,
  next: PositionedBoard,
): SceneDiff {
  // Build key maps
  const prevByKey = new Map<string, PlacedComponent>()
  for (const pc of prev.placement.placed) {
    prevByKey.set(componentKey(pc), pc)
  }

  const added: PlacedComponent[] = []
  const moved: Array<{ id: string; pc: PlacedComponent; prevId: string }> = []
  const unchanged: PlacedComponent[] = []
  const matchedPrevKeys = new Set<string>()

  for (const pc of next.placement.placed) {
    const key = componentKey(pc)
    const prevPc = prevByKey.get(key)

    if (!prevPc) {
      added.push(pc)
    } else {
      matchedPrevKeys.add(key)
      if (
        prevPc.worldX !== pc.worldX ||
        prevPc.worldY !== pc.worldY ||
        prevPc.worldZ !== pc.worldZ
      ) {
        moved.push({ id: pc.component.id, pc, prevId: prevPc.component.id })
      } else {
        unchanged.push(pc)
      }
    }
  }

  const removed: string[] = []
  for (const pc of prev.placement.placed) {
    if (!matchedPrevKeys.has(componentKey(pc))) {
      removed.push(pc.component.id)
    }
  }

  // Wire diff: simple — rebuild all (wire identity is unstable)
  const wireDiff: WireDiff = {
    added: next.routing.wires,
    removed: Array.from({ length: prev.routing.wires.length }, (_, i) => i),
    kept: [],
  }

  return {
    components: { added, removed, moved, unchanged },
    wires: wireDiff,
  }
}

export function applyDiff(
  scene: Phaser.Scene,
  diff: SceneDiff,
  componentObjects: Map<string, Phaser.GameObjects.Container>,
  wireObjects: Phaser.GameObjects.Graphics[],
  layers: { showData: boolean; showClock: boolean; showException: boolean },
): void {
  // Remove old wires
  for (const w of wireObjects) {
    w.destroy()
  }
  wireObjects.length = 0

  // Remove deleted components (fade out)
  for (const id of diff.components.removed) {
    const obj = componentObjects.get(id)
    if (obj) {
      scene.tweens.add({
        targets: obj,
        alpha: 0,
        duration: 200,
        onComplete: () => obj.destroy(),
      })
      componentObjects.delete(id)
    }
  }

  // Move existing components (tween to new position)
  for (const { id, pc, prevId } of diff.components.moved) {
    // Remove old object, create new at old position, tween to new
    const oldObj = componentObjects.get(prevId)
    if (oldObj) {
      oldObj.destroy()
      componentObjects.delete(prevId)
    }

    const newObj = createComponentObject(scene, pc)
    // Start at slightly offset and fade in
    newObj.setAlpha(0.5)
    scene.tweens.add({
      targets: newObj,
      alpha: 1,
      duration: 300,
      ease: 'Sine.easeOut',
    })
    componentObjects.set(id, newObj)
  }

  // Add new components (fade in)
  for (const pc of diff.components.added) {
    const obj = createComponentObject(scene, pc)
    obj.setAlpha(0)
    scene.tweens.add({
      targets: obj,
      alpha: 1,
      duration: 300,
      ease: 'Sine.easeOut',
    })
    componentObjects.set(pc.component.id, obj)
  }

  // Rebuild unchanged components (they may have new IDs)
  for (const pc of diff.components.unchanged) {
    // Check if we already have this one
    if (!componentObjects.has(pc.component.id)) {
      const obj = createComponentObject(scene, pc)
      componentObjects.set(pc.component.id, obj)
    }
  }

  // Re-sort depths
  const allPcs = [
    ...diff.components.unchanged,
    ...diff.components.added,
    ...diff.components.moved.map(m => m.pc),
  ]
  const sorted = sortByDepth(allPcs)
  sorted.forEach((pc, index) => {
    const obj = componentObjects.get(pc.component.id)
    if (obj) obj.setDepth(index)
  })

  // Add new wires
  for (const routed of diff.wires.added) {
    const g = createWireObject(scene, routed, false)
    g.setDepth(-500)

    // Layer visibility
    const visible =
      (routed.layer === 'data' && layers.showData) ||
      (routed.layer === 'control' && layers.showClock) ||
      (routed.layer === 'exception' && layers.showException)
    g.setVisible(visible)

    wireObjects.push(g)
  }
}
