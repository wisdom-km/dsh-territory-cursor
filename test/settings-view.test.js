import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import { settingsView } from '../lib/core/settings-view.js'
import { apply, name } from '../lib/main.js'

test('step 1 settings view is unconfigured', () => {
  const view = settingsView()
  assert.equal(view.state, 'unconfigured')
  assert.equal(view.title, '地盘光标')
  assert.match(view.detail, /还没确认/)
})

test('core imports no host, window, or cursor code', async () => {
  const dir = new URL('../lib/core/', import.meta.url)
  const files = await readdir(dir)
  const forbidden = /sidecar|overlay|@deepseek-ai|react|cordis/
  for (const file of files) {
    const text = await readFile(new URL(file, dir), 'utf8')
    assert.doesNotMatch(text, forbidden, file)
  }
})

test('host entry logs the unconfigured page and registers nothing else', () => {
  const lines = []
  const ctx = {
    logger: { info: (fmt, ...args) => lines.push([fmt, ...args].join(' ')) },
    tools: { register() { throw new Error('step 1 must not register a tool') } },
  }
  apply(ctx)
  assert.equal(name, 'territory-cursor')
  assert.match(lines.join('\n'), /地盘光标/)
})

test('settings page shows the core copy', async () => {
  const view = settingsView()
  const client = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(client, new RegExp(view.title))
  assert.match(client, new RegExp(view.detail))
})
