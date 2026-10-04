/**
 * The host-plugin seam: both tools register, validate their arguments, and answer from a local
 * registry snapshot. The harness peer packages are not resolvable in every checkout, so this module
 * skips itself rather than failing when they are absent.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

let plugin = null
let unavailable = null
try {
  plugin = await import('../src/index.js')
} catch (error) {
  unavailable = error instanceof Error ? error.message : String(error)
}

const skip = plugin === null ? `harness peer modules are not resolvable here: ${unavailable}` : false
const fixture = new URL('./fixtures/registry.json', import.meta.url).pathname
const rowConfig = { perRole: 2, registryPath: fixture, offline: true, registryUrl: 'https://example.test/plugins.json' }

/** @returns {Map<string, object>} tools registered by apply() */
function registeredTools() {
  const tools = new Map()
  plugin.apply({ tools: { register: (tool) => tools.set(tool.name, tool) } }, rowConfig)
  return tools
}

test('the module exports the Cordis plugin shape', { skip }, () => {
  assert.equal(plugin.name, 'stack-composer')
  assert.deepEqual(plugin.inject, ['tools'])
  assert.equal(typeof plugin.apply, 'function')
})

test('Config carries the row defaults', { skip }, () => {
  const config = plugin.Config({})
  assert.equal(config.perRole, 2)
  assert.equal(config.offline, false)
  assert.equal(config.registryPath, '')
  assert.match(config.registryUrl, /^https:/)
})

test('apply registers both tools with the documented parameters', { skip }, () => {
  const tools = registeredTools()
  assert.deepEqual([...tools.keys()].sort(), ['plugin_capabilities', 'stack_compose'])
  assert.deepEqual(Object.keys(tools.get('stack_compose').parameters.properties), ['purpose', 'perRole', 'refresh'])
  assert.deepEqual(tools.get('stack_compose').parameters.required, ['purpose'])
  assert.deepEqual(Object.keys(tools.get('plugin_capabilities').parameters.properties), ['query', 'limit', 'category', 'capability'])
})

test('stack_compose answers from the snapshot with roles, gaps and a report', { skip }, async () => {
  const tool = registeredTools().get('stack_compose')
  const value = await tool.execute({ purpose: 'a fully equipped DevOps stack' }, {})
  assert.equal(value.preset, 'devops')
  assert.equal(value.roles, 9)
  assert.ok(value.plugins >= 9)
  assert.equal(value.gaps, 0)
  assert.match(value.report, /acme\/dsh-docker-compose/)
  assert.match(value.report, /install plan/)
})

test('plugin_capabilities answers a capability question', { skip }, async () => {
  const tool = registeredTools().get('plugin_capabilities')
  const value = await tool.execute({ query: 'query data sql', limit: 3 }, {})
  assert.ok(value.count >= 1)
  assert.match(value.report, /acme\/dsh-sql-duckdb/)
  assert.match(value.report, /capabilities: /)
})

test('a missing required argument is rejected', { skip }, async () => {
  const tool = registeredTools().get('stack_compose')
  await assert.rejects(() => tool.execute({}, {}))
  await assert.rejects(() => tool.execute({ purpose: 42 }, {}))
})
