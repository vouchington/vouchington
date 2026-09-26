import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'

import picomatch from 'picomatch'

import { describe, expect, it } from 'vitest'

import { assertNoWorkflowViolations } from '../../test-helpers/workflow-test-helpers.mts'

type PathFilters = Record<string, string[]>

const filters = load(readFileSync('.github/ci-path-filters.yml', 'utf8')) as PathFilters

const refineRuntimeWebFilters = load(
  readFileSync('.github/ci-runtime-path-filters.yml', 'utf8'),
) as PathFilters

function filterMatches(
  globs: string[],
  path: string,
  predicateQuantifier: 'some' | 'every',
  options: Parameters<typeof picomatch.isMatch>[2] = {},
): boolean {
  const matches = (glob: string) => picomatch.isMatch(path, glob, options)
  return predicateQuantifier === 'every' ? globs.every(matches) : globs.some(matches)
}

function expectFilterMatches(filterName: string, paths: string[]): void {
  const globs = filters[filterName]
  expect(globs).toBeDefined()

  const misses = paths.filter(path => !filterMatches(globs!, path, 'some'))
  assertNoWorkflowViolations(misses, `${filterName} filter misses:`)
}

function expectRefinedRuntimeFilterMatches(filterName: string, paths: string[]): void {
  const globs = refineRuntimeWebFilters[filterName]
  expect(globs).toBeDefined()

  const misses = paths.filter(path => !filterMatches(globs!, path, 'every', { dot: true }))
  assertNoWorkflowViolations(misses, `${filterName} refined filter misses:`)
}

function expectRefinedRuntimeFilterMisses(filterName: string, paths: string[]): void {
  const globs = refineRuntimeWebFilters[filterName]
  expect(globs).toBeDefined()

  const matches = paths.filter(path => filterMatches(globs!, path, 'every', { dot: true }))
  assertNoWorkflowViolations(matches, `${filterName} refined filter unexpectedly matches:`)
}

function expandBraceGlob(glob: string): string[] {
  // Refined runtime filters intentionally use one whole-glob brace group so
  // this helper can compare them directly with the primary positive filters.
  if (!glob.startsWith('{') || !glob.endsWith('}')) return [glob]
  const inner = glob.slice(1, -1)
  if (/[{}]/.test(inner)) {
    throw new Error(`Unsupported nested brace glob in CI trigger test helper: ${glob}`)
  }
  return inner.split(',')
}

const refinedRuntimeFilters = [
  'web',
  'storybook',
  'playwright',
  'web-integration',
  'build-web',
  'build-backend',
] as const

describe('Vitest CI triggers', () => {
  it('selects backend tests for the deployed Valkey admin entrypoint without the deleted script path', () => {
    expectFilterMatches('backend', [
      'backend/entrypoints/api/valkey-admin.mts',
      'backend/services/valkey-admin/diagnostics.mts',
    ])
    expect(filterMatches(filters.backend!, 'backend/scripts/flush-valkey-scoped.mts', 'some')).toBe(
      false,
    )
  })

  it('runs Storybook for every browser-runtime input', () => {
    const runtimeInputs = [
      'ci/run-storybook-browser-tests.mts',
      'ci/storybook-browser-runner.mts',
      'ci/storybook-browser-runner-env.mts',
      'test-helpers/vitest-config/environment.mts',
    ]

    expectFilterMatches('storybook', runtimeInputs)
    expectRefinedRuntimeFilterMatches('storybook', runtimeInputs)
  })
  it('keeps negated path-filter globs in the every-quantified refinement step', () => {
    const negated = Object.entries(filters).flatMap(([filterName, globs]) =>
      globs.flatMap(glob => (glob.startsWith('!') ? [`${filterName}: ${glob}`] : [])),
    )
    const refinedNegated = Object.entries(refineRuntimeWebFilters).flatMap(([filterName, globs]) =>
      globs.flatMap(glob => (glob.startsWith('!') ? [`${filterName}: ${glob}`] : [])),
    )

    expect(negated).toEqual([])
    expect(refinedNegated).not.toContain('web: !web/.dependency-cruiser.cjs')
    expect(refinedNegated).toContain('storybook: !web/.dependency-cruiser.cjs')
    expect(refinedNegated).toContain('storybook: !**/*.md')
    expect(refinedNegated).toContain('storybook: !web/test-helpers/**')
    expect(refinedNegated).toContain('playwright: !web/.dependency-cruiser.cjs')
    expect(refinedNegated).toContain('web-integration: !web/.dependency-cruiser.cjs')
    expect(refinedNegated).toContain('build-web: !web/.dependency-cruiser.cjs')
    expect(refinedNegated).toContain('build-web: !web/storybook/**')
    expect(refinedNegated).toContain('build-backend: !backend/test-helpers/**/*.mts')
    expect(filters['build-backend-infra']?.some(glob => glob.startsWith('!'))).toBe(false)
    expect(filters['build-web-infra']?.some(glob => glob.startsWith('!'))).toBe(false)
  })

  it('keeps refined runtime web positives in sync with primary filters', () => {
    for (const filterName of refinedRuntimeFilters) {
      const refinedPositiveGlobs = refineRuntimeWebFilters[filterName]?.filter(
        glob => !glob.startsWith('!'),
      )
      expect(refinedPositiveGlobs).toHaveLength(1)
      expect(new Set(expandBraceGlob(refinedPositiveGlobs![0]!))).toEqual(
        new Set(filters[filterName].flatMap(expandBraceGlob)),
      )
    }
  })

  it('runs backend tests for runtime queue worker and flow packages', () => {
    expectFilterMatches('backend', [
      'backend/entrypoints/api/package.json',
      'backend/entrypoints/worker-cpu/package.json',
      'backend/entrypoints/worker-io/package.json',
      'backend/worker-runtime/index.mts',
      'backend/flows/core/enqueues.mts',
      'backend/queues/crawler/enqueues.mts',
      'backend/workers/crawler/workers.mts',
      'backend/api/v1/check-api-message-safety.real-glide.mock.test.mts',
    ])
  })

  it('runs tooling tests for workflow and tooling fixtures they validate', () => {
    expectFilterMatches('tooling', [
      '.github/workflows/ci.yml',
      '.github/workflows/tests-backend-unit.yml',
      '.github/workflows/checks-backend-smoke.yml',
      '.github/workflows/README.md',
      '.github/workflows/VITEST.md',
      '.github/workflows/CLAUDE.md',
      '.github/workflows/example.yaml',
      '.github/workflows/secret-context.test.mts',
      '.coverage-rules.yml',
      '.agents/skills/triage-security/SKILL.md',
      'CLAUDE.md',
      'docs/development/ci.md',
      'docs/prompts/SCHEDULED.md',
      'docs/prompts/automation/fix-main.md',
      'docs/prompts/automation/scheduled-prompt.md',
      'docs/prompts/scheduled/ci.md',
      'backend/agents/README.md',
      'backend/agents/reference-tests.md',
      'backend/Dockerfile',
      'backend/package.json',
      'backend/entrypoints/api/package.json',
      'backend/entrypoints/worker-cpu/package.json',
      'backend/entrypoints/worker-io/package.json',
      'backend/worker-runtime/package.json',
      'playwright.config.mts',
      'ts-shared/utils/package.json',
    ])
  })

  it('runs lambda tests for shared lambda dependencies and Vitest inputs', () => {
    expectFilterMatches('lambdas', [
      'lambdas/image-resize/index.mts',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'test-helpers/vitest-config/web-projects.mts',
      'ts-shared/utils/index.mts',
      'ts-shared/url-signing/index.mts',
    ])
  })

  it('keeps API fixture changes on their owning test jobs without waking Playwright', () => {
    const apiFixturePaths = ['api-fixtures/v1/manifest.json']
    const sharedPlaywrightInfrastructure = [
      'ci/allocate-browser-safe-ports.py',
      'playwright/config/shared-config.mts',
    ]

    expectFilterMatches('backend', apiFixturePaths)
    expectFilterMatches('web', apiFixturePaths)
    expectRefinedRuntimeFilterMatches('web', apiFixturePaths)
    expectFilterMatches('playwright', sharedPlaywrightInfrastructure)
    expectRefinedRuntimeFilterMatches('playwright', sharedPlaywrightInfrastructure)
    expectRefinedRuntimeFilterMisses('playwright', apiFixturePaths)
    expectFilterMatches('playwright-credentialed', sharedPlaywrightInfrastructure)
  })

  it('keeps Playwright CI tooling tests and Cloudflare test support out of Playwright runtime CI', () => {
    expectRefinedRuntimeFilterMisses('playwright', [
      'ci/playwright/shard-total.test.mts',
      'cloudflare-worker/test-helpers/src/mock-env.mts',
      'cloudflare-worker/src/auth/test-jwt-fixtures.mts',
      'dev/initialize',
      'dev/test-helpers/initialize.mts',
    ])
  })
})
