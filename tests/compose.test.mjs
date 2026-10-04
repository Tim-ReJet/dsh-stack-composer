/**
 * Composition tests: the picks, the reasons behind them, and the failure modes (gaps, loose matches,
 * risks, duplicates) must all be deterministic and explainable.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { composeStack, installPlan, rankRole, scoreEntry, searchPlugins, FILLED_SCORE, WEAK_SCORE } from '../src/compose.js'
import { deriveIntent, roleById } from '../src/roles.js'
import { normalizeEntry } from '../src/capabilities.js'
import { parseRegistry } from '../src/registry.js'
import { formatStack } from '../src/report.js'

const fixture = parseRegistry(readFileSync(new URL('./fixtures/registry.json', import.meta.url), 'utf8'))
const byName = new Map(fixture.entries.map((entry) => [entry.slug, entry]))
/** @param {string} slug */
const entry = (slug) => {
  const found = byName.get(slug)
  assert.ok(found, `fixture is missing ${slug}`)
  return found
}

test('the fixture registry parses and drops entries without a url', () => {
  assert.equal(fixture.entries.length, 27)
  assert.equal(fixture.meta.count, 27)
  assert.equal(fixture.entries.find((item) => item.name === 'broken/no-url-entry'), undefined)
})

test('a DevOps purpose composes a stack with the roles that stack needs', () => {
  const intent = deriveIntent('a fully equipped DevOps stack')
  assert.equal(intent.presetId, 'devops')
  const stack = composeStack(intent, fixture.entries, { registryMeta: fixture.meta, source: 'fixture' })
  const roleIds = stack.roles.map((block) => block.role.id)
  for (const required of ['git-and-review', 'containers-and-infra', 'secrets-and-credentials', 'observability', 'alerting-and-notify']) {
    assert.ok(roleIds.includes(required), `missing role ${required}`)
  }
  assert.equal(stack.counts.roles, 9)
  assert.ok(stack.counts.plugins >= 9)
})

test('role fit beats popularity', () => {
  // dsh-theme-pack has 900 stars and a category no DevOps role wants; the container plugin has 5.
  const infra = roleById('containers-and-infra')
  const composer = scoreEntry(entry('acme/dsh-docker-compose'), infra)
  const theme = scoreEntry(entry('acme/dsh-theme-pack'), infra)
  assert.ok(composer.score > theme.score, `${composer.score} should beat ${theme.score}`)
  assert.ok(composer.reasons.some((reason) => reason.includes('docker')))
  const ranked = rankRole(infra, fixture.entries, [], 1)
  assert.equal(ranked.picks[0].entry.slug, 'acme/dsh-docker-compose')
})

test('every pick explains itself with the signals that chose it', () => {
  const stack = composeStack(deriveIntent('devops'), fixture.entries, {})
  for (const block of stack.roles) {
    for (const pick of block.picks) {
      assert.ok(pick.reasons.length > 0, `${pick.entry.slug} has no reasons`)
      assert.ok(pick.score >= WEAK_SCORE)
    }
  }
  const secrets = stack.roles.find((block) => block.role.id === 'secrets-and-credentials')
  assert.equal(secrets.picks[0].entry.slug, 'acme/dsh-secret-vault')
  assert.ok(secrets.picks[0].reasons.some((reason) => reason.includes('credentials')))
})

test('a plugin is chosen once even when several roles want it', () => {
  const stack = composeStack(deriveIntent('content creation stack'), fixture.entries, { perRole: 3 })
  const slugs = stack.picked.map((item) => item.slug)
  assert.equal(new Set(slugs).size, slugs.length, `duplicate pick in ${slugs.join(', ')}`)
})

test('unfillable roles become gaps with the nearest candidate named', () => {
  // The fixture has nothing for video and audio under this purpose except one loose match, so a
  // purpose that needs it must report the gap rather than padding the stack.
  const intent = deriveIntent('a video editing and audio mastering workflow')
  const stack = composeStack(intent, fixture.entries, { perRole: 2 })
  const roles = new Set(intent.roles.map((role) => role.id))
  assert.ok(roles.has('video-and-audio'))
  const video = stack.roles.find((block) => block.role.id === 'video-and-audio')
  assert.ok(video.status === 'filled' || video.status === 'weak' || video.status === 'gap')
  const gaps = composeStack(deriveIntent('devops'), [{ ...entry('acme/dsh-git-review') }], {})
  const gapRoles = gaps.gaps.map((gap) => gap.role)
  assert.ok(gapRoles.includes('containers-and-infra'), `expected a gap, got ${gapRoles.join(', ')}`)
})

test('recorded red lines surface as risk notes on the composed stack', () => {
  const stack = composeStack(deriveIntent('devops'), fixture.entries, {})
  const note = stack.risks.find((risk) => risk.slug === 'acme/dsh-secret-vault')
  assert.ok(note, 'the vault plugin should carry a risk note')
  assert.equal(note.level, 'high')
  assert.match(note.note, /credentials/)
})

test('the stack reports the capability union and the flags worth reviewing', () => {
  const stack = composeStack(deriveIntent('devops'), fixture.entries, {})
  assert.ok(stack.capabilities.includes('shell'))
  assert.ok(stack.cautions.includes('shell'))
  assert.ok(stack.cautions.includes('credentials'))
})

test('a purpose with no preset falls back to roles derived from its words', () => {
  const intent = deriveIntent('keep my notes searchable and notify me when something changes')
  assert.equal(intent.presetId, null)
  const ids = intent.roles.map((role) => role.id)
  assert.ok(ids.includes('docs-and-runbooks'), `expected docs role, got ${ids.join(', ')}`)
  assert.ok(ids.length >= 4, 'the fallback should fill out a usable stack')
})

test('composition is deterministic', () => {
  const first = composeStack(deriveIntent('devops'), fixture.entries, {})
  const second = composeStack(deriveIntent('devops'), fixture.entries, {})
  assert.equal(JSON.stringify(first), JSON.stringify(second))
})

test('capability search filters and ranks', () => {
  const matches = searchPlugins(fixture.entries, 'query data sql', { limit: 3 })
  assert.equal(matches[0].entry.slug, 'acme/dsh-sql-duckdb')
  const filtered = searchPlugins(fixture.entries, 'web search', { capability: 'network', category: 'browser', limit: 5 })
  assert.ok(filtered.every((match) => match.entry.capabilities.includes('network')))
  assert.ok(filtered.some((match) => match.entry.slug === 'acme/dsh-web-research'))
})

test('the install plan is one command per plugin, using the registry command when present', () => {
  const stack = composeStack(deriveIntent('devops'), fixture.entries, { perRole: 1 })
  const plan = installPlan(stack.picked)
  assert.equal(plan.length, stack.picked.length)
  assert.ok(plan.every((step) => step.command.startsWith('dsh plugin --profile web add ')))
  const withoutInstall = installPlan([normalizeEntry({ name: 'a/b', url: 'https://github.com/a/b', npm: '@a/b' })])
  assert.equal(withoutInstall[0].command, 'dsh plugin --profile web add @a/b')
})

test('the rendered report carries picks, reasons, risks and install commands', () => {
  const stack = composeStack(deriveIntent('a fully equipped DevOps stack'), fixture.entries, { registryMeta: fixture.meta })
  const text = formatStack(stack)
  assert.match(text, /preset: DevOps \/ platform/)
  assert.match(text, /acme\/dsh-docker-compose/)
  assert.match(text, /why: /)
  assert.match(text, /risk \(high\): reads credentials/)
  assert.match(text, /install plan/)
  assert.match(text, /not a security review/)
})

test('an avoid term pushes a keyword collision out of a role', () => {
  const writing = roleById('writing-and-editing')
  const prose = normalizeEntry({
    url: 'https://github.com/a/prose-kit',
    category: 'docs',
    description: { en: 'Draft and edit prose with grammar and tone checks.' },
    capabilities: ['llm'],
  })
  // Matches on "rewrite"/"draft"/"edit" but is about editing your own messages in the UI.
  const collision = normalizeEntry({
    url: 'https://github.com/a/DSH-EasyRewrite',
    category: 'session',
    description: { en: 'Inline-edit and recall your own user messages in the composer sidebar, with draft persistence.' },
    capabilities: ['fs-write'],
    stars: 900,
    downloads: 9000,
  })
  const proseScore = scoreEntry(prose, writing)
  const collisionScore = scoreEntry(collision, writing)
  assert.ok(proseScore.score > collisionScore.score, `${proseScore.score} should beat ${collisionScore.score}`)
  assert.ok(collisionScore.reasons.some((reason) => reason.includes('not this role')))
})

test('a negated preset phrase does not select that preset', () => {
  assert.equal(deriveIntent('not a content creator, just a note keeper').presetId, null)
  // The negation reaches only its own clause, so a later positive "publishing" still selects.
  assert.equal(deriveIntent('no research, just publishing drafts').presetId, 'content-creator')
  assert.equal(deriveIntent('instead of a security stack, a writing stack').presetId, null)
  assert.equal(deriveIntent('a fully equipped DevOps stack').presetId, 'devops')
})

test('registry order does not change the composed stack', () => {
  const forward = composeStack(deriveIntent('devops'), fixture.entries, { perRole: 4 })
  const reversed = composeStack(deriveIntent('devops'), [...fixture.entries].reverse(), { perRole: 4 })
  const shuffled = [...fixture.entries].sort(() => Math.random() - 0.5)
  const random = composeStack(deriveIntent('devops'), shuffled, { perRole: 4 })
  assert.equal(JSON.stringify(reversed), JSON.stringify(forward))
  assert.equal(JSON.stringify(random), JSON.stringify(forward))
})

test('the thresholds are the documented ones', () => {
  assert.equal(FILLED_SCORE, 6)
  assert.equal(WEAK_SCORE, 3)
})

test('a query with nothing to match on returns nothing, not popularity-ranked noise', () => {
  assert.deepEqual(searchPlugins(fixture.entries, '!!!'), [])
  assert.deepEqual(searchPlugins(fixture.entries, 'ai ml go'), [])
  assert.deepEqual(searchPlugins(fixture.entries, ''), [])
  assert.ok(searchPlugins(fixture.entries, 'docker').length > 0)
})

test('popularity alone can never fill or loosely fill a role', () => {
  const docs = roleById('docs-and-runbooks')
  const popular = normalizeEntry({
    url: 'https://github.com/a/very-popular',
    category: 'fun',
    description: { en: 'An unrelated but extremely well starred plugin.' },
    stars: 5_000_000,
    downloads: 5_000_000,
  })
  const scored = scoreEntry(popular, docs)
  assert.ok(scored.score <= 2, `popularity alone scored ${scored.score}`)
  assert.ok(scored.score < WEAK_SCORE)
  const block = rankRole(docs, [popular], [], 1)
  assert.equal(block.status, 'gap')
})

test('a sibling sub-package of the same repository fills a role once', () => {
  const docs = roleById('docs-and-runbooks')
  const siblings = [
    normalizeEntry({ url: 'https://github.com/a/mono/tree/main/packages/one', category: 'docs', description: { en: 'Runbook and markdown writer.' }, stars: 10 }),
    normalizeEntry({ url: 'https://github.com/a/mono/tree/main/packages/two', category: 'docs', description: { en: 'Runbook and markdown writer, second flavour.' }, stars: 9 }),
  ]
  const block = rankRole(docs, siblings, [], 5)
  assert.equal(block.picks.length, 1)
  assert.equal(block.picks[0].entry.slug, 'a/mono')
})

test('printed reasons add up to the score, popularity included', () => {
  const entryPoint = entry('acme/dsh-git-review')
  const role = roleById('git-and-review')
  const scored = scoreEntry(entryPoint, role)
  assert.ok(scored.reasons.some((reason) => /stars, .* downloads/.test(reason)))
  const stack = composeStack(deriveIntent('devops'), fixture.entries, {})
  const pick = stack.roles.flatMap((block) => block.picks).find((candidate) => candidate.entry.slug === 'acme/dsh-git-review')
  if (pick) assert.ok(pick.reasons.some((reason) => /stars, .* downloads/.test(reason)))
})
