// React <-> Phaser communication via shared event emitter

import Phaser from 'phaser'

export const EventBus = new Phaser.Events.EventEmitter()

// Event name constants
export const BOARD_CHANGED = 'board-changed'
export const LAYERS_CHANGED = 'layers-changed'
export const COMPONENT_HOVERED = 'component-hovered'
export const COMPONENT_CLICKED = 'component-clicked'
export const RESET_VIEWPORT = 'reset-viewport'
export const EXPAND_SUBCIRCUIT = 'expand-subcircuit'
export const ANGLE_CHANGED = 'angle-changed'
export const ROTATION_CHANGED = 'rotation-changed'
