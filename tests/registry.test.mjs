/**
 * Registry tests: parsing, the cache, the TTL, and the offline path, all with an injected fetch so
 * nothing touches the network.
 */

import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cacheFileFor, defaultCacheFile, loadRegistry, parseRegistry } from '../src/registry.js'

const dirs = []
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})
/** @returns {string} a fresh temp directory */
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'composer-'))
  dirs.push(dir)
  return dir
}

const DOCUMENT = JSON.stringify({
  updated: '2026-10-01',
  plugins: [
    { name: 'a/one', url: 'https://github.com/a/one', category: 'dev', description: { en: 'One.' }, capabilities: ['shell'], stars: 1, downloads: 2 },
    { name: 'b/two', url: 'https://github.com/b/two', category: 'docs', description: { en: 'Two.' }, capabilities: [], stars: 3, downloads: 4 },
    { name: 'no-url' },
  ],
})

test('a registry document parses from either shape and drops entries with no repository', () => {
  const wrapped = parseRegistry(DOCUMENT)
  assert.equal(wrapped.entries.length, 2)
  assert.equal(wrapped.meta.updated, '2026-10-01')
  assert.equal(wrapped.entries[0].slug, 'a/one')
  assert.equal(wrapped.entries[0].category, 'dev')

  const bare = parseRegistry(JSON.stringify([{ name: 'c/three', url: 'https://github.com/c/three' }]))
  assert.equal(bare.entries.length, 1)
  assert.equal(bare.entries[0].install, '')
  assert.equal(bare.meta.updated, null)
})

test('a document without a plugins array is rejected rather than silently empty', () => {
  assert.throws(() => parseRegistry('{"nope":1}'), /no plugins array/)
  assert.throws(() => parseRegistry('not json'), SyntaxError)
})

test('an explicit path is read directly and never cached', async () => {
  const dir = tempDir()
  const file = join(dir, 'snapshot.json')
  writeFileSync(file, DOCUMENT)
  const loaded = await loadRegistry({ path: file, cacheFile: join(dir, 'cache.json') })
  assert.equal(loaded.source, file)
  assert.equal(loaded.entries.length, 2)
  assert.equal(loaded.fetchedAt, null)
})

test('a fetch populates the cache and a second load inside the TTL does not refetch', async () => {
  const dir = tempDir()
  const cacheFile = join(dir, 'nested', 'registry.json')
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return { ok: true, text: async () => DOCUMENT }
  }
  const first = await loadRegistry({ cacheFile, fetchImpl })
  assert.equal(calls, 1)
  assert.equal(first.source, 'https://awesome-dsh-plugin.com/plugins.json')
  assert.equal(readFileSync(cacheFile, 'utf8'), DOCUMENT)

  const second = await loadRegistry({
    cacheFile,
    fetchImpl: async () => {
      throw new Error('should not have been called')
    },
  })
  assert.equal(second.entries.length, 2)
  assert.equal(second.fresh, true)
})

test('an expired cache is refetched, and offline uses it anyway', async () => {
  const dir = tempDir()
  const cacheFile = join(dir, 'registry.json')
  writeFileSync(cacheFile, DOCUMENT)
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return { ok: true, text: async () => JSON.stringify({ plugins: [{ name: 'new/entry', url: 'https://github.com/new/entry' }] }) }
  }
  const later = new Date(Date.now() + 48 * 60 * 60 * 1000)
  const refreshed = await loadRegistry({ cacheFile, fetchImpl, now: later })
  assert.equal(calls, 1)
  assert.equal(refreshed.entries[0].slug, 'new/entry')

  const offline = await loadRegistry({ cacheFile, offline: true, now: later, fetchImpl })
  assert.equal(offline.fresh, false)
  assert.equal(offline.entries.length, 1)
})

test('offline with no cache fails with an actionable message', async () => {
  const dir = tempDir()
  await assert.rejects(
    () => loadRegistry({ cacheFile: join(dir, 'missing.json'), offline: true }),
    /no usable registry cache/,
  )
})

test('a failing registry response is reported, not swallowed', async () => {
  const dir = tempDir()
  await assert.rejects(
    () => loadRegistry({ cacheFile: join(dir, 'registry.json'), fetchImpl: async () => ({ ok: false, status: 503, text: async () => '' }) }),
    /answered 503/,
  )
})

test('the cache is keyed by registry URL, so an overridden registry cannot poison the default', async () => {
  const dir = tempDir()
  const home = join(dir, 'home')
  const evil = JSON.stringify({ updated: '2020-01-01', plugins: [{ name: 'evil/only', url: 'https://github.com/evil/only' }] })
  await loadRegistry({
    dshHome: home,
    url: 'https://someone-elses.example/plugins.json',
    fetchImpl: async () => ({ ok: true, text: async () => evil }),
  })
  // The default registry has never been fetched here, so an offline load must fail rather than
  // serve the other source's document as the curated one.
  await assert.rejects(
    () => loadRegistry({ dshHome: home, offline: true }),
    /no usable registry cache/,
  )
  const defaultLoad = await loadRegistry({
    dshHome: home,
    fetchImpl: async () => ({ ok: true, text: async () => DOCUMENT }),
  })
  assert.equal(defaultLoad.entries.length, 2)
  const overridden = await loadRegistry({ dshHome: home, url: 'https://someone-elses.example/plugins.json', offline: true })
  assert.equal(overridden.entries[0].slug, 'evil/only')
})

test('the default cache path is URL-keyed and distinct per source', () => {
  const home = join(tempDir(), 'home')
  assert.notEqual(defaultCacheFile(home), cacheFileFor('https://other.example/plugins.json', home))
  assert.equal(defaultCacheFile(home), cacheFileFor('https://awesome-dsh-plugin.com/plugins.json', home))
})
