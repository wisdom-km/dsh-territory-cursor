import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('the window process does not move the system pointer or forge keys', async () => {
  const host = await readFile(new URL('../sidecar/Host.cs', import.meta.url), 'utf8')
  const overlay = await readFile(new URL('../overlay/Overlay.cs', import.meta.url), 'utf8')
  const text = `${host}\n${overlay}`
  assert.doesNotMatch(text, /SetCursorPos|SendInput|mouse_event|keybd_event|SetForegroundWindow|SetActiveWindow/)
})

test('the host entry names both tools', async () => {
  const main = await readFile(new URL('../lib/main.js', import.meta.url), 'utf8')
  const tools = await readFile(new URL('../lib/tools.js', import.meta.url), 'utf8')
  assert.match(main, /defineTool/)
  assert.match(tools, /territory_snapshot/)
  assert.match(tools, /territory_act/)
})
