#!/usr/bin/env node
/**
 * Compose the sample stacks against the live curated registry and write them to `samples/`.
 * Network required. This is the check that keeps the lexicon honest: it shows what the composer
 * actually picks for a real purpose, not what a fixture says it would.
 *
 * Usage: npm run check:live
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { composeStack } from '../src/compose.js'
import { loadRegistry } from '../src/registry.js'
import { deriveIntent } from '../src/roles.js'
import { formatStack } from '../src/report.js'

const PURPOSES = [
  'a fully equipped DevOps stack',
  'a content creation stack for a solo YouTube channel',
]

/** @param {string} purpose */
const slug = (purpose) => purpose.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const registry = await loadRegistry({ cacheTtlMs: 0 })
mkdirSync(new URL('../samples/', import.meta.url), { recursive: true })
console.log(`registry: ${registry.meta.count} entries from ${registry.source} (updated ${registry.meta.updated})`)

let failed = false
for (const purpose of PURPOSES) {
  const stack = composeStack(deriveIntent(purpose), registry.entries, {
    registryMeta: { count: registry.meta.count, updated: registry.meta.updated },
    source: registry.source,
  })
  const file = new URL(`../samples/${slug(purpose)}.txt`, import.meta.url)
  writeFileSync(file, `${formatStack(stack)}\n`)
  console.log(`${purpose}: ${stack.counts.plugins} plugins across ${stack.counts.roles} roles, ${stack.gaps.length} gap(s), ${stack.risks.length} risk note(s) -> samples/${slug(purpose)}.txt`)
  if (stack.counts.plugins === 0) failed = true
}
process.exit(failed ? 1 : 0)
