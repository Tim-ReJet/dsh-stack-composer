/**
 * The capability vocabulary this plugin reasons over.
 *
 * The curated registry publishes, per plugin, the capability flags its source was checked against
 * (`capabilities`), the red lines that check raised (`capabilityRedLines`), a category, a
 * description, and an install command. Everything here is a reading of that data: no plugin source
 * is fetched, so a capability is what the registry says was observed, and a missing flag means the
 * check did not find the behaviour — not that the plugin is safe.
 * @module dsh-stack-composer/capabilities
 */

/** Capability flags, with what each one means for a stack. */
export const CAPABILITIES = {
  'fs-read': { label: 'reads files', caution: false },
  'fs-write': { label: 'writes files', caution: true },
  env: { label: 'reads environment variables', caution: false },
  network: { label: 'makes network requests', caution: true },
  llm: { label: 'calls a model', caution: false },
  shell: { label: 'runs shell commands', caution: true },
  'dynamic-code': { label: 'evaluates code at runtime', caution: true },
  'host-runtime': { label: 'runs inside the host process', caution: true },
  credentials: { label: 'reads credentials or secrets', caution: true },
  subagent: { label: 'spawns subagents', caution: false },
}

/** Capability flags this project knows; anything else in the registry is passed through verbatim. */
export const KNOWN_CAPABILITIES = Object.keys(CAPABILITIES)

/**
 * Split a GitHub URL into the repository it belongs to and, for a monorepo entry, the subdirectory
 * the registry points at. The registry's own `name` keeps the `owner/repo#sub` shape; a URL like
 * `.../tree/main/packages/thing` must not leak that path into the slug, or dedupe and install plans
 * treat one repository as several plugins.
 * @param {string} url - the entry's repository URL.
 * @returns {{owner: string, slug: string, subdirectory: string|null}} the parsed location.
 */
export function parseRepoUrl(url) {
  const match = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\/tree\/[^/\s]+\/(.+?))?\/?$/.exec(url)
  if (!match) return { owner: '', slug: '', subdirectory: null }
  const owner = match[1]
  const repo = match[2].replace(/\.git$/, '')
  return { owner, slug: `${owner}/${repo}`, subdirectory: match[3] ?? null }
}

/**
 * Turn one registry entry into the shape the composer reasons over.
 * @param {Record<string, unknown>} raw - one entry from the curated registry.
 * @returns {object} the normalized plugin profile.
 */
export function normalizeEntry(raw) {
  const description = raw.description && typeof raw.description === 'object'
    ? /** @type {Record<string, unknown>} */ (raw.description)
    : {}
  const capabilities = Array.isArray(raw.capabilities) ? raw.capabilities.map(String) : []
  const redLines = Array.isArray(raw.capabilityRedLines) ? raw.capabilityRedLines.map(String) : []
  const url = typeof raw.url === 'string' ? raw.url : ''
  const parsed = parseRepoUrl(url)
  return {
    name: parsed.subdirectory ? `${parsed.slug}#${parsed.subdirectory.split('/').pop()}` : parsed.slug,
    owner: parsed.owner,
    slug: parsed.slug,
    subdirectory: parsed.subdirectory,
    url,
    page: typeof raw.page === 'string' ? raw.page : '',
    category: typeof raw.category === 'string' ? raw.category : 'unknown',
    description: typeof description.en === 'string' ? description.en : '',
    descriptionZh: typeof description.zh === 'string' ? description.zh : '',
    npm: typeof raw.npm === 'string' ? raw.npm : null,
    version: typeof raw.version === 'string' ? raw.version : null,
    stars: Number.isFinite(raw.stars) ? Number(raw.stars) : 0,
    downloads: Number.isFinite(raw.downloads) ? Number(raw.downloads) : 0,
    install: typeof raw.install === 'string' ? raw.install : '',
    added: typeof raw.added === 'string' ? raw.added : null,
    capabilities,
    redLines,
    risks: riskNotes(capabilities, redLines),
  }
}

/**
 * Classify the red lines the registry recorded into notes a stack can show.
 * @param {string[]} capabilities - declared capability flags.
 * @param {string[]} redLines - recorded red lines.
 * @returns {{level: 'high'|'medium', note: string}[]} risk notes, highest first.
 */
export function riskNotes(capabilities, redLines) {
  const notes = []
  const joined = redLines.join('\n')
  if (/credentials\/secrets/.test(joined) || (capabilities.includes('credentials') && capabilities.includes('network'))) {
    notes.push({ level: 'high', note: 'reads credentials or secrets and has network access' })
  }
  if (/install time/.test(joined)) {
    notes.push({ level: 'high', note: 'runs code at install time' })
  }
  if (/plaintext http:\/\//.test(joined)) {
    notes.push({ level: 'medium', note: 'uses plaintext http to at least one host' })
  }
  if (/literal IP/.test(joined)) {
    notes.push({ level: 'medium', note: 'connects to a literal IP address' })
  }
  return notes
}

/**
 * Render capability flags as a short readable list.
 * @param {string[]} capabilities - capability flags.
 * @returns {string} comma-separated labels, or 'none declared'.
 */
export function describeCapabilities(capabilities) {
  if (capabilities.length === 0) return 'none declared'
  return capabilities.map((flag) => CAPABILITIES[flag]?.label ?? flag).join(', ')
}

/**
 * The capabilities a whole stack would hold, and the flags worth a second look.
 * @param {{capabilities: string[]}[]} plugins - chosen plugins.
 * @returns {{capabilities: string[], cautions: string[]}} union of flags and the cautionary ones.
 */
export function stackCapabilities(plugins) {
  const union = new Set()
  for (const plugin of plugins) for (const flag of plugin.capabilities) union.add(flag)
  const capabilities = [...union].sort()
  return {
    capabilities,
    cautions: capabilities.filter((flag) => CAPABILITIES[flag]?.caution === true),
  }
}
