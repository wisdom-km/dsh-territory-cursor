import { splitRect } from './geometry.js'

/**
 * @param {{ device: string, x: number, y: number, width: number, height: number }} screen
 */
function screenRect(screen) {
  return { x: screen.x, y: screen.y, width: screen.width, height: screen.height }
}

/**
 * Decide the rectangle for this round from the saved choice and a fresh screen list.
 * A missing device, a moved origin, or a changed screen count asks the settings page again.
 * A size change on the same device keeps the saved fraction.
 * @param {{ confirmed?: boolean, device?: string, screenCount?: number, originX?: number, originY?: number, side?: string, fraction?: number }} config
 * @param {Array<{ device: string, x: number, y: number, width: number, height: number }>} screens
 */
export function resolveTerritory(config, screens) {
  if (!config.confirmed || !config.device) {
    return { ok: false, reason: '地盘还没确认' }
  }
  if (!Array.isArray(screens) || screens.length === 0) {
    return { ok: false, reason: '没有读到屏幕' }
  }
  if (Number(config.screenCount) !== screens.length) {
    return { ok: false, reason: '屏幕数量变了，要在设置页重新确认', reask: true }
  }
  const screen = screens.find(item => item.device === config.device)
  if (!screen) {
    return { ok: false, reason: '这块屏幕不在了，要在设置页重新确认', reask: true }
  }
  if (Number(screen.x) !== Number(config.originX) || Number(screen.y) !== Number(config.originY)) {
    return { ok: false, reason: '屏幕换了位置，要在设置页重新确认', reask: true }
  }
  if (screens.length >= 2) {
    return { ok: true, kind: 'display', rect: screenRect(screen), screen, screens }
  }
  const side = config.side === 'left' || config.side === 'top' || config.side === 'bottom' ? config.side : 'right'
  return {
    ok: true,
    kind: 'split',
    side,
    rect: splitRect(screen, side, config.fraction ?? 0.5),
    screen,
    screens,
  }
}

/**
 * Which screen the settings page preselects. Two or more screens preselect the one without the pointer.
 * @param {Array<{ device: string, hasCursor?: boolean }>} screens
 */
export function suggestedDevice(screens) {
  if (!Array.isArray(screens) || screens.length === 0) return ''
  if (screens.length === 1) return screens[0].device
  const away = screens.find(screen => !screen.hasCursor)
  return (away ?? screens[0]).device
}
