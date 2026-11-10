import { phase } from './gate.js'

/** A picture is allowed while paused or stopped. It is not allowed before the territory is confirmed. */
export function beginSnapshot(resolved) {
  if (!resolved.ok) return { ok: false, reason: resolved.reason, reask: Boolean(resolved.reask) }
  return { ok: true }
}

/**
 * One action. The caller clears `gate.acting` when the call finishes.
 * @param {import('./gate.js').createGate extends Function ? ReturnType<import('./gate.js').createGate> : object} gate
 */
export function beginAct(resolved, gate, snapshotGeneration, territory, now) {
  if (gate.acting) return { ok: false, reason: '上一动作还没结束' }
  if (!resolved.ok) return { ok: false, reason: resolved.reason, reask: Boolean(resolved.reask) }
  const name = phase(gate, territory, now)
  if (name === 'stopped') return { ok: false, reason: '已停止' }
  if (name === 'paused') return { ok: false, reason: '已暂停' }
  if (snapshotGeneration !== gate.generation) return { ok: false, reason: '先重新截一张图' }
  gate.acting = true
  return { ok: true }
}

/** @param {{ acting: boolean }} gate */
export function endAct(gate) {
  gate.acting = false
}
