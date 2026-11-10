/**
 * Plan one desktop_step. The action set, limits, and report wording follow
 * dsh-desktop-tools-plugin 0.4.0 by EvilOfRed (MIT). See NOTICE.
 */

export const MAX_WATCH = 4
export const MAX_ACTIONS = 20
export const MAX_ACTION_TOTAL_MS = 15000
export const MAX_WAIT_MS = 10000
export const MAX_MOVE_DURATION_MS = 10000
export const DEFAULT_TIMEOUT_MS = 2000
export const MAX_TIMEOUT_MS = 2000
export const POLL_MS = 150
export const SETTLE_MS = 1200
export const FIXED_SETTLE_MS = 100
export const GRID_STEP = 200
export const MAX_TEXT_LENGTH = 20000
export const MAX_REPEAT = 50
export const MAX_SCROLL_AMOUNT = 50
export const WHEEL_STEP = 120

const NAMED_KEYS = {
  enter: 13, return: 13, tab: 9, esc: 27, escape: 27, space: 32,
  backspace: 8, back: 8, delete: 46, del: 46, insert: 45, ins: 45,
  home: 36, end: 35, pageup: 33, pgup: 33, pagedown: 34, pgdn: 34,
  up: 38, down: 40, left: 37, right: 39, capslock: 20, numlock: 144,
  scrolllock: 145, printscreen: 44, prtsc: 44, pause: 19, apps: 93, contextmenu: 93,
}
for (let index = 1; index <= 12; index += 1) NAMED_KEYS[`f${index}`] = 111 + index

const MODIFIER_ALIASES = {
  ctrl: 'ctrl', control: 'ctrl', ctl: 'ctrl', shift: 'shift', alt: 'alt',
  win: 'win', meta: 'win', super: 'win', cmd: 'win',
}

export const KEY_VOCABULARY = 'enter、tab、esc、space、backspace、delete、insert、home、end、pageup、pagedown、up、down、left、right、f1–f12、capslock、numlock、scrolllock、printscreen、apps，或单个 ASCII 可见字符（a、1、/）'

function fail(error) {
  return { ok: false, error }
}

function requireInteger(value, label) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return fail(`${label} 必须是整数像素，收到 ${JSON.stringify(value)}。`)
  }
  return { ok: true, value }
}

function clampInteger(value, fallback, minimum, maximum) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.round(value)))
}

function displayKeyToken(token) {
  if (/^f([1-9]|1[0-2])$/.test(token)) return token.toUpperCase()
  if (token.length === 1) return token.toUpperCase()
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
}

function singleCharCode(token) {
  if (token.length !== 1) return undefined
  const code = token.charCodeAt(0)
  if (code < 32 || code > 126) return undefined
  return code
}

export function parseKeyChord(raw) {
  const trimmed = String(raw ?? '').trim()
  if (trimmed === '') return fail('key 不能为空。')
  const chord = { ctrl: false, shift: false, alt: false, win: false, label: '' }
  const lone = singleCharCode(trimmed)
  if (lone !== undefined) {
    chord.charCode = lone
    chord.label = displayKeyToken(trimmed)
    return { ok: true, chord }
  }
  if (trimmed.length === 1) {
    return fail(`单字符键只支持 ASCII 可见字符，收到 ${JSON.stringify(trimmed)}；其它键请用名字：${KEY_VOCABULARY}。`)
  }
  const tokens = trimmed.split('+').map(token => token.trim()).filter(Boolean)
  if (tokens.length === 0) return fail('key 不能为空。')
  const main = tokens[tokens.length - 1]
  for (const token of tokens.slice(0, -1)) {
    const modifier = MODIFIER_ALIASES[token.toLowerCase()]
    if (!modifier) return fail(`${token} 不是修饰键：组合里只认 ctrl / shift / alt / win（例如 ctrl+a、ctrl+shift+tab）。`)
    chord[modifier] = true
  }
  const lowered = main.toLowerCase()
  if (MODIFIER_ALIASES[lowered]) return fail(`组合里必须有一个非修饰键，${main} 是修饰键；单按修饰键没有意义。`)
  if (NAMED_KEYS[lowered] !== undefined) {
    chord.vk = NAMED_KEYS[lowered]
    chord.label = displayKeyToken(lowered)
  } else {
    const code = singleCharCode(main)
    if (code === undefined) return fail(`不认识这个键名：${main}。可用：${KEY_VOCABULARY}。`)
    chord.charCode = code
    chord.label = displayKeyToken(main)
  }
  const prefix = []
  if (chord.ctrl) prefix.push('Ctrl')
  if (chord.shift) prefix.push('Shift')
  if (chord.alt) prefix.push('Alt')
  if (chord.win) prefix.push('Win')
  chord.label = [...prefix, chord.label].join('+')
  return { ok: true, chord }
}

function pointPair(entry, label, required) {
  const hasX = entry.x !== undefined
  const hasY = entry.y !== undefined
  if (hasX !== hasY) return fail(`${label} 的 x 与 y 必须成对给出。`)
  if (!hasX) {
    if (required) return fail(`${label} 需要落点：请给出 x 与 y。`)
    return { ok: true, point: null }
  }
  const x = requireInteger(entry.x, `${label} 的 x`)
  if (!x.ok) return x
  const y = requireInteger(entry.y, `${label} 的 y`)
  if (!y.ok) return y
  return { ok: true, point: { x: x.value, y: y.value } }
}

export function planActions(raw) {
  if (raw === undefined || raw === null) return { ok: true, actions: [] }
  if (!Array.isArray(raw)) return fail('actions 必须是数组。')
  if (raw.length > MAX_ACTIONS) return fail(`一批最多 ${MAX_ACTIONS} 个动作，收到 ${raw.length} 个；请拆成多步。`)
  const actions = []
  let totalMs = 0
  for (let index = 0; index < raw.length; index += 1) {
    const action = raw[index] || {}
    const position = `第 ${index + 1} 个动作`
    if (action.kind === 'move') {
      const point = pointPair(action, `${position}（move）`, true)
      if (!point.ok) return point
      const durationMs = clampInteger(action.duration_ms, 0, 0, MAX_MOVE_DURATION_MS)
      totalMs += durationMs
      actions.push({ kind: 'move', x: point.point.x, y: point.point.y, durationMs })
      continue
    }
    if (action.kind === 'click') {
      const point = pointPair(action, `${position}（click）`, false)
      if (!point.ok) return point
      const button = action.button === undefined ? 'left' : action.button
      if (button !== 'left' && button !== 'right') return fail(`${position} 的 button 只能是 left / right，收到 ${JSON.stringify(button)}。`)
      actions.push({
        kind: 'click',
        ...(point.point || {}),
        rightButton: button === 'right',
        count: clampInteger(action.count, 1, 1, 2),
      })
      continue
    }
    if (action.kind === 'text') {
      if (typeof action.text !== 'string' || action.text === '') return fail(`${position}（text）的 text 不能为空。`)
      if (action.text.length > MAX_TEXT_LENGTH) return fail(`${position}（text）超过 ${MAX_TEXT_LENGTH} 个字符，请拆成几次输入。`)
      actions.push({ kind: 'text', text: action.text, submit: action.submit === true })
      continue
    }
    if (action.kind === 'key') {
      if (typeof action.key !== 'string') return fail(`${position}（key）的 key 不能为空。`)
      const parsed = parseKeyChord(action.key)
      if (!parsed.ok) return fail(`${position}：${parsed.error}`)
      actions.push({ kind: 'key', chord: parsed.chord, repeat: clampInteger(action.repeat, 1, 1, MAX_REPEAT) })
      continue
    }
    if (action.kind === 'scroll') {
      const direction = action.direction
      if (!['up', 'down', 'left', 'right'].includes(direction)) {
        return fail(`${position}（scroll）的 direction 只能是 up / down / left / right，收到 ${JSON.stringify(direction)}。`)
      }
      const point = pointPair(action, `${position}（scroll）`, false)
      if (!point.ok) return point
      actions.push({
        kind: 'scroll',
        direction,
        horizontal: direction === 'left' || direction === 'right',
        delta: direction === 'up' || direction === 'right' ? WHEEL_STEP : -WHEEL_STEP,
        amount: clampInteger(action.amount, 3, 1, MAX_SCROLL_AMOUNT),
        ...(point.point || {}),
      })
      continue
    }
    if (action.kind === 'wait') {
      const ms = clampInteger(action.ms, 0, 0, MAX_WAIT_MS)
      totalMs += ms
      actions.push({ kind: 'wait', ms })
      continue
    }
    return fail(`${position} 的 kind 不认识：${JSON.stringify(action.kind)}。`)
  }
  if (totalMs > MAX_ACTION_TOTAL_MS) {
    return fail(`一批动作里的等待（移动时长 + wait）合计 ${totalMs} ms，超过上限 ${MAX_ACTION_TOTAL_MS} ms；请拆成多步。`)
  }
  return { ok: true, actions }
}

export function planWatch(raw) {
  if (raw === undefined || raw === null) return { ok: true, watch: [] }
  if (!Array.isArray(raw)) return fail('watch 必须是数组。')
  if (raw.length > MAX_WATCH) return fail(`监视区最多 ${MAX_WATCH} 块，收到 ${raw.length} 块。`)
  const watch = []
  for (let index = 0; index < raw.length; index += 1) {
    const rect = raw[index] || {}
    const x = requireInteger(rect.x, `第 ${index + 1} 块监视区的 x`)
    if (!x.ok) return x
    const y = requireInteger(rect.y, `第 ${index + 1} 块监视区的 y`)
    if (!y.ok) return y
    const width = requireInteger(rect.width, `第 ${index + 1} 块监视区的 width`)
    if (!width.ok) return width
    const height = requireInteger(rect.height, `第 ${index + 1} 块监视区的 height`)
    if (!height.ok) return height
    if (width.value <= 0 || height.value <= 0) {
      return fail(`第 ${index + 1} 块监视区 (${x.value}, ${y.value}) ${width.value}×${height.value} 无效：宽高必须是正数。`)
    }
    watch.push({ x: x.value, y: y.value, width: width.value, height: height.value })
  }
  return { ok: true, watch }
}

export function planDesktopStep(args) {
  const actions = planActions(args.actions)
  if (!actions.ok) return actions
  const watch = planWatch(args.watch)
  if (!watch.ok) return watch
  return {
    ok: true,
    planned: actions.actions,
    body: {
      mode: 'step',
      actions: actions.actions.map(toNativeAction),
      watch: watch.watch,
      timeoutMs: clampInteger(args.timeout_ms, DEFAULT_TIMEOUT_MS, 0, MAX_TIMEOUT_MS),
      annotate: args.annotate !== false,
      grid: args.grid === true,
      gridStep: GRID_STEP,
      pollMs: POLL_MS,
      settleMs: SETTLE_MS,
      fixedSettleMs: FIXED_SETTLE_MS,
    },
  }
}

function toNativeAction(action) {
  if (action.kind === 'move') {
    return {
      kind: 'move', x: action.x, y: action.y, durationMs: action.durationMs,
      steps: action.durationMs === 0 ? 1 : Math.min(240, Math.max(8, Math.round(action.durationMs / 16))),
    }
  }
  if (action.kind === 'click') {
    return {
      kind: 'click',
      hasPoint: action.x !== undefined && action.y !== undefined,
      x: action.x ?? 0, y: action.y ?? 0,
      rightButton: action.rightButton, count: action.count,
    }
  }
  if (action.kind === 'text') return { kind: 'text', text: action.text, submit: action.submit }
  if (action.kind === 'key') {
    return {
      kind: 'key', keyName: action.chord.label,
      vk: action.chord.vk ?? 0, hasVk: action.chord.vk !== undefined,
      charCode: action.chord.charCode ?? 0,
      ctrl: action.chord.ctrl, shift: action.chord.shift, alt: action.chord.alt, win: action.chord.win,
      repeat: action.repeat,
    }
  }
  if (action.kind === 'scroll') {
    return {
      kind: 'scroll', direction: action.direction, horizontal: action.horizontal,
      delta: action.delta, wheelSteps: action.amount,
      hasPoint: action.x !== undefined && action.y !== undefined,
      x: action.x ?? 0, y: action.y ?? 0,
    }
  }
  return { kind: 'wait', ms: action.ms }
}

export function describeRange(rect) {
  return `x ∈ [${rect.x}, ${rect.x + rect.width - 1}]、y ∈ [${rect.y}, ${rect.y + rect.height - 1}]`
}

function formatPercent(value) {
  const percent = value * 100
  if (!Number.isFinite(percent) || percent <= 0) return '0%'
  if (percent < 0.01) return '<0.01%'
  return `${percent.toFixed(2)}%`
}

function formatSeconds(ms) {
  return `${(ms / 1000).toFixed(2)} s`
}

function formatRect(rect) {
  return `(${rect.x}, ${rect.y}) ${rect.width}×${rect.height}`
}

function translateActionFailure(message, range) {
  const trimmed = String(message || '').trim()
  const outOfRange = /^out-of-range point (-?\d+) (-?\d+)$/.exec(trimmed)
  if (outOfRange && range) return `坐标 (${outOfRange[1]}, ${outOfRange[2]}) 不在虚拟桌面内（可用 ${describeRange(range)}）`
  if (trimmed.includes('SendInput delivered')) return '系统拒绝了这次输入注入：目标窗口可能以管理员身份运行，或会话被锁屏 / 正显示安全桌面'
  if (trimmed.includes('VkKeyScan')) return '当前键盘布局里没有这个字符对应的键'
  if (trimmed === 'stopped') return '已停止'
  return trimmed
}

function describeAction(action, report) {
  if (action.kind === 'move') {
    const landed = report?.cursor
    const target = `(${action.x}, ${action.y})`
    const glide = action.durationMs > 0 ? `（滑动 ${action.durationMs} ms）` : ''
    if (landed && (landed.x !== action.x || landed.y !== action.y)) return `移动光标到 ${target}${glide}，实际落在 (${landed.x}, ${landed.y})`
    return `移动光标到 ${target}${glide}`
  }
  if (action.kind === 'click') {
    const landed = report?.click
    const where = landed ? `(${landed.x}, ${landed.y})` : action.x === undefined ? '光标当前位置' : `(${action.x}, ${action.y})`
    return `在 ${where} ${action.rightButton ? '右键' : '左键'}${action.count >= 2 ? '双击' : '单击'}`
  }
  if (action.kind === 'text') return `输入 ${action.text.length} 个字符${action.submit ? ' 并回车' : ''}`
  if (action.kind === 'key') return `按 ${action.chord.label}${action.repeat > 1 ? ` × ${action.repeat}` : ''}`
  if (action.kind === 'scroll') {
    const names = { up: '上', down: '下', left: '左', right: '右' }
    return `向${names[action.direction]}滚 ${action.amount} 格`
  }
  return `等 ${action.ms} ms`
}

function watchRect(report) {
  if (report && report.rect && Number.isFinite(Number(report.rect.x))) return report.rect
  return {
    x: Number(report?.x) || 0,
    y: Number(report?.y) || 0,
    width: Number(report?.width) || 0,
    height: Number(report?.height) || 0,
  }
}

export function formatStepReport(planned, result, options = {}) {
  const lines = []
  const done = Array.isArray(result.actions) ? result.actions : []
  if (planned.length === 0) {
    lines.push(options.watchCount === 0 ? '本轮：没有执行任何操作（只看了一眼画面）。' : '本轮：没有执行任何操作，只是盯着监视区等变化。')
  } else {
    const described = planned.slice(0, done.length).map((action, index) => describeAction(action, done[index]))
    lines.push(`本轮：${described.length === 0 ? '没有动作被执行' : described.join(' → ')}`)
  }
  if (result.failedAction) {
    const failed = result.failedAction
    const label = planned[failed.index]?.kind ?? failed.kind
    lines.push(`第 ${failed.index + 1} 个动作（${label}）失败，这一批剩下的动作没有执行：${translateActionFailure(failed.message, result.virtualScreen)}。`)
  }
  const watch = Array.isArray(result.watch) ? result.watch : []
  if (watch.length > 0) {
    const parts = watch.map((report, index) => {
      const label = `R${index + 1}${formatRect(watchRect(report))}`
      if (!report.changed) return `${label} 没变化`
      return `${label} 变了（强变化 ${formatPercent(report.score)}、明显变化 ${formatPercent(report.mild)}、最大像素差 ${report.max}）`
    })
    if (options.timeoutMs === 0) lines.push(`监视：${parts.join('；')}。timeout_ms 是 0，这次没有等，动作之后直接截了图。`)
    else if (result.timedOut) lines.push(`监视：${parts.join('；')}。等了 ${formatSeconds(options.timeoutMs)} 上限。要么动作没生效，要么变化不在这几块矩形里。`)
    else {
      const settle = result.stable ? `静置 ${formatSeconds(result.settledMs)} 后画面已稳定` : `静置 ${formatSeconds(result.settledMs)} 后画面仍在变化`
      lines.push(`监视：${parts.join('；')}（${formatSeconds(result.detectedMs)} 后检出，${settle}）。`)
    }
  } else if (planned.length > 0) {
    lines.push(`等待：没给监视区，动作后固定静置 ${formatSeconds(result.settledMs || 0)} 再截图。`)
  }
  const capture = result.capture || result.virtualScreen || { width: 0, height: 0 }
  const scaled = options.scaled
    ? `附加的图像已缩到 ${options.scaled.width}×${options.scaled.height}，图上坐标要按比例换回屏幕坐标`
    : '图 x/y 与屏幕坐标一致'
  const marks = []
  if (options.annotate) {
    if (watch.length > 0) marks.push('红框配 R1/R2 = 本次监视区')
    if (planned.some(action => action.kind === 'click')) marks.push('绿圈是左键，橙圈是右键')
    marks.push('青色十字 = 当前光标位置')
  }
  if (options.grid) marks.push('网格刻度写的是屏幕坐标')
  const markText = marks.length === 0 ? '' : `。叠加记号：${marks.join('、')}。记号是插件画的`
  lines.push(`画面：整个虚拟桌面 ${capture.width}×${capture.height}（${scaled}）${markText}。`)
  const cursor = result.cursor || { x: 0, y: 0 }
  const foreground = result.foreground && String(result.foreground).trim() ? result.foreground : '读不到'
  lines.push(`光标 (${cursor.x}, ${cursor.y})。前台窗口：${foreground}。`)
  lines.push('这一步移动了系统鼠标。下一步看画面再决定。任务完成就停止操作桌面。')
  lines.push('思路借鉴 dsh-desktop-tools-plugin（EvilOfRed，MIT）。')
  return lines.join('\n')
}

export function formatMetrics(result) {
  const lines = [
    `虚拟桌面：${describeRange(result.virtualScreen)}，尺寸 ${result.virtualScreen.width}×${result.virtualScreen.height}`,
    `主显示器：${result.primaryScreen.width}×${result.primaryScreen.height}`,
    `显示器（${(result.monitors || []).length}）：`,
  ]
  for (const monitor of result.monitors || []) lines.push(`  - ${formatRect(monitor)}`)
  lines.push(`光标当前位置：(${result.cursor.x}, ${result.cursor.y})`)
  lines.push(result.foreground && String(result.foreground).trim() ? `前台窗口：${result.foreground}` : '前台窗口：读不到')
  lines.push('坐标都是物理像素。这一步不移动鼠标。')
  return lines.join('\n')
}

export function formatDesktopFailure(reply) {
  if (reply?.reason) return reply.reason
  const screen = reply?.virtualScreen
  if (reply?.code === 'invalid-watch' && reply.requested && screen) {
    const rect = reply.requested
    return `监视区 (${rect.x}, ${rect.y}) ${rect.width}×${rect.height} 无效：整个矩形要落在虚拟桌面内（可用范围 ${describeRange(screen)}）。这次没有执行任何动作。`
  }
  return translateActionFailure(reply?.error || '调用失败', screen)
}
