/** Territory rectangles in virtual-screen pixels. The divider line itself is outside. */

const MIN_FRACTION = 0.05
const MAX_FRACTION = 0.95

/** @param {number} value */
export function clampFraction(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0.5
  return Math.min(MAX_FRACTION, Math.max(MIN_FRACTION, number))
}

/**
 * @param {{ x: number, y: number, width: number, height: number }} screen
 * @param {'left' | 'right' | 'top' | 'bottom'} side
 * @param {number} fraction
 */
export function splitRect(screen, side, fraction) {
  const share = clampFraction(fraction)
  const width = Math.round(screen.width * share)
  const height = Math.round(screen.height * share)
  if (side === 'left') return { x: screen.x, y: screen.y, width, height: screen.height }
  if (side === 'top') return { x: screen.x, y: screen.y, width: screen.width, height }
  if (side === 'bottom') {
    return { x: screen.x, y: screen.y + screen.height - height, width: screen.width, height }
  }
  return { x: screen.x + screen.width - width, y: screen.y, width, height: screen.height }
}

/** @param {{ x: number, y: number, width: number, height: number }} rect */
export function centerOf(rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

/**
 * @param {{ kind: 'display' | 'split', rect: { x: number, y: number, width: number, height: number }, side?: string }} territory
 * @param {number} x
 * @param {number} y
 */
export function pointInTerritory(territory, x, y) {
  const rect = territory.rect
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  if (territory.kind === 'display') {
    return x >= rect.x && x < right && y >= rect.y && y < bottom
  }
  const side = territory.side
  if (side === 'right') return x > rect.x && x <= right && y >= rect.y && y < bottom
  if (side === 'left') return x >= rect.x && x < right && y >= rect.y && y < bottom
  if (side === 'bottom') return y > rect.y && y <= bottom && x >= rect.x && x < right
  return y >= rect.y && y < bottom && x >= rect.x && x < right
}

/**
 * Share of the screen the pointer is giving to the territory.
 * @param {{ x: number, y: number, width: number, height: number }} screen
 * @param {'left' | 'right' | 'top' | 'bottom'} side
 */
export function fractionFromPointer(screen, side, x, y) {
  if (side === 'left') return clampFraction((x - screen.x) / screen.width)
  if (side === 'top') return clampFraction((y - screen.y) / screen.height)
  if (side === 'bottom') return clampFraction((screen.y + screen.height - y) / screen.height)
  return clampFraction((screen.x + screen.width - x) / screen.width)
}
