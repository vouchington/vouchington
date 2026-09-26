import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as load } from 'yaml'
import picomatch from 'picomatch'
import { describe, expect, it } from 'vitest'

import { assertNoWorkflowViolations } from '../test-helpers/workflow-test-helpers.mts'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

type PathFilters = Record<string, string[]>

type Workflow = {
  on?: { push?: { paths?: string[] } }
  jobs?: Record<string, { steps?: Array<{ id?: string; with?: { filters?: string } }> }>
}

const portabilityWorkflow = load(
  readFileSync(join(repoRoot, '.github/workflows/tests-portability.yml'), 'utf8'),
) as Workflow
function detectChangesFilters(): PathFilters {
  return load(readFileSync(join(repoRoot, '.github/ci-path-filters.yml'), 'utf8')) as PathFilters
}

function filterMatches(globs: string[] | undefined, path: string): boolean {
  return (globs ?? []).some(glob => picomatch.isMatch(path, glob))
}

const portabilityEntries = [
  'lambdas/dev-server.test.mts',
  'cloudflare-worker/scripts/wrangler/runtime.test.mts',
] as const

const workspaceImportPrefixes: ReadonlyArray<readonly [string, string]> = [
  ['@lambdas/shared/', 'lambdas/shared/'],
  ['@ts-shared/url-signing', 'ts-shared/url-signing/'],
]

function resolveImport(fromFile: string, specifier: string): string | undefined {
  if (specifier.startsWith('node:') || specifier === 'vitest' || specifier.startsWith('vitest/')) {
    return undefined
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const resolved = relative(repoRoot, join(dirname(join(repoRoot, fromFile)), specifier))
    if (existsSync(join(repoRoot, resolved))) return resolved
    for (const ext of ['.mts', '.ts', '.js']) {
      if (existsSync(join(repoRoot, `${resolved}${ext}`))) return `${resolved}${ext}`
    }
    if (existsSync(join(repoRoot, resolved, 'index.mts'))) return join(resolved, 'index.mts')
    return resolved
  }
  for (const [prefix, mapped] of workspaceImportPrefixes) {
    if (
      specifier === prefix ||
      specifier.startsWith(prefix) ||
      specifier.startsWith(`${prefix}/`)
    ) {
      const rest =
        specifier === prefix
          ? ''
          : specifier.slice(prefix.endsWith('/') ? prefix.length : prefix.length + 1)
      const candidate =
        rest === '' ? mapped.replace(/\/$/u, '/index.mts') : `${mapped.replace(/\/$/u, '/')}${rest}`
      if (existsSync(join(repoRoot, candidate))) return candidate
      for (const ext of ['.mts', '.ts']) {
        if (existsSync(join(repoRoot, `${candidate}${ext}`))) return `${candidate}${ext}`
      }
      if (existsSync(join(repoRoot, candidate, 'index.mts'))) return join(candidate, 'index.mts')
      return candidate
    }
  }
  return undefined
}

function firstPartyImports(entry: string): string[] {
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const current = queue.pop()
    if (current === undefined || seen.has(current)) continue
    seen.add(current)
    const abs = join(repoRoot, current)
    if (!existsSync(abs) || !['.mts', '.ts', '.js'].includes(extname(abs))) continue
    const source = readFileSync(abs, 'utf8')
    const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/gu)].map(match => match[1])
    for (const specifier of specifiers) {
      const resolved = resolveImport(current, specifier)
      if (resolved !== undefined) queue.push(resolved)
    }
  }
  return [...seen]
}

describe('portability path filters', () => {
  it('does not use directory-wide ci/ or dev/ globs', () => {
    const paths = portabilityWorkflow.on?.push?.paths ?? []
    expect(paths).not.toContain('ci/**')
    expect(paths).not.toContain('dev/**')
    expect(paths).not.toContain('.agents/skills/retrospective/SKILL.md')
    expect(paths).toEqual(
      expect.arrayContaining([
        'ts-shared/utils/ephemeral-ports.mts',
        'lambdas/dev-server.mts',
        'lambdas/dev-server.test.mts',
        'lambdas/image-resize/**',
        'cloudflare-worker/scripts/wrangler/runtime.test.mts',
      ]),
    )
  })

  it('does not start on the #9389 ci-tools contract test', () => {
    const paths = portabilityWorkflow.on?.push?.paths ?? []
    expect(filterMatches(paths, 'ci/agent-workflow-docs.test.mts')).toBe(false)
    expect(filterMatches(paths, 'dev/pr-description.mts')).toBe(false)
    expect(
      filterMatches(detectChangesFilters().portability, 'ci/agent-workflow-docs.test.mts'),
    ).toBe(false)
  })

  it('covers first-party imports of the three portability includes', () => {
    const pushPaths = portabilityWorkflow.on?.push?.paths ?? []
    const prPaths = detectChangesFilters().portability
    const missing: string[] = []
    for (const entry of portabilityEntries) {
      for (const imported of firstPartyImports(entry)) {
        if (!filterMatches(pushPaths, imported)) missing.push(`push:${imported}`)
        if (!filterMatches(prPaths, imported)) missing.push(`pr:${imported}`)
      }
    }
    assertNoWorkflowViolations(missing, 'portability filter missing first-party imports:')
  })
})
