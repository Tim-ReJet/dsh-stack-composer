/**
 * Composition: score every registry entry against every role the purpose needs, then assemble the
 * picks into a stack. The scoring is additive and every contribution is recorded as a reason, so a
 * result can be argued with line by line instead of trusted.
 * @module dsh-stack-composer/compose
 */

import { stackCapabilities } from './capabilities.js'

/** What each signal is worth. Category is the strongest structural signal; popularity only breaks ties. */
export const WEIGHTS = {
  category: 6,
  nameKeyword: 5,
  descriptionKeyword: 2,
  capabilityPresent: 2,
  capabilityMissing: -1,
  avoidKeyword: -4,
}

/** A role at or above this score is filled; between weak and filled it is shown with a caveat. */
export const FILLED_SCORE = 6
/** A role below this score has no real candidate. */
export const WEAK_SCORE = 3

/**
 * Score one plugin against one role.
 * @param {object} entry - a normalized registry entry.
 * @param {import('./roles.js').Role} role - the role to serve.
 * @returns {{score: number, reasons: string[]}} the score and the signals that produced it.
 */
export function scoreEntry(entry, role) {
  const reasons = []
  let score = 0
  const name = `${entry.name} ${entry.registryName ?? ''} ${entry.slug}`.toLowerCase()
  const description = entry.description.toLowerCase()

  if (role.categories.includes(entry.category)) {
    score += WEIGHTS.category
    reasons.push(`category ${entry.category}`)
  }

  const nameHits = role.keywords.filter((keyword) => name.includes(keyword)).slice(0, 2)
  for (const keyword of nameHits) {
    score += WEIGHTS.nameKeyword
    reasons.push(`name contains "${keyword}"`)
  }

  const descriptionHits = role.keywords
    .filter((keyword) => !nameHits.includes(keyword) && description.includes(keyword))
    .slice(0, 3)
  for (const keyword of descriptionHits) {
    score += WEIGHTS.descriptionKeyword
    reasons.push(`description mentions "${keyword}"`)
  }

  for (const flag of role.capabilities) {
    if (entry.capabilities.includes(flag)) {
      score += WEIGHTS.capabilityPresent
      reasons.push(`declares ${flag}`)
    } else {
      score += WEIGHTS.capabilityMissing
      reasons.push(`no ${flag} declared`)
    }
  }

  for (const term of (role.avoid ?? []).filter((fragment) => description.includes(fragment) || name.includes(fragment)).slice(0, 2)) {
    score += WEIGHTS.avoidKeyword
    reasons.push(`is about "${term}", not this role`)
  }

  // Popularity is a tiebreak and nothing more: capped at +2, below WEAK_SCORE, so stars can never
  // fill a role on their own or outrank a category or name match.
  const popularity = Math.min(2, Math.log10(entry.stars + 1) + Math.log10(entry.downloads + 1) / 2)
  if (popularity > 0) {
    score += popularity
    reasons.push(`${entry.stars} stars, ${entry.downloads} downloads`)
  }

  return { score: Math.round(score * 100) / 100, reasons }
}

/**
 * Rank candidates for one role.
 * @param {import('./roles.js').Role} role - the role.
 * @param {object[]} entries - candidate entries.
 * @param {string[]} exclude - slugs already chosen elsewhere in the stack.
 * @param {number} limit - how many to keep.
 * @returns {{role: object, status: 'filled'|'weak'|'gap', picks: object[], nearest: object|null}} the role's block.
 */
export function rankRole(role, entries, exclude = [], limit = 2) {
  const ranked = entries
    .filter((entry) => !exclude.includes(entry.slug))
    .map((entry) => ({ entry, ...scoreEntry(entry, role) }))
    .sort((a, b) => (b.score - a.score) || (b.entry.stars - a.entry.stars) || a.entry.slug.localeCompare(b.entry.slug))

  // Sibling sub-packages of one monorepo share a slug; a role should name the repository once, not
  // fill its slots with the same repository under several subdirectory names.
  const seen = new Set()
  const distinct = ranked.filter((candidate) => {
    if (seen.has(candidate.entry.slug)) return false
    seen.add(candidate.entry.slug)
    return true
  })

  const best = distinct[0]
  if (!best || best.score < WEAK_SCORE) {
    return { role, status: 'gap', picks: [], nearest: best ? { slug: best.entry.slug, score: best.score } : null }
  }
  const status = best.score >= FILLED_SCORE ? 'filled' : 'weak'
  // Only candidates that clear the threshold are offered: a filled role should not trail two
  // below-threshold names it matched by popularity.
  return { role, status, picks: distinct.filter((candidate) => candidate.score >= WEAK_SCORE).slice(0, limit), nearest: null }
}

/**
 * Compose a stack for an intent.
 * @param {{purpose: string, title: string, presetId: string|null, roles: object[], rationale: string}} intent - from `deriveIntent`.
 * @param {object[]} entries - the registry index.
 * @param {{perRole?: number, registryMeta?: object, source?: string}} [options] - composition options.
 * @returns {object} the composed stack.
 */
export function composeStack(intent, entries, options = {}) {
  const perRole = options.perRole ?? 2
  const used = []
  const roles = []
  for (const role of intent.roles) {
    const block = rankRole(role, entries, used, perRole)
    for (const pick of block.picks) used.push(pick.entry.slug)
    roles.push(block)
  }

  const picked = roles.flatMap((block) => block.picks.map((pick) => pick.entry))
  const seenRisk = new Set()
  const risks = []
  for (const entry of picked) {
    for (const risk of entry.risks) {
      if (seenRisk.has(risk.note)) continue
      seenRisk.add(risk.note)
      risks.push({ ...risk, slug: entry.slug })
    }
  }
  risks.sort((a, b) => (a.level === b.level ? a.slug.localeCompare(b.slug) : a.level === 'high' ? -1 : 1))

  const { capabilities, cautions } = stackCapabilities(picked)
  const gaps = roles.filter((block) => block.status === 'gap').map((block) => ({
    role: block.role.id,
    title: block.role.title,
    essential: block.role.essential === true,
    nearest: block.nearest,
  }))
  const weak = roles.filter((block) => block.status === 'weak').map((block) => block.role.id)

  return {
    purpose: intent.purpose,
    title: intent.title,
    presetId: intent.presetId,
    rationale: intent.rationale,
    registry: { source: options.source ?? null, ...(options.registryMeta ?? {}) },
    roles,
    picked,
    risks,
    gaps,
    weak,
    capabilities,
    cautions,
    counts: {
      roles: roles.length,
      filled: roles.filter((block) => block.status === 'filled').length,
      plugins: picked.length,
    },
  }
}

/**
 * Build the install commands a composed stack needs, one per plugin.
 * @param {object[]} picked - chosen plugins.
 * @returns {{slug: string, command: string}[]} the plan.
 */
export function installPlan(picked) {
  return picked.map((entry) => ({
    slug: entry.slug,
    command: entry.install
      || (entry.npm ? `dsh plugin --profile web add ${entry.npm}` : `dsh plugin --profile web add ${entry.slug}`),
  }))
}

/**
 * Search the index for plugins matching a free-text query, ranked by the same machinery.
 * @param {object[]} entries - the registry index.
 * @param {string} query - what to look for.
 * @param {{limit?: number, category?: string, capability?: string}} [options] - filters.
 * @returns {object[]} scored matches, best first.
 */
export function searchPlugins(entries, query, options = {}) {
  const limit = options.limit ?? 10
  const words = String(query ?? '').toLowerCase().split(/[^a-z0-9+.#-]+/).filter((word) => word.length > 2)
  // A query with nothing to match on returns nothing: popularity must never stand in for relevance.
  if (words.length === 0) return []
  let pool = entries
  if (options.category) pool = pool.filter((entry) => entry.category === options.category)
  if (options.capability) pool = pool.filter((entry) => entry.capabilities.includes(options.capability))
  return pool
    .map((entry) => {
      const haystack = `${entry.name} ${entry.registryName ?? ''} ${entry.slug} ${entry.description}`.toLowerCase()
      const hits = words.filter((word) => haystack.includes(word))
      const score = hits.reduce((total, word) => total + (entry.name.toLowerCase().includes(word) ? 5 : 2), 0)
        + Math.min(2, Math.log10(entry.stars + 1))
      return { entry, score: Math.round(score * 100) / 100, hits }
    })
    .filter((match) => match.hits.length > 0)
    .sort((a, b) => (b.score - a.score) || (b.entry.stars - a.entry.stars) || a.entry.slug.localeCompare(b.entry.slug))
    .slice(0, limit)
}
