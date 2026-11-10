import { movedSignificantly, planClick, planType } from './core/action.js'
import { QUIET_MS, createGate, keyDown, keyUp, phase, phaseLabel, pointerDown, pointerMove, pointerUp, pointerWheel, setStopped } from './core/gate.js'
import { beginAct, beginSnapshot, endAct } from './core/round.js'
import { resolveTerritory } from './core/territory.js'
import { windowsInside } from './core/windows.js'
import { launchSidecar } from './ports/sidecar.js'

function readValue(config, key, fallback) {
  const raw = config?.[key]
  if (raw && typeof raw.get === 'function') return raw.get()
  if (raw === undefined || raw === null) return fallback
  return raw
}

/** Plain values, whether they came from a volatile field or a test object. */
export function readConfig(config) {
  let screens = []
  try { screens = JSON.parse(readValue(config, 'screensJson', '[]')) } catch { screens = [] }
  return {
    confirmed: Boolean(readValue(config, 'confirmed', false)),
    device: String(readValue(config, 'device', '')),
    screenCount: Number(readValue(config, 'screenCount', 0)),
    originX: Number(readValue(config, 'originX', 0)),
    originY: Number(readValue(config, 'originY', 0)),
    side: String(readValue(config, 'side', 'right')),
    fraction: Number(readValue(config, 'fraction', 0.5)),
    stopped: Boolean(readValue(config, 'stopped', false)),
    screens: Array.isArray(screens) ? screens : [],
  }
}

function settingsApi(ctx) {
  try {
    if (ctx?.settings && typeof ctx.settings.mutate === 'function') return ctx.settings
  } catch { /* settings service is not injected in this composition */ }
  try {
    const got = ctx?.get?.('settings')
    if (got && typeof got.mutate === 'function') return got
  } catch { /* settings service is not injected in this composition */ }
  return null
}

/**
 * One running territory. Tools and the settings page share this object.
 * @param {object} ctx host context
 * @param {object} config volatile plugin config
 * @param {{ launch?: typeof launchSidecar }} [options]
 */
export function startSession(ctx, config, options = {}) {
  const launch = options.launch || launchSidecar
  const gate = createGate()
  let live = readConfig(config)
  gate.stopped = live.stopped
  let port = null
  let starting = null
  let snapshot = null
  let territory = null
  let screens = live.screens
  let cursor = null
  let quietTimer = null
  const log = message => ctx?.logger?.info?.('%s', message)

  function watchPhase(before) {
    const after = phase(gate, territory, Date.now())
    if (before !== after) void pushOverlay()
  }

  function armQuiet() {
    clearTimeout(quietTimer)
    quietTimer = setTimeout(() => watchPhase('paused'), QUIET_MS + 20)
  }

  ctx?.on?.('loader/volatile-update', () => {
    live = readConfig(config)
    screens = live.screens.length ? live.screens : screens
    setStopped(gate, live.stopped)
    void pushOverlay()
  })

  async function publish(patch) {
    Object.assign(live, patch)
    const settings = settingsApi(ctx)
    if (!settings) return
    const ops = Object.entries(patch).map(([key, value]) => ({ op: 'set', path: [key], value }))
    try { await settings.mutate('territory-cursor', ops) } catch (error) { log(error.message) }
  }

  async function ensure() {
    if (port) return port
    if (!starting) {
      starting = launch(onEvent).then(value => {
        port = value
        return value
      }).finally(() => { starting = null })
    }
    return starting
  }

  function onEvent(event) {
    const now = Date.now()
    const before = gate.stopped ? 'stopped' : gate.paused ? 'paused' : 'running'
    if (event.event === 'pointer' && event.kind === 'move') pointerMove(gate, event.x, event.y)
    else if (event.event === 'pointer' && event.kind === 'down') pointerDown(gate, event.button || 'left', event.x, event.y, territory)
    else if (event.event === 'pointer' && event.kind === 'up') {
      pointerUp(gate, event.button || 'left', event.x, event.y, now)
      armQuiet()
    } else if (event.event === 'pointer' && event.kind === 'wheel') pointerWheel(gate, event.x, event.y, territory)
    else if (event.event === 'key' && event.kind === 'down') keyDown(gate, event.vk)
    else if (event.event === 'key' && event.kind === 'up') {
      keyUp(gate, event.vk, now)
      armQuiet()
    } else if (event.event === 'stop') {
      setStopped(gate, true)
      void publish({ stopped: true })
    } else if (event.event === 'divider') {
      live.fraction = Number(event.fraction)
      void publish({ fraction: live.fraction })
      void pushOverlay()
    }
    watchPhase(before)
  }

  async function refreshScreens() {
    const sidecar = await ensure()
    const reply = await sidecar.request({ cmd: 'screens' })
    if (!reply.ok) return []
    screens = reply.screens || []
    const encoded = JSON.stringify(screens)
    if (encoded !== live.screensJson) await publish({ screensJson: encoded })
    const resolved = resolveTerritory(live, screens)
    if (resolved.reask) {
      territory = null
      snapshot = null
      await publish({ confirmed: false })
    } else if (resolved.ok) territory = resolved
    await pushOverlay()
    return screens
  }

  async function pushOverlay() {
    if (!port) return
    const resolved = resolveTerritory(live, screens)
    territory = resolved.ok ? resolved : null
    const name = phase(gate, territory, Date.now())
    if (!territory) {
      await port.request({ cmd: 'overlay', visible: false })
      return
    }
    const body = {
      cmd: 'overlay',
      visible: true,
      x: territory.rect.x,
      y: territory.rect.y,
      width: territory.rect.width,
      height: territory.rect.height,
      screenX: territory.screen.x,
      screenY: territory.screen.y,
      screenW: territory.screen.width,
      screenH: territory.screen.height,
      side: territory.kind === 'display' ? 'display' : territory.side,
      label: phaseLabel(name),
      cursor: Boolean(cursor),
      cursorX: cursor?.x || 0,
      cursorY: cursor?.y || 0,
    }
    await port.request(body)
  }

  function textOf(rows) {
    const lines = []
    if (!territory) return '地盘还没确认'
    lines.push(`地盘 ${territory.rect.width}×${territory.rect.height}`)
    if (rows.length === 0) lines.push('地盘里没有可操作的窗口。')
    for (const row of rows) {
      const mark = row.covered ? ' 被挡住' : ''
      lines.push(`窗口 ${row.title || row.className}${mark}`)
      for (const node of row.nodes) {
        const password = node.password ? ' 密码框' : ''
        const value = node.password || node.value === undefined ? '' : ` 值=${JSON.stringify(node.value)}`
        lines.push(`  [${node.ref}] ${node.name || node.controlType}${password}${value}`)
      }
    }
    lines.push('下一步用 ref 调用 territory_act。用户点过或按过键之后，先重新截图。')
    return lines.join('\n')
  }

  async function takeSnapshot() {
    await refreshScreens()
    const resolved = resolveTerritory(live, screens)
    const opened = beginSnapshot(resolved)
    if (!opened.ok) {
      if (opened.reask) await publish({ confirmed: false })
      return { ok: false, reason: opened.reason, text: opened.reason }
    }
    territory = resolved
    const started = gate.generation
    const sidecar = await ensure()
    const listed = await sidecar.request({ cmd: 'windows' })
    if (!listed.ok) return { ok: false, reason: '没有列到窗口', text: '没有列到窗口' }
    const visible = windowsInside(listed.windows || [], territory).slice(0, 8)
    const refs = []
    let count = 1
    for (const win of visible) {
      const tree = await sidecar.request({ cmd: 'tree', hwnd: String(win.hwnd) })
      const nodes = (tree.nodes || []).slice(0, 80).map(node => {
        const ref = `e${count}`
        count += 1
        const stamped = { ...node, ref, hwnd: String(win.hwnd) }
        refs.push({ ...stamped, covered: win.covered, processName: win.processName, windowCenter: win.center })
        return stamped
      })
      win.nodes = nodes
    }
    if (gate.generation !== started) return { ok: false, reason: '先重新截一张图', text: '先重新截一张图' }
    const shot = await sidecar.request({
      cmd: 'shot',
      x: territory.rect.x,
      y: territory.rect.y,
      width: territory.rect.width,
      height: territory.rect.height,
    }, 15000)
    snapshot = { generation: started, refs }
    const png = shot.ok && shot.png ? Buffer.from(shot.png, 'base64') : null
    return { ok: true, text: textOf(visible), png, width: territory.rect.width, height: territory.rect.height }
  }

  async function act(args) {
    await refreshScreens()
    const resolved = resolveTerritory(live, screens)
    const opened = beginAct(resolved, gate, snapshot?.generation, resolved.ok ? resolved : null, Date.now())
    if (!opened.ok) {
      if (opened.reask) await publish({ confirmed: false })
      return { ok: false, reason: opened.reason, text: opened.reason }
    }
    try {
      territory = resolved
      const saved = snapshot.refs.find(item => item.ref === args.ref)
      if (!saved) return { ok: false, reason: '没有这个 ref', text: '没有这个 ref' }
      const sidecar = await ensure()
      const listed = await sidecar.request({ cmd: 'windows' })
      const freshWindows = windowsInside(listed.windows || [], territory)
      const freshWindow = freshWindows.find(item => String(item.hwnd) === String(saved.hwnd))
      if (!freshWindow) return { ok: false, reason: '窗口中心不在地盘里', text: '窗口中心不在地盘里' }
      if (movedSignificantly(saved.windowCenter, freshWindow.center)) {
        return { ok: false, reason: '先重新截一张图', text: '先重新截一张图' }
      }
      const tree = await sidecar.request({ cmd: 'tree', hwnd: String(saved.hwnd) })
      const fresh = (tree.nodes || []).find(node => node.rid === saved.rid)
      if (!fresh) return { ok: false, reason: '没有这个 ref', text: '没有这个 ref' }
      const center = { x: fresh.x + fresh.width / 2, y: fresh.y + fresh.height / 2 }
      if (movedSignificantly(centerOf(saved), center)) {
        return { ok: false, reason: '先重新截一张图', text: '先重新截一张图' }
      }
      if (gate.generation !== snapshot.generation) return { ok: false, reason: '先重新截一张图', text: '先重新截一张图' }
      const control = { ...fresh, center, className: fresh.className }
      const plan = args.action === 'type'
        ? planType(control, args.value, territory)
        : planClick(control, freshWindow, territory)
      if (!plan.ok) return { ok: false, reason: plan.reason, text: plan.reason }
      cursor = center
      await pushOverlay()
      if (gate.generation !== snapshot.generation) return { ok: false, reason: '先重新截一张图', text: '先重新截一张图' }
      const reply = await sidecar.request({
        cmd: plan.kind === 'setvalue' ? 'setvalue' : plan.kind,
        hwnd: String(saved.hwnd),
        rid: saved.rid,
        value: plan.value || '',
      })
      if (!reply.ok) {
        const reason = plan.kind === 'setvalue' ? '赋值失败' : '调用失败'
        return { ok: false, reason, text: reason }
      }
      const verb = plan.kind === 'setvalue' ? '已经整段写入' : '已经点下去'
      return { ok: true, text: `${verb} [${saved.ref}]。系统鼠标留在原地。` }
    } finally {
      endAct(gate)
    }
  }

  void refreshScreens().catch(error => log(error.message))

  return {
    refreshScreens,
    snapshot: takeSnapshot,
    act,
    async stop() {
      clearTimeout(quietTimer)
      if (port) await port.stop()
      port = null
    },
  }
}

function centerOf(node) {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 }
}
