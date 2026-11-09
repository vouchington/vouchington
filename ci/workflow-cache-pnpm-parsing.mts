import { parse as load } from 'yaml'

export type Step = {
  name?: string
  run?: string
  uses?: string
  with?: Record<string, unknown>
  env?: Record<string, unknown>
  'timeout-minutes'?: number
}
export type Host = {
  jobs?: Record<string, { env?: Record<string, unknown>; steps?: Step[] }>
  runs?: { using?: string; steps?: Step[] }
}
export type YamlSources = ReadonlyMap<string, string>
export const WORKFLOW = '.github/workflows/'
export const ACTION = '.github/actions/'
const LINGUA_RS_PATH =
  'node_modules/.pnpm/lingua-rs@${{ steps.lingua-rs.outputs.version }}/node_modules/lingua-rs/lingua_rs.*.node'
const ACTION_CACHE_PATHS: Readonly<Record<string, readonly string[]>> = {
  [`${ACTION}build-web-targets/action.yml`]: [
    'web/.next/standalone',
    'web/.next/static',
    'cloudflare-worker/dist',
  ],
  [`${ACTION}setup-backend/action.yml`]: [LINGUA_RS_PATH],
}
export const SCRIPT_FREE = [
  'fix-main-self-retry.yml#retry',
  'fix-main.yml#classify-self-failure',
  'fix-main.yml#related-candidates',
  'fix-main.yml#render-prompt',
  'fix-main.yml#triage-and-rerun',
  'plan-completion.yml#audit',
].map(owner => `${WORKFLOW}${owner}`)

export function runsPnpmInstall(body: string | undefined): boolean {
  if (!body) return false
  return body
    .replace(/\\\r?\n\s*/g, ' ')
    .split('\n')
    .some(line =>
      /\bpnpm(?:\s+-\S+(?:\s+[^-\s]\S*)?)*\s+(?:install|i)\b/.test(line.replace(/#.*$/, '')),
    )
}

export function actionStepBlocks(source: string, usesPattern: RegExp): string[] {
  const blocks: string[] = []
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!usesPattern.test(lines[i]!)) continue
    const inlineStepIndent = lines[i]!.match(/^(\s*)-\s+uses:/)?.[1].length
    const standaloneUsesIndent = lines[i]!.match(/^(\s*)uses:/)?.[1].length
    const stepIndent =
      inlineStepIndent ?? (standaloneUsesIndent != null ? standaloneUsesIndent - 2 : undefined)
    if (stepIndent == null || stepIndent < 0) continue
    const startPattern = new RegExp(`^ {${stepIndent}}- `)
    let start = i
    while (start > 0 && !startPattern.test(lines[start]!)) start--
    let end = i + 1
    while (end < lines.length && !startPattern.test(lines[end]!)) end++
    blocks.push(lines.slice(start, end).join('\n'))
  }
  return blocks
}

export function parsed(sources: YamlSources, path: string): Host {
  const source = sources.get(path)
  if (source === undefined) throw new Error(`Missing workflow source: ${path}`)
  return load(source) as Host
}
export function stepLists(sources: YamlSources): Array<{ owner: string; steps: Step[] }> {
  return [...sources.keys()].toSorted().flatMap(path => {
    const host = parsed(sources, path)
    if (host.runs)
      return host.runs.using === 'composite' ? [{ owner: path, steps: host.runs.steps ?? [] }] : []
    return Object.entries(host.jobs ?? {}).map(([job, value]) => ({
      owner: `${path}#${job}`,
      steps: value.steps ?? [],
    }))
  })
}
export function inlineLocalComposites(
  sources: YamlSources,
  steps: readonly Step[],
  seen = new Set<string>(),
): Step[] {
  return steps.flatMap(step => {
    if (!step.uses?.startsWith('./.github/actions/')) return [step]
    const dir = step.uses.slice(2)
    const path = [`${dir}/action.yml`, `${dir}/action.yaml`].find(candidate =>
      sources.has(candidate),
    )
    if (!path) throw new Error(`Local action ${step.uses} has no action.yml`)
    if (seen.has(path)) throw new Error(`Recursive local action: ${path}`)
    const host = parsed(sources, path)
    return [
      step,
      ...inlineLocalComposites(
        sources,
        host.runs?.using === 'composite' ? (host.runs.steps ?? []) : [],
        new Set([...seen, path]),
      ),
    ]
  })
}
export function normalizedCachePaths(value: unknown): string[] | null {
  let values: string[]
  if (typeof value === 'string') values = [value]
  else if (
    Array.isArray(value) &&
    value.every((entry): entry is string => typeof entry === 'string')
  )
    values = value
  else return null
  return values.flatMap(entry =>
    entry
      .split('\n')
      .map(path => path.trim())
      .filter(Boolean),
  )
}
export function cachePathsAreAllowed(value: unknown, sourcePath = ''): boolean {
  const paths = normalizedCachePaths(value)
  if (paths === null || paths.length === 0) return false
  if (paths.every(path => path === '~/.cache/ms-playwright')) return true
  const allowed = ACTION_CACHE_PATHS[sourcePath]
  return (
    allowed !== undefined &&
    paths.length === allowed.length &&
    paths.every((path, index) => path === allowed[index])
  )
}
export function isActionsCacheStep(step: Step): boolean {
  return /^(?:actions\/cache|actions\/cache\/(?:restore|save))@/.test(step.uses ?? '')
}
export function cachePathViolations(source: string, path: string): string[] {
  const host = load(source) as Host
  const steps = [
    ...Object.values(host.jobs ?? {}).flatMap(job => job.steps ?? []),
    ...(host.runs?.steps ?? []),
  ]
  let cacheIndex = 0
  return steps.reduce<string[]>((found, step) => {
    if (!isActionsCacheStep(step)) return found
    cacheIndex++
    if (cachePathsAreAllowed(step.with?.path, path)) return found
    found.push(
      `${path}: actions/cache step ${cacheIndex} has unapproved path ${JSON.stringify(step.with?.path)}.`,
    )
    return found
  }, [])
}
export function setupNodePnpm(step: Step): boolean {
  return (
    step.uses?.startsWith('vouchington/vouchington-tooling/.github/actions/setup-node-pnpm@') ===
    true
  )
}
export function setupCall(step: Step): boolean {
  return setupNodePnpm(step) || step.uses === './.github/actions/setup-backend'
}
export function hasCredential(step: Step): boolean {
  const serialized = JSON.stringify({ env: step.env, with: step.with })
  return (
    serialized.includes('secrets.') ||
    step.uses?.startsWith('vouchington/vouchington-tooling/.github/actions/setup-aws@') === true ||
    step.uses?.startsWith('aws-actions/configure-aws-credentials@') === true
  )
}
