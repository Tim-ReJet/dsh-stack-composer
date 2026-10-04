/**
 * The vocabulary the composer reasons with: what a stack of a given purpose needs, expressed as
 * roles. A role is a job to be done plus the signals that identify plugins doing it — categories,
 * words that appear in names and descriptions, and capability flags.
 *
 * This is a lexicon, not a model. It is deliberately inspectable: every pick can say which signal
 * matched, so a bad stack is a vocabulary bug that can be fixed, not an opaque reranking.
 * @module dsh-stack-composer/roles
 */

/**
 * @typedef {object} Role
 * @property {string} id - stable role id.
 * @property {string} title - human title.
 * @property {string} purpose - the job this role does in a stack.
 * @property {string[]} keywords - lowercased fragments to look for in a name or description.
 * @property {string[]} [avoid] - fragments that mean the plugin is about a different job; each hit
 *   subtracts from the score and says so, so a keyword collision does not quietly win a role.
 * @property {string[]} categories - registry categories that suit this role.
 * @property {string[]} capabilities - capability flags the role wants.
 * @property {boolean} [essential] - whether a gap here is worth flagging loudly.
 */

/** @type {Role[]} */
export const ROLES = [
  {
    id: 'git-and-review',
    title: 'Version control and review',
    purpose: 'Track changes, inspect diffs, and review work before it lands',
    keywords: ['git', 'commit', 'diff', 'branch', 'pull request', 'review', 'changelog', 'worktree'],
    categories: ['git', 'dev'],
    capabilities: [],
    essential: true,
  },
  {
    id: 'ci-and-quality',
    title: 'Checks and quality gates',
    purpose: 'Test, lint, typecheck, and gate the work',
    keywords: ['test', 'lint', 'coverage', 'quality', 'check', 'typecheck', 'spec', 'pre-commit', 'gate'],
    categories: ['dev', 'skill'],
    capabilities: ['shell'],
  },
  {
    id: 'containers-and-infra',
    title: 'Containers and infrastructure',
    purpose: 'Build images and describe the machines the stack runs on',
    keywords: ['docker', 'container', 'kubernetes', 'k8s', 'terraform', 'helm', 'compose', 'infrastructure', 'cluster', 'vm', 'provision'],
    categories: ['dev'],
    capabilities: ['shell'],
    essential: true,
  },
  {
    id: 'deploy-and-release',
    title: 'Deployment and release',
    purpose: 'Ship a build, version it, and roll it back',
    keywords: ['deploy', 'release', 'rollout', 'artifact', 'publish package', 'rollback', 'version bump', 'registry push'],
    categories: ['dev', 'git'],
    capabilities: [],
  },
  {
    id: 'secrets-and-credentials',
    title: 'Secrets and credentials',
    purpose: 'Keep keys, tokens, and environment values out of the transcript',
    keywords: ['secret', 'credential', 'vault', 'api key', 'token', 'password', 'infisical', '1password', 'env file', 'keychain'],
    categories: ['security'],
    capabilities: ['credentials', 'env'],
    essential: true,
  },
  {
    id: 'observability',
    title: 'Observability',
    purpose: 'See what the stack is doing while it runs',
    keywords: ['observ', 'monitor', 'metric', 'trace', 'log', 'health', 'dashboard', 'telemetry', 'profil', 'insight'],
    categories: ['dev', 'usage'],
    capabilities: [],
    essential: true,
  },
  {
    id: 'alerting-and-notify',
    title: 'Notification and alerting',
    purpose: 'Tell a person when something finishes or breaks',
    keywords: ['notify', 'notif', 'alert', 'slack', 'telegram', 'discord', 'webhook', 'email', 'push notification', 'sms'],
    categories: ['notify'],
    capabilities: ['network'],
  },
  {
    id: 'remote-access',
    title: 'Remote access',
    purpose: 'Reach machines and sessions from somewhere else',
    keywords: ['ssh', 'remote', 'tunnel', 'terminal', 'control plane', 'tailscale', 'vpn'],
    categories: ['remote', 'wsl'],
    capabilities: ['shell'],
  },
  {
    id: 'scheduling-and-automation',
    title: 'Scheduling and automation',
    purpose: 'Run work on a clock or a trigger',
    keywords: ['schedule', 'cron', 'timer', 'trigger', 'workflow', 'automat', 'pipeline', 'routine', 'loop'],
    categories: ['workflow', 'session'],
    capabilities: [],
  },
  {
    id: 'docs-and-runbooks',
    title: 'Documentation and runbooks',
    purpose: 'Write down how the stack works and what to do when it does not',
    keywords: ['doc', 'runbook', 'readme', 'markdown', 'wiki', 'note', 'knowledge base', 'adr', 'spec'],
    categories: ['docs'],
    capabilities: [],
  },
  {
    id: 'research-and-capture',
    title: 'Research and capture',
    purpose: 'Find, fetch, and keep source material',
    keywords: ['search', 'browse', 'scrape', 'fetch', 'research', 'rss', 'feed', 'crawl', 'capture', 'reader', 'clip'],
    categories: ['browser', 'docs'],
    capabilities: ['network'],
    essential: true,
  },
  {
    id: 'writing-and-editing',
    title: 'Writing and editing',
    purpose: 'Draft, restructure, and tighten prose',
    keywords: ['writing', 'prose', 'copyedit', 'grammar', 'humanize', 'proofread', 'novel', 'draft', 'style', 'summar', 'translat', 'rewrite', 'blog post', 'article'],
    avoid: ['user message', 'chat message', 'message composer', 'sidebar', 'inline edit', 'input', 'queue'],
    categories: ['docs', 'skill'],
    capabilities: ['llm'],
    essential: true,
  },
  {
    id: 'images-and-visuals',
    title: 'Images and visuals',
    purpose: 'Produce or read pictures, screenshots, and diagrams',
    keywords: ['image', 'picture', 'photo', 'ocr', 'screenshot', 'diagram', 'icon', 'illustration', 'figma', 'svg', 'vision', 'design'],
    categories: ['vision', 'ui'],
    capabilities: [],
  },
  {
    id: 'video-and-audio',
    title: 'Video and audio',
    purpose: 'Produce or transcribe moving pictures and sound',
    keywords: ['video', 'audio', 'voice', 'speech', 'tts', 'stt', 'transcri', 'podcast', 'music', 'ffmpeg', 'subtitle'],
    categories: ['voice', 'vision'],
    capabilities: [],
  },
  {
    id: 'publishing-and-distribution',
    title: 'Publishing and distribution',
    purpose: 'Put finished work where the audience is',
    keywords: ['publish', 'post', 'upload', 'social', 'youtube', 'blog', 'newsletter', 'wordpress', 'cms', 'syndicat', 'boilerplate'],
    categories: ['workflow', 'notify'],
    capabilities: ['network'],
  },
  {
    id: 'analytics-and-growth',
    title: 'Analytics and growth',
    purpose: 'Measure what landed and what to do next',
    keywords: ['audience', 'seo', 'serp', 'backlink', 'engagement', 'impression', 'subscriber', 'views', 'conversion', 'rank tracking', 'growth', 'analytics'],
    avoid: ['token', 'session usage', 'context', 'per-model', 'input', 'queue', 'dock'],
    categories: ['usage'],
    capabilities: [],
  },
  {
    id: 'asset-and-context-library',
    title: 'Memory and asset library',
    purpose: 'Keep context, references, and raw material retrievable',
    keywords: ['memory', 'context', 'knowledge', 'library', 'asset', 'archive', 'storage', 'index', 'embedding', 'vector'],
    categories: ['memory'],
    capabilities: ['fs-write'],
    essential: true,
  },
  {
    id: 'data-and-analysis',
    title: 'Data and analysis',
    purpose: 'Query, reshape, and chart data',
    keywords: ['data', 'sql', 'query', 'dataframe', 'csv', 'spreadsheet', 'pandas', 'etl', 'chart', 'statistic', 'duckdb'],
    categories: ['tools', 'usage'],
    capabilities: [],
  },
  {
    id: 'security-and-audit',
    title: 'Security and audit',
    purpose: 'Look for weaknesses, leaks, and policy breaches',
    keywords: ['security', 'audit', 'vulnerab', 'cve', 'scan', 'leak', 'threat', 'permission', 'policy', 'sast'],
    categories: ['security'],
    capabilities: [],
    essential: true,
  },
  {
    id: 'agent-orchestration',
    title: 'Agent orchestration',
    purpose: 'Split work across agents and bring the results back',
    keywords: ['subagent', 'agent team', 'orchestrat', 'delegat', 'swarm', 'spawn', 'parallel agent', 'workforce'],
    categories: ['agi', 'workflow'],
    capabilities: ['subagent'],
  },
  {
    id: 'model-and-provider',
    title: 'Models and providers',
    purpose: 'Choose, route, and account for the models in use',
    keywords: ['model', 'provider', 'llm', 'embedding', 'routing', 'token', 'openai', 'anthropic', 'ollama', 'qwen', 'deepseek'],
    categories: ['model'],
    capabilities: ['llm'],
  },
  {
    id: 'session-and-context',
    title: 'Sessions and context',
    purpose: 'Keep sessions resumable and context affordable',
    keywords: ['session', 'compact', 'resume', 'transcript', 'context window', 'token budget', 'checkpoint'],
    categories: ['session'],
    capabilities: [],
  },
  {
    id: 'ui-and-theming',
    title: 'Interface and theming',
    purpose: 'Change how the harness looks and how it is driven',
    keywords: ['theme', 'skin', 'interface', 'layout', 'color', 'glass', 'font', 'widget', 'panel', 'composer'],
    categories: ['theme', 'ui'],
    capabilities: [],
  },
]

/** @type {Record<string, {title: string, match: string[], roles: string[]}>} */
export const PRESETS = {
  devops: {
    title: 'DevOps / platform',
    match: ['devops', 'dev ops', 'sre', 'platform engineering', 'infrastructure stack', 'ci/cd', 'ci cd', 'deployment pipeline', 'ops stack'],
    roles: ['git-and-review', 'ci-and-quality', 'containers-and-infra', 'deploy-and-release', 'secrets-and-credentials', 'observability', 'alerting-and-notify', 'remote-access', 'scheduling-and-automation'],
  },
  'content-creator': {
    title: 'Content creation',
    match: ['content creat', 'content stack', 'creator', 'youtube', 'blog', 'newsletter', 'podcast', 'social media', 'publishing', 'copywriting', 'video channel'],
    roles: ['research-and-capture', 'writing-and-editing', 'images-and-visuals', 'video-and-audio', 'publishing-and-distribution', 'analytics-and-growth', 'asset-and-context-library', 'scheduling-and-automation'],
  },
  research: {
    title: 'Research and analysis',
    match: ['research', 'investigat', 'literature', 'due diligence', 'analysis desk'],
    roles: ['research-and-capture', 'data-and-analysis', 'asset-and-context-library', 'writing-and-editing', 'docs-and-runbooks', 'analytics-and-growth'],
  },
  security: {
    title: 'Security',
    match: ['security', 'appsec', 'threat', 'red team', 'blue team', 'compliance', 'audit stack'],
    roles: ['security-and-audit', 'secrets-and-credentials', 'observability', 'alerting-and-notify', 'docs-and-runbooks'],
  },
  frontend: {
    title: 'Frontend / design',
    match: ['frontend', 'front-end', 'ui stack', 'design system', 'web design', 'product design'],
    roles: ['ui-and-theming', 'images-and-visuals', 'git-and-review', 'ci-and-quality', 'docs-and-runbooks'],
  },
  data: {
    title: 'Data',
    match: ['data stack', 'analytics stack', 'etl', 'warehouse', 'bi stack', 'reporting stack'],
    roles: ['data-and-analysis', 'observability', 'scheduling-and-automation', 'asset-and-context-library', 'docs-and-runbooks'],
  },
  'agent-platform': {
    title: 'Agent platform',
    match: ['agent platform', 'agent stack', 'multi-agent', 'agentic', 'agent orchestration', 'swarm'],
    roles: ['agent-orchestration', 'model-and-provider', 'session-and-context', 'asset-and-context-library', 'scheduling-and-automation', 'observability'],
  },
  personal: {
    title: 'Personal productivity',
    match: ['personal productivity', 'knowledge work', 'second brain', 'note taking', 'pkm', 'life admin'],
    roles: ['docs-and-runbooks', 'asset-and-context-library', 'scheduling-and-automation', 'alerting-and-notify', 'research-and-capture'],
  },
}

const GENERIC_DEFAULTS = ['scheduling-and-automation', 'asset-and-context-library', 'alerting-and-notify', 'docs-and-runbooks']

/**
 * Whether a phrase at a position in the purpose is negated, so "not a content creator" does not
 * select the content-creation preset.
 * @param {string} text - the lowercased purpose.
 * @param {number} index - where the phrase begins.
 * @returns {boolean} true when a negation immediately precedes the phrase.
 */
function isNegated(text, index) {
  const before = text.slice(Math.max(0, index - 32), index)
  return /(^|[^a-z])(not|no|never|without|avoid|instead of|rather than|other than)\s[^.;]{0,24}$/.test(before)
}

/**
 * Derive the roles a purpose needs. A purpose naming a preset takes that preset; otherwise roles
 * are chosen by how many of their keywords the purpose uses, filled out with generic roles so a
 * vague purpose still produces a stack.
 * @param {string} purpose - what the stack is for, in the user's words.
 * @param {{maxRoles?: number}} [options] - role cap.
 * @returns {{purpose: string, presetId: string|null, title: string, roles: Role[], rationale: string}} the intent.
 */
export function deriveIntent(purpose, options = {}) {
  const text = String(purpose ?? '').toLowerCase().trim()
  const maxRoles = options.maxRoles ?? 9
  const byId = new Map(ROLES.map((role) => [role.id, role]))

  let presetId = null
  let bestMatchLength = 0
  for (const [id, preset] of Object.entries(PRESETS)) {
    for (const phrase of preset.match) {
      const index = text.indexOf(phrase)
      if (index === -1 || phrase.length <= bestMatchLength) continue
      if (isNegated(text, index)) continue
      presetId = id
      bestMatchLength = phrase.length
    }
  }

  if (presetId !== null) {
    const preset = PRESETS[presetId]
    const roles = preset.roles.map((id) => byId.get(id)).filter(Boolean)
    return {
      purpose: String(purpose ?? ''),
      presetId,
      title: preset.title,
      roles: roles.slice(0, maxRoles),
      rationale: `matched the ${preset.title} preset on "${text.slice(0, 80)}"`,
    }
  }

  const scored = ROLES.map((role) => ({
    role,
    hits: role.keywords.filter((keyword) => text.includes(keyword)).length,
  })).filter((entry) => entry.hits > 0)
    .sort((a, b) => (b.hits - a.hits) || a.role.id.localeCompare(b.role.id))

  const roles = scored.map((entry) => entry.role)
  for (const id of GENERIC_DEFAULTS) {
    if (roles.length >= 4) break
    const role = byId.get(id)
    if (role && !roles.includes(role)) roles.push(role)
  }

  const rationale = scored.length > 0
    ? `no preset matched; chose ${roles.length} roles from ${scored.length} whose keywords appear in the purpose`
    : 'no preset and no keyword matched; fell back to generic roles — name the purpose more concretely for a sharper stack'
  return { purpose: String(purpose ?? ''), presetId: null, title: 'Custom stack', roles: roles.slice(0, maxRoles), rationale }
}

/**
 * Look a role up by id.
 * @param {string} id - role id.
 * @returns {Role|undefined} the role.
 */
export function roleById(id) {
  return ROLES.find((role) => role.id === id)
}
