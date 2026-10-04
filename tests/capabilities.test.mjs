/**
 * Capability-model tests: how a registry entry becomes a profile, and how its red lines become
 * risk notes a stack can show.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeCapabilities, normalizeEntry, parseRepoUrl, riskNotes, stackCapabilities, CAPABILITIES } from '../src/capabilities.js'

test('a monorepo URL yields the repository slug plus the subdirectory, never a path slug', () => {
  const parsed = parseRepoUrl('https://github.com/john-walks-slow/dsh-proactive/tree/main/packages/dsh-proactive')
  assert.equal(parsed.slug, 'john-walks-slow/dsh-proactive')
  assert.equal(parsed.subdirectory, 'packages/dsh-proactive')
  assert.deepEqual(parseRepoUrl('https://github.com/a/b.git'), { owner: 'a', slug: 'a/b', subdirectory: null })
  assert.deepEqual(parseRepoUrl('not a url'), { owner: '', slug: '', subdirectory: null })

  const entry = normalizeEntry({ name: 'dsh-proactive', url: 'https://github.com/john-walks-slow/dsh-proactive/tree/main/packages/dsh-proactive' })
  assert.equal(entry.slug, 'john-walks-slow/dsh-proactive')
  assert.equal(entry.name, 'john-walks-slow/dsh-proactive#dsh-proactive')
  assert.equal(entry.subdirectory, 'packages/dsh-proactive')
})

test('a registry entry becomes a profile with the fields the composer needs', () => {
  const profile = normalizeEntry({
    name: 'owner/dsh-thing',
    owner: 'owner',
    url: 'https://github.com/owner/dsh-thing/',
    category: 'dev',
    description: { en: 'Does a thing.', zh: '做一件事。' },
    npm: '@owner/dsh-thing',
    version: '1.2.3',
    stars: 12,
    downloads: 34,
    capabilities: ['shell', 'network'],
    capabilityRedLines: [],
    install: 'dsh plugin --profile web add @owner/dsh-thing',
  })
  assert.equal(profile.slug, 'owner/dsh-thing')
  assert.equal(profile.description, 'Does a thing.')
  assert.equal(profile.descriptionZh, '做一件事。')
  assert.deepEqual(profile.capabilities, ['shell', 'network'])
  assert.deepEqual(profile.risks, [])
  assert.equal(profile.version, '1.2.3')
})

test('a partial entry degrades without throwing', () => {
  const profile = normalizeEntry({ name: 'x/y', url: 'https://github.com/x/y' })
  assert.equal(profile.category, 'unknown')
  assert.equal(profile.description, '')
  assert.equal(profile.npm, null)
  assert.equal(profile.stars, 0)
  assert.deepEqual(profile.capabilities, [])
})

test('credentials plus network is a high risk note', () => {
  const notes = riskNotes(['credentials', 'network'], [])
  assert.deepEqual(notes, [{ level: 'high', note: 'reads credentials or secrets and has network access' }])
  const recorded = riskNotes(['network'], ['reads credentials/secrets AND has network access'])
  assert.equal(recorded[0].level, 'high')
})

test('install-time code and plaintext http are reported', () => {
  const notes = riskNotes(['shell'], ['runs code at install time (postinstall)', 'uses plaintext http:// to example.com'])
  assert.deepEqual(notes.map((note) => note.level), ['high', 'medium'])
  assert.match(notes[0].note, /install time/)
  assert.match(notes[1].note, /plaintext http/)
})

test('capability flags render as labels and a stack union', () => {
  assert.equal(describeCapabilities(['fs-write', 'shell']), 'writes files, runs shell commands')
  assert.equal(describeCapabilities([]), 'none declared')
  assert.equal(describeCapabilities(['mystery-flag']), 'mystery-flag')
  const union = stackCapabilities([
    { capabilities: ['shell', 'network'] },
    { capabilities: ['network', 'credentials'] },
  ])
  assert.deepEqual(union.capabilities, ['credentials', 'network', 'shell'])
  assert.deepEqual(union.cautions, ['credentials', 'network', 'shell'])
})

test('the vocabulary is the one the registry publishes', () => {
  assert.deepEqual(Object.keys(CAPABILITIES).sort(), [
    'credentials', 'dynamic-code', 'env', 'fs-read', 'fs-write', 'host-runtime', 'llm', 'network', 'shell', 'subagent',
  ])
})
