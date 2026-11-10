import { suggestedDevice } from './territory.js'
import { phaseLabel } from './gate.js'

/**
 * Place screens into left/right/above/below labels from their origins.
 * @param {Array<{ device: string, x: number, y: number, width: number, height: number, hasCursor?: boolean }>} screens
 */
export function screenChoices(screens) {
  const list = Array.isArray(screens) ? screens : []
  const suggested = suggestedDevice(list)
  const ranked = [...list].sort((a, b) => a.x - b.x || a.y - b.y)
  return ranked.map(screen => {
    let place = '这块屏幕'
    if (list.length >= 2) {
      const left = Math.min(...list.map(item => item.x))
      const right = Math.max(...list.map(item => item.x))
      const top = Math.min(...list.map(item => item.y))
      const bottom = Math.max(...list.map(item => item.y))
      if (screen.x === left && left !== right) place = '左边这块'
      else if (screen.x === right && left !== right) place = '右边这块'
      else if (screen.y === top && top !== bottom) place = '上面这块'
      else if (screen.y === bottom && top !== bottom) place = '下面这块'
    }
    return {
      device: screen.device,
      place,
      size: `${screen.width}×${screen.height}`,
      suggested: screen.device === suggested,
    }
  })
}

/**
 * Copy for the settings page. `phaseName` is running, paused, or stopped.
 * @param {{ confirmed?: boolean, screens?: object[], side?: string, fraction?: number, phaseName?: string }} state
 */
export function settingsView(state = {}) {
  const confirmed = Boolean(state.confirmed)
  const phaseName = state.phaseName || 'running'
  let detail = '地盘还没确认。先在这里选定地盘。'
  if (confirmed && (state.screens || []).length >= 2) detail = '地盘是选定的整块屏幕。'
  else if (confirmed) {
    const side = { left: '左半边', right: '右半边', top: '上半边', bottom: '下半边' }[state.side] || '右半边'
    detail = `地盘是这块屏幕的${side}。`
  }
  return {
    state: confirmed ? 'confirmed' : 'unconfigured',
    title: '地盘光标',
    detail,
    phase: phaseLabel(phaseName),
    choices: screenChoices(state.screens || []),
  }
}
