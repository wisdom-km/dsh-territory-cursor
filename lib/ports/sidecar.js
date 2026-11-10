import { spawn } from 'node:child_process'
import { mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const framework = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319'
const csc = join(framework, 'csc.exe')
const wpf = join(framework, 'WPF')
const exe = join(root, 'sidecar', 'bin', 'Territory.exe')

/** Compile the window process when a source is newer than the exe. */
export async function buildSidecar() {
  await mkdir(dirname(exe), { recursive: true })
  const sources = [
    join(root, 'sidecar', 'Host.cs'),
    join(root, 'overlay', 'Overlay.cs'),
    join(root, 'sidecar', 'app.manifest'),
  ]
  let built = 0
  try {
    built = (await stat(exe)).mtimeMs
  } catch {
    built = 0
  }
  let newest = 0
  for (const source of sources) newest = Math.max(newest, (await stat(source)).mtimeMs)
  if (built >= newest) return exe
  await exec(csc, [
    '/nologo',
    '/target:winexe',
    '/utf8output',
    '/codepage:65001',
    '/platform:anycpu',
    `/win32manifest:${join(root, 'sidecar', 'app.manifest')}`,
    `/out:${exe}`,
    '/reference:System.Drawing.dll',
    `/reference:${join(wpf, 'UIAutomationClient.dll')}`,
    `/reference:${join(wpf, 'UIAutomationTypes.dll')}`,
    `/reference:${join(wpf, 'WindowsBase.dll')}`,
    '/reference:System.Web.Extensions.dll',
    join(root, 'sidecar', 'Host.cs'),
    join(root, 'overlay', 'Overlay.cs'),
  ])
  return exe
}

function exec(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `csc exited ${code}`))
    })
  })
}

/** Keep one process for screens, trees, clicks, and the input watch. */
export async function launchSidecar(onEvent) {
  const path = await buildSidecar()
  const child = spawn(path, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let buffer = ''
  let next = 1
  const pending = new Map()
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    buffer += chunk
    let breakAt = buffer.indexOf('\n')
    while (breakAt >= 0) {
      const line = buffer.slice(0, breakAt).trim()
      buffer = buffer.slice(breakAt + 1)
      breakAt = buffer.indexOf('\n')
      if (!line) continue
      let msg
      try { msg = JSON.parse(line) } catch { continue }
      if (msg.event) onEvent(msg)
      else if (pending.has(msg.id)) pending.get(msg.id)(msg)
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', () => {})

  function request(body, timeoutMs = 8000) {
    const id = next
    next += 1
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('旁车没有回应'))
      }, timeoutMs)
      pending.set(id, msg => {
        clearTimeout(timer)
        pending.delete(id)
        resolve(msg)
      })
      child.stdin.write(`${JSON.stringify({ ...body, id })}\n`)
    })
  }

  async function stop() {
    try { await request({ cmd: 'quit' }, 500) } catch { /* process is leaving */ }
    child.kill()
  }

  return { request, stop }
}
