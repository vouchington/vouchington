import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import { assertNoWorkflowViolations, type WorkflowStep } from './workflow-test-helpers.mts'

type CacheStep = WorkflowStep & { with?: Record<string, unknown> }
type CacheDocument = {
  jobs?: Record<string, { steps?: CacheStep[] }>
  runs?: { steps?: CacheStep[] }
}

const ALLOWED_CACHE_PATHS = new Set([
  '${{ steps.pnpm-store.outputs.path }}',
  '~/.cache/ms-playwright',
])

const yamlPaths = [
  ...readdirSync('.github/workflows').map(file => join('.github/workflows', file)),
  ...readdirSync('.github/actions', { withFileTypes: true }).flatMap(entry => {
    if (!entry.isDirectory()) return []
    const dir = join('.github/actions', entry.name)
    return readdirSync(dir).flatMap(file => (/^action\.ya?ml$/.test(file) ? [join(dir, file)] : []))
  }),
].filter(path => /\.ya?ml$/.test(path))

function isActionsCacheStep(step: CacheStep): boolean {
  return /^(?:actions\/cache|actions\/cache\/(?:restore|save))@/.test(step.uses ?? '')
}

function cacheSteps(source: string): CacheStep[] {
  const document = load(source) as CacheDocument
  const workflowSteps = Object.values(document.jobs ?? {}).flatMap(job => job.steps ?? [])
  return [...workflowSteps, ...(document.runs?.steps ?? [])].filter(isActionsCacheStep)
}

function normalizedCachePaths(value: unknown): string[] | null {
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

function cachePathsAreAllowed(value: unknown): boolean {
  const paths = normalizedCachePaths(value)
  return paths !== null && paths.length > 0 && paths.every(path => ALLOWED_CACHE_PATHS.has(path))
}

function cachePathViolations(source: string, label: string): string[] {
  return cacheSteps(source).flatMap((step, index) =>
    cachePathsAreAllowed(step.with?.path)
      ? []
      : [
          `${label}: actions/cache step ${index + 1} has unapproved path ${JSON.stringify(step.with?.path)}.`,
        ],
  )
}

describe('actions/cache path allowlist', () => {
  it.each([
    ['pnpm store', '${{ steps.pnpm-store.outputs.path }}', true],
    ['Playwright browsers', '~/.cache/ms-playwright', true],
    ['node_modules', 'node_modules', false],
    ['npm store', '~/.npm', false],
    ['yarn store', '~/.cache/yarn', false],
    ['arbitrary cache', '.cache/vite/vitest', false],
    ['mixed paths', ['${{ steps.pnpm-store.outputs.path }}', 'node_modules'], false],
    ['missing path', undefined, false],
  ])('%s allowed: %s', (_name, value, allowed) => {
    expect(cachePathsAreAllowed(value)).toBe(allowed)
  })

  it('detects an unapproved flow-style cache step', () => {
    const source =
      'jobs: { test: { steps: [{ uses: actions/cache@sha, with: { path: node_modules } }] } }'
    expect(cachePathViolations(source, 'fixture')).toEqual([
      'fixture: actions/cache step 1 has unapproved path "node_modules".',
    ])
  })

  it('allows only pnpm-store and Playwright browser cache paths in repository YAML', () => {
    const violations = yamlPaths.flatMap(path =>
      cachePathViolations(readFileSync(path, 'utf8'), path),
    )
    assertNoWorkflowViolations(violations, 'Every actions/cache path must be explicitly allowed:')
  })
})
