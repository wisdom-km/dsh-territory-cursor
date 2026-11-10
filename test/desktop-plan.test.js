import assert from 'node:assert/strict'
import test from 'node:test'
import { formatStepReport, planDesktopStep } from '../lib/core/desktop-plan.js'

const screen = { x: 0, y: 0, width: 2560, height: 1440 }

test('an empty action list is a look', () => {
  const plan = planDesktopStep({})
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.body.actions, [])
  assert.equal(plan.body.mode, 'step')
  assert.equal(plan.body.annotate, true)
  assert.equal(plan.body.grid, false)
  const text = formatStepReport(plan.planned, {
    capture: screen,
    cursor: { x: 3, y: 4 },
    foreground: '记事本',
    settledMs: 100,
  }, { watchCount: 0, timeoutMs: plan.body.timeoutMs, annotate: true, grid: false })
  assert.match(text, /只看了一眼/)
  assert.match(text, /移动了系统鼠标/)
  assert.match(text, /EvilOfRed/)
})

test('a key chord keeps the named key and its modifiers', () => {
  const plan = planDesktopStep({ actions: [{ kind: 'key', key: 'ctrl+shift+tab', repeat: 2 }] })
  assert.equal(plan.ok, true)
  assert.equal(plan.body.actions[0].vk, 9)
  assert.equal(plan.body.actions[0].hasVk, true)
  assert.equal(plan.body.actions[0].ctrl, true)
  assert.equal(plan.body.actions[0].shift, true)
  assert.equal(plan.body.actions[0].repeat, 2)
  assert.equal(plan.planned[0].chord.label, 'Ctrl+Shift+Tab')
})

test('move time plus wait cannot exceed one batch', () => {
  const plan = planDesktopStep({
    actions: [
      { kind: 'move', x: 10, y: 20, duration_ms: 10000 },
      { kind: 'wait', ms: 6000 },
    ],
  })
  assert.equal(plan.ok, false)
  assert.match(plan.error, /15000/)
})

test('more than four watch rects is refused before a step', () => {
  const watch = [1, 2, 3, 4, 5].map(index => ({ x: index, y: 0, width: 10, height: 10 }))
  const plan = planDesktopStep({ watch })
  assert.equal(plan.ok, false)
  assert.match(plan.error, /最多 4/)
})

test('a flat watch row still names the rectangle', () => {
  const text = formatStepReport([], {
    watch: [{ x: 1, y: 2, width: 3, height: 4, changed: false }],
    capture: { width: 100, height: 80 },
    cursor: { x: 0, y: 0 },
    timedOut: false,
    detectedMs: 0,
    settledMs: 0,
    stable: true,
  }, { watchCount: 1, timeoutMs: 0, annotate: false, grid: false })
  assert.match(text, /R1\(1, 2\) 3×4/)
  assert.match(text, /timeout_ms 是 0/)
})
