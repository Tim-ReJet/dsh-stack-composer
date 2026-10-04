/**
 * Rendering: the same composed stack, written for a person or for a model to read.
 * @module dsh-stack-composer/report
 */

import { CAPABILITIES, describeCapabilities } from './capabilities.js'
import { installPlan } from './compose.js'

const STATUS_MARK = { filled: 'ok', weak: 'weak', gap: 'GAP' }

/**
 * Render a composed stack as text.
 * @param {object} stack - the value from `composeStack`.
 * @param {{reasons?: boolean, installs?: boolean}} [options] - verbosity switches.
 * @returns {string} the report.
 */
export function formatStack(stack, options = {}) {
  const showReasons = options.reasons !== false
  const showInstalls = options.installs !== false
  const lines = []
  lines.push(`stack: ${stack.purpose === '' ? stack.title : stack.purpose}`)
  lines.push(`preset: ${stack.title}${stack.presetId ? ` (${stack.presetId})` : ''} · ${stack.counts.roles} roles · ${stack.counts.plugins} plugins · registry: ${stack.registry.count ?? '?'} entries${stack.registry.updated ? `, updated ${stack.registry.updated}` : ''}`)
  lines.push(`why these roles: ${stack.rationale}`)
  for (const [index, block] of stack.roles.entries()) {
    const role = block.role
    lines.push('')
    lines.push(`${index + 1}. ${role.title} — ${role.purpose} [${STATUS_MARK[block.status]}]`)
    if (block.picks.length === 0) {
      const nearest = block.nearest ? ` (nearest: ${block.nearest.slug} at ${block.nearest.score})` : ''
      lines.push(`   nothing in the registry scored high enough${nearest}`)
      continue
    }
    for (const pick of block.picks) {
      const entry = pick.entry
      lines.push(`   • ${entry.slug} — ${entry.category} — score ${pick.score}`)
      lines.push(`     ${entry.description}`)
      if (showReasons) lines.push(`     why: ${pick.reasons.join('; ') || 'no signal matched'}`)
      lines.push(`     capabilities: ${describeCapabilities(entry.capabilities, entry.capabilitiesChecked)}`)
      for (const risk of entry.risks) lines.push(`     risk (${risk.level}): ${risk.note}`)
      if (showInstalls) lines.push(`     install: ${entry.install || `dsh plugin --profile web add ${entry.npm ?? entry.slug}`}`)
    }
  }

  if (stack.gaps.length > 0) {
    lines.push('')
    lines.push('gaps')
    for (const gap of stack.gaps) {
      lines.push(`   ${gap.essential ? '!' : '-'} ${gap.title} (${gap.role})${gap.nearest ? ` — nearest ${gap.nearest.slug} at ${gap.nearest.score}` : ''}`)
    }
  }
  if (stack.weak.length > 0) {
    lines.push('')
    lines.push(`weak roles (candidates exist but match loosely): ${stack.weak.join(', ')}`)
  }
  if (stack.risks.length > 0) {
    lines.push('')
    lines.push('risk notes')
    for (const risk of stack.risks) lines.push(`   ${risk.level === 'high' ? '!' : '-'} ${risk.slug}: ${risk.note}`)
  }
  lines.push('')
  lines.push(`capabilities this stack asks for: ${stack.capabilities.join(', ') || 'none declared'}`)
  if (stack.cautions.length > 0) {
    lines.push(`worth reviewing before you install: ${stack.cautions.map((flag) => `${flag} (${CAPABILITIES[flag].label})`).join(', ')}`)
  }
  const plan = installPlan(stack.picked)
  if (showInstalls && plan.length > 0) {
    lines.push('')
    lines.push('install plan')
    for (const step of plan) lines.push(`   ${step.command}`)
  }
  lines.push('')
  lines.push('Capability flags are what the curated registry recorded when it checked each repository; they are not a security review.')
  return lines.join('\n')
}

/**
 * Render capability profiles for search results.
 * @param {string} query - the query that produced them.
 * @param {{entry: object, score: number, hits: string[]}[]} matches - scored matches.
 * @returns {string} the report.
 */
export function formatCapabilityReport(query, matches) {
  const lines = [`capability search: ${query}`, `${matches.length} match(es)`]
  for (const match of matches) {
    const entry = match.entry
    lines.push('')
    lines.push(`• ${entry.slug} — ${entry.category} — score ${match.score}`)
    lines.push(`  ${entry.description}`)
    lines.push(`  capabilities: ${describeCapabilities(entry.capabilities, entry.capabilitiesChecked)}`)
    if (entry.redLines.length > 0) {
      lines.push(`  red lines recorded: ${entry.redLines.slice(0, 3).join('; ')}${entry.redLines.length > 3 ? ` (+${entry.redLines.length - 3} more)` : ''}`)
    }
    lines.push(`  install: ${entry.install || `dsh plugin --profile web add ${entry.npm ?? entry.slug}`}`)
    if (entry.page) lines.push(`  page: ${entry.page}`)
  }
  lines.push('')
  lines.push('Capability flags come from the curated registry\'s own source check; they are not a security review.')
  return lines.join('\n')
}
