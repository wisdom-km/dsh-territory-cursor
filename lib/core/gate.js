import { pointInTerritory } from './geometry.js'

export const QUIET_MS = 1500

/** Fresh pause latch. Stop and pause are separate. */
export function createGate() {
  return {
    stopped: false,
    paused: false,
    pressedInside: false,
    buttons: new Set(),
    keys: new Set(),
    cursor: { x: 0, y: 0 },
    cursorKnown: false,
    quietSince: null,
    generation: 1,
    acting: false,
  }
}

function invalidate(gate) {
  gate.generation += 1
}

function rememberCursor(gate, x, y) {
  gate.cursor = { x, y }
  gate.cursorKnown = true
}

/**
 * @param {ReturnType<typeof createGate>} gate
 * @param {{ kind: string, rect: object, side?: string } | null} territory
 */
export function pointerMove(gate, x, y) {
  rememberCursor(gate, x, y)
}

/**
 * @param {ReturnType<typeof createGate>} gate
 * @param {string} button
 */
export function pointerDown(gate, button, x, y, territory) {
  rememberCursor(gate, x, y)
  gate.buttons.add(button)
  if (territory && pointInTerritory(territory, x, y)) gate.pressedInside = true
  gate.paused = true
  gate.quietSince = null
  invalidate(gate)
}

/** @param {ReturnType<typeof createGate>} gate */
export function pointerUp(gate, button, x, y, now) {
  rememberCursor(gate, x, y)
  gate.buttons.delete(button)
  if (gate.buttons.size === 0 && gate.keys.size === 0) gate.quietSince = now
}

/**
 * A wheel inside the rectangle drops the current picture. A wheel outside leaves it.
 * @param {ReturnType<typeof createGate>} gate
 */
export function pointerWheel(gate, x, y, territory) {
  rememberCursor(gate, x, y)
  if (territory && pointInTerritory(territory, x, y)) invalidate(gate)
}

/** @param {ReturnType<typeof createGate>} gate */
export function keyDown(gate, vk) {
  if (gate.keys.has(vk)) return
  gate.keys.add(vk)
  gate.paused = true
  gate.quietSince = null
  invalidate(gate)
}

/** @param {ReturnType<typeof createGate>} gate */
export function keyUp(gate, vk, now) {
  gate.keys.delete(vk)
  if (gate.buttons.size === 0 && gate.keys.size === 0) gate.quietSince = now
}

/** Same latch as the settings switch. Quiet time does not clear it. */
export function setStopped(gate, stopped) {
  const next = Boolean(stopped)
  if (gate.stopped === next) return
  gate.stopped = next
  invalidate(gate)
}

/**
 * Running, paused, or stopped. Resumes in place when the quiet rule is met.
 * @param {ReturnType<typeof createGate>} gate
 * @param {{ kind: string, rect: object, side?: string } | null} territory
 */
export function phase(gate, territory, now) {
  if (gate.stopped) return 'stopped'
  if (!gate.paused) return 'running'
  if (gate.buttons.size > 0 || gate.keys.size > 0) return 'paused'
  if (gate.quietSince === null || now - gate.quietSince < QUIET_MS) return 'paused'
  if (gate.pressedInside) {
    if (!territory || !gate.cursorKnown) return 'paused'
    if (pointInTerritory(territory, gate.cursor.x, gate.cursor.y)) return 'paused'
  }
  gate.paused = false
  gate.pressedInside = false
  gate.quietSince = null
  return 'running'
}

/** @param {ReturnType<typeof createGate>} gate */
export function phaseLabel(name) {
  if (name === 'stopped') return '已停止'
  if (name === 'paused') return '已暂停'
  return '运行中'
}
