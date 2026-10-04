/**
 * Registry access: the curated plugin list the composer reasons over, with a cache so a stack can
 * be composed repeatedly without refetching a multi-megabyte JSON document.
 * @module dsh-stack-composer/registry
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { normalizeEntry } from './capabilities.js'

/** The curated registry the dsh-plugin directory publishes. */
export const REGISTRY_URL = 'https://awesome-dsh-plugin.com/plugins.json'
/** How long a fetched registry stays fresh. */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Default cache location under the DSH home.
 * @param {string} [dshHome] - DSH home directory.
 * @returns {string} the cache file path.
 */
export function defaultCacheFile(dshHome) {
  const home = dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'storages', 'stack-composer', 'registry.json')
}

/**
 * Parse a registry document.
 * @param {string} text - JSON text, either `{plugins: [...]}` or a bare array.
 * @returns {{entries: object[], meta: {updated: string|null, count: number}}} the parsed index.
 */
export function parseRegistry(text) {
  const raw = JSON.parse(text)
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.plugins) ? raw.plugins : null
  if (!list) throw new Error('registry JSON has no plugins array')
  const entries = list
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => normalizeEntry(entry))
    .filter((entry) => entry.slug !== '')
  return {
    entries,
    meta: {
      updated: typeof raw?.updated === 'string' ? raw.updated : null,
      count: entries.length,
    },
  }
}

/**
 * Load the registry from an explicit file, the cache, or the network.
 * @param {object} [options] - loading options.
 * @param {string} [options.path] - read this file instead of the cache or the network.
 * @param {string} [options.url] - registry URL.
 * @param {string} [options.cacheFile] - cache path.
 * @param {number} [options.cacheTtlMs] - freshness window.
 * @param {boolean} [options.offline] - never fetch; fail when no usable cache exists.
 * @param {typeof fetch} [options.fetchImpl] - injectable fetch for tests.
 * @param {Date|string} [options.now] - clock override.
 * @param {number} [options.timeoutMs] - network timeout.
 * @returns {Promise<{entries: object[], source: string, fresh: boolean, fetchedAt: string|null, updated: string|null}>}
 *   the index and where it came from.
 */
export async function loadRegistry(options = {}) {
  const cacheFile = options.cacheFile ?? defaultCacheFile(options.dshHome)
  const ttl = options.cacheTtlMs ?? CACHE_TTL_MS
  const now = options.now instanceof Date ? options.now : options.now ? new Date(options.now) : new Date()

  if (options.path) {
    const parsed = parseRegistry(readFileSync(options.path, 'utf8'))
    return { ...parsed, source: options.path, fresh: true, fetchedAt: null }
  }

  if (existsSync(cacheFile)) {
    const age = now.getTime() - statSync(cacheFile).mtimeMs
    if (options.offline || age < ttl) {
      try {
        const parsed = parseRegistry(readFileSync(cacheFile, 'utf8'))
        return { ...parsed, source: cacheFile, fresh: age < ttl, fetchedAt: new Date(statSync(cacheFile).mtimeMs).toISOString() }
      } catch {
        if (options.offline) throw new Error(`the cached registry at ${cacheFile} could not be parsed`)
      }
    }
  }

  if (options.offline) {
    throw new Error(`no usable registry cache at ${cacheFile}; run once without --offline, or pass --registry <path>`)
  }

  const doFetch = options.fetchImpl ?? fetch
  const url = options.url ?? REGISTRY_URL
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000)
  let text
  try {
    const response = await doFetch(url, { signal: controller.signal, headers: { 'user-agent': 'dsh-stack-composer' } })
    if (!response.ok) throw new Error(`registry answered ${response.status}`)
    text = await response.text()
  } finally {
    clearTimeout(timer)
  }
  const parsed = parseRegistry(text)
  try {
    mkdirSync(dirname(cacheFile), { recursive: true })
    writeFileSync(cacheFile, text)
  } catch {
    // A read-only home is not a reason to fail: the index in hand is still usable.
  }
  return { ...parsed, source: url, fresh: true, fetchedAt: now.toISOString() }
}
