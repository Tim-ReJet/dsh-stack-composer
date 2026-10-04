#!/usr/bin/env node
/**
 * `dsh-stack-composer` — compose a plugin stack for a purpose, from the shell.
 * The plugin's `stack_compose` and `plugin_capabilities` tools run the same engine.
 * @module dsh-stack-composer/cli
 */

import { writeFileSync } from 'node:fs'
import { composeStack, searchPlugins } from '../src/compose.js'
import { loadRegistry, REGISTRY_URL, defaultCacheFile } from '../src/registry.js'
import { formatCapabilityReport, formatStack } from '../src/report.js'
import { deriveIntent, PRESETS, ROLES } from '../src/roles.js'

const USAGE = `dsh-stack-composer — compose a stack of DSH plugins for a purpose

Usage
  dsh-stack-composer "<purpose>" [options]
  dsh-stack-composer --capabilities "<query>" [options]

Purpose examples
  "a fully equipped DevOps stack"
  "a content creation stack for a solo YouTube channel"
  "security review stack"          "data analysis stack"          "a personal knowledge stack"

Options
  --per-role <n>        plugins to offer per role (default 2)
  --refresh             refetch the curated registry instead of using the day-old cache
  --offline             never fetch; use the cache, or fail if there is none
  --registry <path|url> read the registry from here instead (a local file is never cached)
  --json                print the composed stack as JSON
  --no-reasons          omit the per-pick signal list
  --no-installs         omit install commands
  --capabilities <query>  report capabilities of matching plugins instead of composing
  --limit <n>           matches for --capabilities (default 10)
  --category <name>     restrict --capabilities to one registry category
  --capability <flag>   restrict --capabilities to plugins declaring this flag
  --presets             list the built-in presets
  --roles               list the roles the composer reasons with
  --out <file>          write the report to a file instead of stdout
  -h, --help            print this help

Registry
  ${REGISTRY_URL}
  cached at ${defaultCacheFile()}

Exit status
  0 on success, 2 on a usage error or when the registry cannot be read.`

/**
 * Parse argv.
 * @param {string[]} argv - process.argv.slice(2).
 * @returns {{error?: string, help?: boolean, purpose?: string, capabilities?: string, perRole?: number,
 *   refresh?: boolean, offline?: boolean, registry?: string, json?: boolean, reasons?: boolean,
 *   installs?: boolean, limit?: number, category?: string, capability?: string, presets?: boolean,
 *   roles?: boolean, out?: string}} parsed options.
 */
export function parseArgs(argv) {
  const options = { reasons: true, installs: true }
  const positional = []
  const value = (flag, index) => {
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) throw new Error(`${flag} needs a value`)
    return next
  }
  try {
    for (let index = 0; index < argv.length; index += 1) {
      const arg = argv[index]
      if (arg === '-h' || arg === '--help') options.help = true
      else if (arg === '--refresh') options.refresh = true
      else if (arg === '--offline') options.offline = true
      else if (arg === '--json') options.json = true
      else if (arg === '--presets') options.presets = true
      else if (arg === '--roles') options.roles = true
      else if (arg === '--no-reasons') options.reasons = false
      else if (arg === '--no-installs') options.installs = false
      else if (arg === '--per-role') options.perRole = Number(value(arg, index++))
      else if (arg === '--limit') options.limit = Number(value(arg, index++))
      else if (arg === '--registry') options.registry = value(arg, index++)
      else if (arg === '--capabilities') options.capabilities = value(arg, index++)
      else if (arg === '--category') options.category = value(arg, index++)
      else if (arg === '--capability') options.capability = value(arg, index++)
      else if (arg === '--out') options.out = value(arg, index++)
      else if (arg.startsWith('-')) return { error: `unknown option ${arg}` }
      else positional.push(arg)
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
  if (options.perRole !== undefined && (!Number.isInteger(options.perRole) || options.perRole < 1 || options.perRole > 8)) {
    return { error: '--per-role must be an integer from 1 to 8' }
  }
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) {
    return { error: '--limit must be a positive integer' }
  }
  if (positional.length > 1) return { error: `expected at most one purpose, got ${positional.length}` }
  if (positional.length === 1) options.purpose = positional[0]
  if (!options.help && !options.presets && !options.roles && !options.purpose && !options.capabilities) {
    return { error: 'a purpose or --capabilities <query> is required' }
  }
  return options
}

/**
 * Run the CLI.
 * @returns {Promise<number>} the exit status.
 */
export async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.error) {
    process.stderr.write(`dsh-stack-composer: ${options.error}\n\n${USAGE}\n`)
    return 2
  }
  if (options.help) {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }
  if (options.presets) {
    process.stdout.write(`${Object.entries(PRESETS).map(([id, preset]) => `${id.padEnd(16)} ${preset.title} — ${preset.roles.length} roles`).join('\n')}\n`)
    return 0
  }
  if (options.roles) {
    process.stdout.write(`${ROLES.map((role) => `${role.id.padEnd(30)} ${role.purpose}`).join('\n')}\n`)
    return 0
  }

  let registry
  try {
    registry = await loadRegistry({
      ...(options.registry ? (options.registry.startsWith('http') ? { url: options.registry } : { path: options.registry }) : {}),
      offline: options.offline === true,
      ...(options.refresh ? { cacheTtlMs: 0 } : {}),
    })
  } catch (error) {
    process.stderr.write(`dsh-stack-composer: cannot read the registry: ${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }

  let output
  if (options.capabilities) {
    const matches = searchPlugins(registry.entries, options.capabilities, {
      limit: options.limit ?? 10,
      ...(options.category ? { category: options.category } : {}),
      ...(options.capability ? { capability: options.capability } : {}),
    })
    output = options.json
      ? `${JSON.stringify({ query: options.capabilities, count: matches.length, matches }, null, 2)}\n`
      : `${formatCapabilityReport(options.capabilities, matches)}\n`
  } else {
    const intent = deriveIntent(options.purpose ?? '')
    const stack = composeStack(intent, registry.entries, {
      perRole: options.perRole ?? 2,
      registryMeta: { count: registry.meta.count, updated: registry.meta.updated },
      source: registry.source,
    })
    output = options.json
      ? `${JSON.stringify(stack, null, 2)}\n`
      : `${formatStack(stack, { reasons: options.reasons, installs: options.installs })}\n`
  }

  if (options.out) {
    writeFileSync(options.out, output)
    process.stdout.write(`wrote ${options.out}\n`)
  } else {
    process.stdout.write(output)
  }
  return 0
}

main().then((code) => process.exit(code)).catch((error) => {
  process.stderr.write(`dsh-stack-composer: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exit(2)
})
