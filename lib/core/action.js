import { pointInTerritory } from './geometry.js'

/** A center that moves farther than this must be read again before a click. */
export const CENTER_MOVE_PX = 12

const BROWSER_PROCESS = new Set([
  'chrome.exe',
  'msedge.exe',
  'firefox.exe',
  'brave.exe',
  'opera.exe',
  'vivaldi.exe',
  'iexplore.exe',
])

const STANDARD_CLASS = new Set([
  'Button',
  'Edit',
  'Static',
  'ComboBox',
  'ListBox',
  'SysListView32',
  'SysTreeView32',
  'ToolbarWindow32',
  'RICHEDIT50W',
  'RichEditD2DPT',
])

/**
 * @param {{ x: number, y: number }} before
 * @param {{ x: number, y: number }} after
 */
export function movedSignificantly(before, after) {
  return Math.abs(before.x - after.x) > CENTER_MOVE_PX || Math.abs(before.y - after.y) > CENTER_MOVE_PX
}

function browser(win) {
  return BROWSER_PROCESS.has(String(win.processName || '').toLowerCase())
}

/**
 * One left click. Patterns first. A posted message is only for an ordinary control
 * that is not covered and is not a browser surface.
 * @param {{ password?: boolean, patterns?: string[], className?: string, center: { x: number, y: number } }} control
 * @param {{ covered?: boolean, processName?: string }} win
 * @param {{ kind: string, rect: object, side?: string }} territory
 */
export function planClick(control, win, territory) {
  if (control.password) return { ok: false, reason: '密码框不读、不点、不写' }
  if (!pointInTerritory(territory, control.center.x, control.center.y)) {
    return { ok: false, reason: '控件中心不在地盘里' }
  }
  const patterns = control.patterns || []
  if (patterns.includes('invoke')) return { ok: true, kind: 'invoke' }
  if (patterns.includes('selection')) return { ok: true, kind: 'selection' }
  if (patterns.includes('toggle')) return { ok: true, kind: 'toggle' }
  if (win.covered) return { ok: false, reason: '窗口被挡住，只允许控件自己的调用' }
  if (browser(win) || !STANDARD_CLASS.has(control.className || '')) {
    return { ok: false, reason: '这个表面不能调用' }
  }
  return { ok: true, kind: 'post' }
}

/**
 * Replace the whole value. An empty string clears it.
 * @param {{ password?: boolean, patterns?: string[], center: { x: number, y: number } }} control
 * @param {string} value
 * @param {{ kind: string, rect: object, side?: string }} territory
 */
export function planType(control, value, territory) {
  if (control.password) return { ok: false, reason: '密码框不读、不点、不写' }
  if (!pointInTerritory(territory, control.center.x, control.center.y)) {
    return { ok: false, reason: '控件中心不在地盘里' }
  }
  if (!(control.patterns || []).includes('value')) {
    return { ok: false, reason: '这个控件不能整段赋值' }
  }
  return { ok: true, kind: 'setvalue', value: String(value ?? '') }
}
