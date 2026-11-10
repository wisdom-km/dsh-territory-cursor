import assert from 'node:assert/strict'
import test from 'node:test'
import { hostModuleUrl } from '../lib/host-resolve.js'

test('host packages resolve inside the running app.asar', () => {
  const url = hostModuleUrl('G:\\DeepSeek-Harness\\App\\DeepSeek Harness.exe', 'dsh-tools', 'index.js')
  assert.match(url, /^file:\/\//)
  assert.match(url, /app\.asar\/dsh\/node_modules\/@deepseek-ai\/dsh-tools\/lib\/index\.js$/)
})
