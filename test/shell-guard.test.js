import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('territory files do not move the system pointer', async () => {
  const host = await readFile(new URL('../sidecar/Host.cs', import.meta.url), 'utf8')
  const overlay = await readFile(new URL('../overlay/Overlay.cs', import.meta.url), 'utf8')
  const banned = /SetCursorPos|SendInput|mouse_event|keybd_event|SetForegroundWindow|SetActiveWindow/
  assert.doesNotMatch(host, banned)
  assert.doesNotMatch(overlay, banned)
})

test('the desktop step borrows SendInput only inside DesktopInput', async () => {
  const desktop = await readFile(new URL('../sidecar/DesktopInput.cs', import.meta.url), 'utf8')
  const notice = await readFile(new URL('../NOTICE', import.meta.url), 'utf8')
  assert.match(desktop, /SetCursorPos/)
  assert.match(desktop, /SendInput/)
  assert.match(desktop, /EvilOfRed/)
  assert.match(notice, /EvilOfRed/)
  assert.match(notice, /dsh-desktop-tools-plugin 0\.4\.0/)
  assert.doesNotMatch(desktop, /mouse_event|keybd_event|SetForegroundWindow|SetActiveWindow/)
})

test('the host entry names the territory tools and the desktop step', async () => {
  const main = await readFile(new URL('../lib/main.js', import.meta.url), 'utf8')
  const tools = await readFile(new URL('../lib/tools.js', import.meta.url), 'utf8')
  assert.match(main, /defineTool/)
  assert.match(tools, /territory_snapshot/)
  assert.match(tools, /territory_act/)
  assert.match(tools, /desktop_step/)
  assert.match(tools, /get_screen_metrics/)
  assert.doesNotMatch(tools, /territory_launch/)
})
