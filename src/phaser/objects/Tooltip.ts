// Hover tooltip showing component details

import Phaser from 'phaser'
import { PlacedComponent } from '../../layout/placement'
import { textStyle } from '../util'

export interface TooltipContainer {
  show(pc: PlacedComponent): void
  hide(): void
  destroy(): void
}

export function createTooltip(scene: Phaser.Scene): TooltipContainer {
  const container = scene.add.container(0, 0)
  container.setDepth(10000)
  container.setScrollFactor(0)
  container.setVisible(false)

  const bg = scene.add.graphics()
  bg.setScrollFactor(0)
  container.add(bg)

  const texts: Phaser.GameObjects.Text[] = []
  let hoverTimer: ReturnType<typeof setTimeout> | null = null
  let visible = false

  // Follow pointer in screen space
  scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
    if (visible) {
      container.setPosition(pointer.x + 15, pointer.y + 15)
    }
  })

  function clearTexts() {
    for (const t of texts) t.destroy()
    texts.length = 0
  }

  return {
    show(pc: PlacedComponent) {
      if (hoverTimer) clearTimeout(hoverTimer)
      hoverTimer = setTimeout(() => {
        clearTexts()
        bg.clear()

        const { component: comp } = pc
        const lines: string[] = []

        lines.push(`${comp.kind}: ${comp.operation}`)
        if (comp.label && comp.label !== comp.operation) {
          lines.push(comp.label)
        }

        if (comp.inputPins.length > 0) {
          lines.push('')
          lines.push('Inputs:')
          for (const pin of comp.inputPins) {
            lines.push(`  ${pin.label}: ${pin.typeShape.label}`)
          }
        }
        if (comp.outputPins.length > 0) {
          lines.push('')
          lines.push('Outputs:')
          for (const pin of comp.outputPins) {
            lines.push(`  ${pin.label}: ${pin.typeShape.label}`)
          }
        }

        if (comp.sourceLocation) {
          lines.push('')
          lines.push(`L${comp.sourceLocation.start}-${comp.sourceLocation.end}`)
        }

        // Render tooltip
        const padding = 8
        let y = padding

        for (const line of lines) {
          const t = scene.add.text(padding, y, line, textStyle({
            fontSize: '10px',
            color: '#cccccc',
          }))
          t.setScrollFactor(0)
          container.add(t)
          texts.push(t)
          y += 14
        }

        const maxW = Math.max(...texts.map(t => t.width)) + padding * 2
        const totalH = y + padding

        bg.fillStyle(0x1a1a1a, 0.92)
        bg.fillRoundedRect(0, 0, maxW, totalH, 4)
        bg.lineStyle(1, 0x555555, 0.8)
        bg.strokeRoundedRect(0, 0, maxW, totalH, 4)

        container.setVisible(true)
        visible = true
      }, 150)
    },

    hide() {
      if (hoverTimer) {
        clearTimeout(hoverTimer)
        hoverTimer = null
      }
      container.setVisible(false)
      visible = false
      clearTexts()
      bg.clear()
    },

    destroy() {
      if (hoverTimer) clearTimeout(hoverTimer)
      container.destroy()
    },
  }
}
