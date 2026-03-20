// React <-> Phaser communication via shared event emitter

import Phaser from 'phaser'

// Stored on globalThis to survive Vite HMR module reloading
const g = globalThis as unknown as { __eventBus?: Phaser.Events.EventEmitter }
if (!g.__eventBus) {
  g.__eventBus = new Phaser.Events.EventEmitter()
}
export const EventBus = g.__eventBus

// Event name constants
export const BOARD_CHANGED = 'board-changed'
export const LAYERS_CHANGED = 'layers-changed'
export const COMPONENT_HOVERED = 'component-hovered'
export const COMPONENT_CLICKED = 'component-clicked'
export const RESET_VIEWPORT = 'reset-viewport'
export const ANGLE_CHANGED = 'angle-changed'
export const ROTATION_CHANGED = 'rotation-changed'
