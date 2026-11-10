import assert from 'node:assert/strict'
import test from 'node:test'
import { startSession } from '../lib/session.js'

const screen = { device: '\\\\.\\DISPLAY1', x: 0, y: 0, width: 2560, height: 1440, primary: true, hasCursor: true }

function config(extra = {}) {
  return {
    confirmed: false,
    device: '',
    screenCount: 0,
    originX: 0,
    originY: 0,
    side: 'right',
    fraction: 0.5,
    stopped: false,
    screensJson: '[]',
    ...extra,
  }
}

function install(script) {
  let emit = () => {}
  const launch = async onEvent => {
    emit = onEvent
    return {
      async request(body) {
        script.calls.push(body.cmd)
        if (body.cmd === 'screens') return { ok: true, screens: [screen] }
        if (body.cmd === 'windows') return { ok: true, windows: script.windows }
        if (body.cmd === 'tree') return { ok: true, nodes: script.nodes }
        if (body.cmd === 'shot') return { ok: true, png: '' }
        return { ok: true }
      },
      async stop() {},
    }
  }
  return { launch, emit: event => emit(event) }
}

test('snapshot and act stay refused until the territory is confirmed', async () => {
  const script = { calls: [], windows: [], nodes: [] }
  const session = startSession({}, config(), { launch: install(script).launch })
  const shot = await session.snapshot()
  assert.match(shot.text, /还没确认/)
  assert.equal(script.calls.includes('windows'), false)
  await session.stop()
})

test('a button posts a click and a browser surface does not', async () => {
  const script = {
    calls: [],
    windows: [
      { hwnd: '7', title: '记事本', className: 'Notepad', processName: 'notepad.exe', x: 1280, y: 0, width: 1280, height: 1400 },
      { hwnd: '8', title: '网页', className: 'Chrome_WidgetWin_1', processName: 'chrome.exe', x: 1400, y: 100, width: 900, height: 800 },
    ],
    nodes: [
      { rid: '1', name: '确定', controlType: 'Button', className: 'Button', x: 1800, y: 400, width: 80, height: 30, patterns: [], password: false },
      { rid: '9', name: '界外', controlType: 'Button', className: 'Button', x: 100, y: 400, width: 80, height: 30, patterns: [], password: false },
    ],
  }
  const rig = install(script)
  const session = startSession({}, config({
    confirmed: true,
    device: screen.device,
    screenCount: 1,
    originX: 0,
    originY: 0,
  }), { launch: rig.launch })
  await session.refreshScreens()
  const shot = await session.snapshot()
  assert.match(shot.text, /\[e1\]/)
  assert.equal(shot.text.includes('界外'), false)
  assert.equal(shot.text.includes('网页'), true)
  const click = await session.act({ action: 'click', ref: 'e1' })
  assert.match(click.text, /已经点下去/)
  assert.match(click.text, /留在原地/)
  assert.equal(script.calls.includes('post'), true)
  script.nodes = [
    { rid: '2', name: '页面', controlType: 'Pane', className: 'Chrome_RenderWidgetHostHWND', x: 1500, y: 200, width: 400, height: 300, patterns: [], password: false },
  ]
  script.windows = [script.windows[1]]
  const again = await session.snapshot()
  const ref = again.text.match(/\[(e\d+)\]/)[1]
  script.calls.length = 0
  const blocked = await session.act({ action: 'click', ref })
  assert.match(blocked.text, /不能调用/)
  assert.equal(script.calls.includes('post'), false)
  await session.stop()
})

test('a press inside the territory refuses the next action', async () => {
  const script = {
    calls: [],
    windows: [
      { hwnd: '7', title: '记事本', className: 'Notepad', processName: 'notepad.exe', x: 1280, y: 0, width: 1280, height: 1400 },
    ],
    nodes: [
      { rid: '1', name: '文字', controlType: 'Edit', className: 'Edit', x: 1800, y: 400, width: 200, height: 40, patterns: ['value'], password: false, value: '' },
    ],
  }
  const rig = install(script)
  const session = startSession({}, config({
    confirmed: true, device: screen.device, screenCount: 1, originX: 0, originY: 0,
  }), { launch: rig.launch })
  await session.refreshScreens()
  await session.snapshot()
  rig.emit({ event: 'pointer', kind: 'down', button: 'left', x: 2000, y: 20 })
  const typed = await session.act({ action: 'type', ref: 'e1', value: '你好' })
  assert.match(typed.text, /已暂停/)
  assert.equal(script.calls.includes('setvalue'), false)
  await session.stop()
})

function desktopReply(body) {
  if (body.mode !== 'step') {
    return {
      ok: true,
      virtualScreen: screen,
      primaryScreen: screen,
      monitors: [screen],
      cursor: { x: 1, y: 2 },
      foreground: '',
    }
  }
  return {
    ok: true,
    actions: [],
    watch: [],
    capture: screen,
    virtualScreen: screen,
    cursor: { x: 9, y: 8 },
    foreground: '记事本',
    settledMs: 100,
    png: '',
  }
}

test('desktop_step does not need a confirmed territory', async () => {
  const script = { calls: [] }
  const launch = async () => ({
    async request(body) {
      script.calls.push(body.cmd)
      if (body.cmd === 'screens') return { ok: true, screens: [screen] }
      if (body.cmd === 'desktop') return desktopReply(body)
      return { ok: true }
    },
    async stop() {},
  })
  const session = startSession({}, config(), { launch })
  const shot = await session.desktopStep({})
  assert.equal(shot.ok, true)
  assert.match(shot.text, /只看了一眼/)
  assert.match(shot.text, /EvilOfRed/)
  assert.equal(script.calls.includes('desktop'), true)
  assert.equal(script.calls.includes('windows'), false)
  const metrics = await session.desktopMetrics()
  assert.match(metrics.text, /虚拟桌面/)
  assert.match(metrics.text, /不移动鼠标/)
  await session.stop()
})

test('a stopped gate refuses desktop_step before the desktop command', async () => {
  const script = { calls: [] }
  const session = startSession({}, config({ stopped: true }), { launch: install(script).launch })
  const shot = await session.desktopStep({ actions: [{ kind: 'click', x: 1, y: 1 }] })
  assert.match(shot.text, /已停止/)
  assert.equal(script.calls.includes('desktop'), false)
  await session.stop()
})

test('a bad desktop plan never reaches the sidecar', async () => {
  const script = { calls: [] }
  const session = startSession({}, config(), { launch: install(script).launch })
  const actions = Array.from({ length: 21 }, () => ({ kind: 'wait', ms: 1 }))
  const shot = await session.desktopStep({ actions })
  assert.match(shot.text, /最多 20/)
  assert.equal(script.calls.includes('desktop'), false)
  await session.stop()
})

test('a second desktop_step is refused while the first is running', async () => {
  let release
  const launch = async () => ({
    async request(body) {
      if (body.cmd === 'screens') return { ok: true, screens: [screen] }
      if (body.cmd === 'desktop' && body.mode === 'step') {
        return new Promise(resolve => { release = () => resolve(desktopReply(body)) })
      }
      return { ok: true }
    },
    async stop() {},
  })
  const session = startSession({}, config(), { launch })
  const first = session.desktopStep({})
  const second = await session.desktopStep({})
  assert.match(second.text, /上一动作还没结束/)
  for (let i = 0; i < 5 && !release; i += 1) await new Promise(resolve => setImmediate(resolve))
  release()
  const done = await first
  assert.equal(done.ok, true)
  await session.stop()
})

test('territory snapshot waits while a desktop step is running', async () => {
  let release
  const launch = async () => ({
    async request(body) {
      if (body.cmd === 'screens') return { ok: true, screens: [screen] }
      if (body.cmd === 'desktop' && body.mode === 'step') {
        return new Promise(resolve => { release = () => resolve(desktopReply(body)) })
      }
      return { ok: true }
    },
    async stop() {},
  })
  const session = startSession({}, config({
    confirmed: true, device: screen.device, screenCount: 1, originX: 0, originY: 0,
  }), { launch })
  const first = session.desktopStep({})
  const shot = await session.snapshot()
  assert.match(shot.text, /上一动作还没结束/)
  for (let i = 0; i < 5 && !release; i += 1) await new Promise(resolve => setImmediate(resolve))
  release()
  await first
  await session.stop()
})

test('an invalid watch is explained and does not pretend the step ran', async () => {
  const launch = async () => ({
    async request(body) {
      if (body.cmd === 'screens') return { ok: true, screens: [screen] }
      if (body.cmd === 'desktop') {
        return {
          ok: false,
          code: 'invalid-watch',
          requested: body.watch[0],
          virtualScreen: screen,
        }
      }
      return { ok: true }
    },
    async stop() {},
  })
  const session = startSession({}, config(), { launch })
  const shot = await session.desktopStep({ watch: [{ x: -10, y: 0, width: 5, height: 5 }] })
  assert.equal(shot.ok, false)
  assert.match(shot.text, /没有执行任何动作/)
  await session.stop()
})
