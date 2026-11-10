import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import { CENTER_MOVE_PX, movedSignificantly, planClick, planType } from '../lib/core/action.js'
import { createGate, keyDown, keyUp, phase, pointerDown, pointerMove, pointerUp, pointerWheel, QUIET_MS, setStopped } from '../lib/core/gate.js'
import { clampFraction, fractionFromPointer, pointInTerritory, splitRect } from '../lib/core/geometry.js'
import { settingsView } from '../lib/core/settings-view.js'
import { resolveTerritory, suggestedDevice } from '../lib/core/territory.js'
import { windowsInside } from '../lib/core/windows.js'

const screen = { device: '\\\\.\\DISPLAY1', x: 0, y: 0, width: 2560, height: 1440 }
const right = { kind: 'split', side: 'right', rect: splitRect(screen, 'right', 0.5) }

test('right half leaves the screen center outside', () => {
  assert.equal(right.rect.x, 1280)
  assert.equal(right.rect.width, 1280)
  assert.equal(pointInTerritory(right, 1280, 720), false)
  assert.equal(pointInTerritory(right, 1281, 720), true)
  assert.equal(pointInTerritory({ kind: 'split', side: 'left', rect: splitRect(screen, 'left', 0.5) }, 1280, 720), false)
})

test('negative virtual screens stay on their own side of the divider', () => {
  const leftScreen = { x: -1920, y: 0, width: 1920, height: 1080 }
  const territory = { kind: 'split', side: 'right', rect: splitRect(leftScreen, 'right', 0.5) }
  assert.equal(territory.rect.x, -960)
  assert.equal(pointInTerritory(territory, -960, 10), false)
  assert.equal(pointInTerritory(territory, -959, 10), true)
})

test('fraction stays in range and follows the pointer', () => {
  assert.equal(clampFraction(2), 0.95)
  assert.equal(fractionFromPointer(screen, 'right', 1280, 0), 0.5)
})

test('one screen keeps the fraction when only the size changes', () => {
  const saved = {
    confirmed: true, device: screen.device, screenCount: 1, originX: 0, originY: 0, side: 'right', fraction: 0.25,
  }
  const grown = [{ ...screen, width: 1920, height: 1080 }]
  const territory = resolveTerritory(saved, grown)
  assert.equal(territory.ok, true)
  assert.equal(territory.rect.width, 480)
})

test('a moved screen or a new screen asks again', () => {
  const saved = {
    confirmed: true, device: screen.device, screenCount: 1, originX: 0, originY: 0, side: 'right', fraction: 0.5,
  }
  assert.equal(resolveTerritory(saved, [{ ...screen, x: 100 }]).reask, true)
  assert.equal(resolveTerritory(saved, [screen, { ...screen, device: '\\\\.\\DISPLAY2', x: 2560 }]).reask, true)
  assert.match(resolveTerritory({ confirmed: false }, [screen]).reason, /还没确认/)
})

test('two screens preselect the one without the pointer and use the whole display', () => {
  const screens = [
    { ...screen, hasCursor: true },
    { device: '\\\\.\\DISPLAY2', x: 2560, y: 0, width: 1920, height: 1080, hasCursor: false },
  ]
  assert.equal(suggestedDevice(screens), '\\\\.\\DISPLAY2')
  const territory = resolveTerritory({
    confirmed: true, device: '\\\\.\\DISPLAY2', screenCount: 2, originX: 2560, originY: 0,
  }, screens)
  assert.equal(territory.kind, 'display')
  assert.equal(territory.rect.width, 1920)
})

test('movement alone does not pause or drop the picture', () => {
  const gate = createGate()
  const generation = gate.generation
  pointerMove(gate, 10, 10)
  pointerMove(gate, 2000, 10)
  assert.equal(phase(gate, right, 0), 'running')
  assert.equal(gate.generation, generation)
})

test('a click inside resumes only after release, leaving, and quiet', () => {
  const gate = createGate()
  pointerDown(gate, 'left', 2000, 10, right)
  assert.equal(phase(gate, right, 0), 'paused')
  pointerUp(gate, 'left', 2000, 10, 0)
  assert.equal(phase(gate, right, QUIET_MS), 'paused')
  pointerMove(gate, 10, 10)
  assert.equal(phase(gate, right, QUIET_MS), 'running')
})

test('a click outside resumes while the pointer stays there', () => {
  const gate = createGate()
  pointerDown(gate, 'left', 10, 10, right)
  pointerUp(gate, 'left', 10, 10, 0)
  assert.equal(phase(gate, right, QUIET_MS - 1), 'paused')
  assert.equal(phase(gate, right, QUIET_MS), 'running')
})

test('a held key restarts quiet, and the stop latch ignores quiet', () => {
  const gate = createGate()
  keyDown(gate, 16)
  keyDown(gate, 16)
  assert.equal(gate.keys.size, 1)
  keyUp(gate, 16, 100)
  assert.equal(phase(gate, right, 100 + QUIET_MS - 1), 'paused')
  setStopped(gate, true)
  assert.equal(phase(gate, right, 100 + QUIET_MS * 2), 'stopped')
  setStopped(gate, false)
  assert.equal(phase(gate, right, 100 + QUIET_MS * 2), 'running')
})

test('a wheel inside drops the picture and a wheel outside does not', () => {
  const gate = createGate()
  const seen = gate.generation
  pointerWheel(gate, 10, 10, right)
  assert.equal(gate.generation, seen)
  assert.equal(phase(gate, right, 0), 'running')
  pointerWheel(gate, 2000, 10, right)
  assert.equal(gate.generation, seen + 1)
  assert.equal(phase(gate, right, 0), 'running')
})

test('only a window whose center is inside is listed', () => {
  const rows = windowsInside([
    { hwnd: '1', title: '记事本', className: 'Notepad', processName: 'notepad.exe', x: 1280, y: 0, width: 1280, height: 1400 },
    { hwnd: '2', title: '左', className: 'Notepad', processName: 'notepad.exe', x: 0, y: 0, width: 1280, height: 1400 },
    { hwnd: '3', title: '铺满', className: 'Notepad', processName: 'notepad.exe', x: 0, y: 0, width: 2560, height: 1440 },
    { hwnd: '4', title: '任务栏', className: 'Shell_TrayWnd', processName: 'explorer.exe', x: 0, y: 1400, width: 2560, height: 40 },
    { hwnd: '5', title: '小', className: 'Notepad', processName: 'notepad.exe', x: 2000, y: 100, width: 200, height: 200, minimized: true },
    { hwnd: '6', title: 'Harness', className: 'Chrome_WidgetWin_1', processName: 'DeepSeek Harness.exe', x: 1400, y: 100, width: 800, height: 600 },
  ], right)
  assert.deepEqual(rows.map(row => row.hwnd), ['1'])
})

test('a covered window is marked and cannot take a posted click', () => {
  const rows = windowsInside([
    { hwnd: 'front', title: '前', className: 'Notepad', processName: 'notepad.exe', x: 1400, y: 100, width: 800, height: 800 },
    { hwnd: 'back', title: '后', className: 'Notepad', processName: 'notepad.exe', x: 1500, y: 200, width: 400, height: 400 },
  ], right)
  const back = rows.find(row => row.hwnd === 'back')
  assert.equal(back.covered, true)
  const control = { className: 'Button', patterns: [], password: false, center: { x: 1700, y: 400 } }
  assert.match(planClick(control, back, right).reason, /被挡住/)
  assert.equal(planClick({ ...control, patterns: ['invoke'] }, back, right).kind, 'invoke')
})

test('password, browser, and a jumped control are refused', () => {
  const win = { covered: false, processName: 'notepad.exe' }
  const button = { className: 'Button', patterns: [], password: false, center: { x: 1700, y: 400 } }
  assert.equal(planClick(button, win, right).kind, 'post')
  assert.match(planClick({ ...button, password: true }, win, right).reason, /密码框/)
  assert.match(planClick(button, { ...win, processName: 'chrome.exe' }, right).reason, /不能调用/)
  assert.match(planType({ ...button, patterns: [] }, 'hi', right).reason, /不能整段赋值/)
  assert.equal(planType({ ...button, patterns: ['value'] }, '', right).value, '')
  assert.equal(movedSignificantly({ x: 0, y: 0 }, { x: CENTER_MOVE_PX + 1, y: 0 }), true)
})

test('settings copy follows the choice', () => {
  const plain = settingsView()
  assert.equal(plain.state, 'unconfigured')
  assert.match(plain.detail, /还没确认/)
  const chosen = settingsView({ confirmed: true, screens: [screen], side: 'left', phaseName: 'paused' })
  assert.match(chosen.detail, /左半边/)
  assert.equal(chosen.phase, '已暂停')
  const two = settingsView({
    confirmed: true,
    screens: [screen, { device: '\\\\.\\DISPLAY2', x: -1920, y: 0, width: 1920, height: 1080 }],
  })
  assert.equal(two.choices[0].place, '左边这块')
  assert.match(two.detail, /整块屏幕/)
})

test('core files stay free of the host and the window process', async () => {
  const dir = new URL('../lib/core/', import.meta.url)
  const files = await readdir(dir)
  const forbidden = /sidecar|overlay|@deepseek-ai|react|cordis/
  for (const file of files) {
    const text = await readFile(new URL(file, dir), 'utf8')
    assert.doesNotMatch(text, forbidden, file)
  }
})
