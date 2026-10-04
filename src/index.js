/**
 * The Cordis plugin: two read-only tools over the curated registry — compose a stack for a purpose,
 * and report what a plugin can do.
 * @module dsh-stack-composer
 */

import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { composeStack, searchPlugins } from './compose.js'
import { loadRegistry, REGISTRY_URL } from './registry.js'
import { deriveIntent, PRESETS, ROLES } from './roles.js'
import { formatCapabilityReport, formatStack } from './report.js'

export const name = 'stack-composer'
export const inject = ['tools']

/** Row configuration; each field also has a per-call default. */
export const Config = z.object({
  perRole: z.number().default(2),
  registryUrl: z.string().default(REGISTRY_URL),
  registryPath: z.string().default(''),
  offline: z.boolean().default(false),
})

const DEFAULTS = { perRole: 2, registryUrl: REGISTRY_URL, registryPath: '', offline: false }

const COMPOSE_DESCRIPTION = [
  'Compose a working stack of DeepSeek Harness plugins for a stated purpose, from the curated',
  'dsh-plugin registry. It derives the roles the purpose needs (version control, secrets,',
  'observability, capture, publishing, and so on), scores every registry plugin against each role by',
  'category, words in its name and description, and the capability flags the registry recorded, then',
  'returns the picks per role with the signals that chose them, the capability flags the stack',
  'would hold, recorded risk notes, roles it could not fill, and one install command per plugin.',
  'It installs nothing and writes only its own registry cache. Use it when asked to assemble a stack',
  'such as a DevOps stack, a content-creation stack, or any other set of plugins that should work',
  'together.',
].join(' ')

const CAPABILITY_DESCRIPTION = [
  'Report what plugins can do, from the curated dsh-plugin registry: for each match, its category,',
  'description, the capability flags the registry recorded against its source (filesystem, network,',
  'shell, credentials, subprocess and similar), any red lines, its install command, and its page.',
  'Use it to reason about the features of individual plugins before choosing a stack. It installs',
  'nothing.',
].join(' ')

/**
 * Load the registry index for a call. `offline` wins over `refresh`: a deployment that forbids
 * network access must not be talked into a fetch by a per-call flag.
 * @param {object} settings - merged row configuration.
 * @param {{refresh?: boolean}} call - per-call switches.
 * @returns {Promise<object>} the registry index.
 */
export function resolveRegistryOptions(settings, call = {}) {
  const offline = settings.offline === true
  return {
    ...(settings.registryPath ? { path: settings.registryPath } : { url: settings.registryUrl }),
    offline,
    ...(!offline && call.refresh === true ? { cacheTtlMs: 0 } : {}),
  }
}

/**
 * Load the registry index for a call.
 * @param {object} settings - merged row configuration.
 * @param {{refresh?: boolean}} call - per-call switches.
 * @returns {Promise<object>} the registry index.
 */
async function index(settings, call = {}) {
  return loadRegistry(resolveRegistryOptions(settings, call))
}

/** Bounds the tools enforce themselves, because the tool schema cannot express a range. */
export const LIMITS = { perRole: { min: 1, max: 8 }, limit: { min: 1, max: 50 } }

/**
 * Validate a bounded integer argument.
 * @param {number|undefined} value - the argument.
 * @param {string} name - argument name for the message.
 * @param {{min: number, max: number}} bounds - allowed range.
 * @param {number} fallback - value to use when the argument is absent.
 * @returns {number} the accepted value.
 */
export function boundedInteger(value, name, bounds, fallback) {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < bounds.min || value > bounds.max) {
    throw new Error(`${name} must be an integer from ${bounds.min} to ${bounds.max}, got ${JSON.stringify(value)}`)
  }
  return value
}

/**
 * Register the composer tools on `ctx.tools`.
 * @param {import('@deepseek-ai/cordis').Context} ctx - the Cordis context.
 * @param {{perRole?: number, registryUrl?: string, offline?: boolean}} [config] - row configuration.
 * @returns {void}
 */
export function apply(ctx, config = {}) {
  const settings = { ...DEFAULTS, ...config }

  ctx.tools.register(defineTool({
    name: 'stack_compose',
    description: COMPOSE_DESCRIPTION,
    parameters: {
      purpose: { type: 'string', required: true, description: 'What the stack is for, in your own words — for example "a fully equipped DevOps stack" or "a content creation stack for a solo YouTube channel".' },
      perRole: { type: 'integer', description: `How many plugins to offer per role, 1 to ${LIMITS.perRole.max}. Defaults to the row configuration (2).` },
      refresh: { type: 'boolean', description: 'Refetch the curated registry instead of using the day-old cache.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          purpose: { type: 'string', required: true },
          preset: { type: 'string', required: true },
          roles: { type: 'integer', required: true },
          plugins: { type: 'integer', required: true },
          gaps: { type: 'integer', required: true },
          report: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.report }],
    },
    async execute(args) {
      const perRole = boundedInteger(args.perRole, 'perRole', LIMITS.perRole, settings.perRole)
      const registry = await index(settings, { refresh: args.refresh === true })
      const intent = deriveIntent(args.purpose)
      const stack = composeStack(intent, registry.entries, {
        perRole,
        registryMeta: { count: registry.meta.count, updated: registry.meta.updated },
        source: registry.source,
      })
      return {
        purpose: stack.purpose,
        preset: stack.presetId ?? stack.title,
        roles: stack.counts.roles,
        plugins: stack.counts.plugins,
        gaps: stack.gaps.length,
        report: formatStack(stack),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'plugin_capabilities',
    description: CAPABILITY_DESCRIPTION,
    parameters: {
      query: { type: 'string', required: true, description: 'What to look for — a capability ("browser automation"), a plugin name, or a job to be done.' },
      limit: { type: 'integer', description: `How many matches to return, 1 to ${LIMITS.limit.max}. Defaults to 10.` },
      category: { type: 'string', description: 'Restrict to one registry category, such as docs, notify, or security.' },
      capability: { type: 'string', description: 'Restrict to plugins whose recorded capabilities include this flag, such as credentials or subagent.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          count: { type: 'integer', required: true },
          report: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.report }],
    },
    async execute(args) {
      const limit = boundedInteger(args.limit, 'limit', LIMITS.limit, 10)
      const registry = await index(settings)
      const matches = searchPlugins(registry.entries, args.query, {
        limit,
        ...(args.category ? { category: args.category } : {}),
        ...(args.capability ? { capability: args.capability } : {}),
      })
      return { count: matches.length, report: formatCapabilityReport(args.query, matches) }
    },
  }))
}

export { PRESETS, ROLES }
