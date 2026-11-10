import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { settingsView } from '../lib/core/settings-view.js'

test('settings page shows the core copy', async () => {
  const view = settingsView()
  const client = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(client, new RegExp(view.title))
  assert.match(client, new RegExp(view.detail))
  assert.match(client, /确认地盘/)
})
