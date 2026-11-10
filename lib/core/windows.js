import { centerOf, pointInTerritory } from './geometry.js'

const SKIP_CLASS = new Set([
  'Shell_TrayWnd',
  'Shell_SecondaryTrayWnd',
  'Progman',
  'WorkerW',
  'NotifyIconOverflowWindow',
  'TopLevelWindowForOverflowXamlIsland',
  'IME',
  'MSCTFIME UI',
  'CiceroUIWndFrame',
  'TerritoryOverlay',
  'TerritoryDivider',
  'TerritoryCursor',
])

const SKIP_PROCESS = new Set([
  'startmenuexperiencehost.exe',
  'shellexperiencehost.exe',
  'searchhost.exe',
  'textinputhost.exe',
  'deepseek harness.exe',
])

/**
 * @param {{ className?: string, processName?: string, title?: string, minimized?: boolean, cloaked?: boolean, width?: number, height?: number }} win
 */
export function skipWindow(win) {
  if (win.minimized || win.cloaked) return true
  if (!win.width || !win.height) return true
  const className = win.className || ''
  if (SKIP_CLASS.has(className)) return true
  if (className.startsWith('Cicero')) return true
  const processName = String(win.processName || '').toLowerCase()
  if (SKIP_PROCESS.has(processName)) return true
  if (win.title === 'Program Manager') return true
  return false
}

/**
 * Mark windows whose center sits under an earlier visible window.
 * `windows` is front-to-back. Click-through rows do not cover anything.
 * @param {Array<{ x: number, y: number, width: number, height: number, className?: string }>} windows
 */
export function markCovered(windows) {
  const coverers = []
  return windows.map(win => {
    const center = centerOf(win)
    const covered = coverers.some(other => (
      center.x >= other.x && center.x < other.x + other.width
      && center.y >= other.y && center.y < other.y + other.height
    ))
    const clickThrough = win.className === 'TerritoryOverlay'
      || win.className === 'TerritoryDivider'
      || win.className === 'TerritoryCursor'
    if (!clickThrough && !win.minimized && !win.cloaked && win.width && win.height) coverers.push(win)
    return { ...win, covered }
  })
}

/**
 * Top-level windows the tool may name. Center must sit inside the rectangle.
 * @param {Array<object>} windows front-to-back
 * @param {{ kind: string, rect: object, side?: string }} territory
 */
export function windowsInside(windows, territory) {
  const marked = markCovered(windows)
  return marked.filter(win => {
    if (skipWindow(win)) return false
    const center = centerOf(win)
    return pointInTerritory(territory, center.x, center.y)
  }).map(win => ({ ...win, center: centerOf(win) }))
}
