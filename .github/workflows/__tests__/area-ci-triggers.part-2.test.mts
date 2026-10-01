import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'

import picomatch from 'picomatch'

import { describe, expect, it } from 'vitest'

import { assertNoWorkflowViolations } from '../../test-helpers/workflow-fixtures.mts'

type WorkflowStep = {
  id?: string
  with?: { command?: string; filters?: string }
}

type WorkflowJob = {
  outputs?: Record<string, string>
  steps?: WorkflowStep[]
}

type Workflow = {
  on?: unknown
  jobs?: Record<string, WorkflowJob> & {
    'detect-changes'?: WorkflowJob
  }
}

const detectChangesWorkflow = load(
  readFileSync('.github/workflows/ci-detect-changes.yml', 'utf8'),
) as Workflow
import { runtimePathFilters as refineRuntimeWebFilters } from '../../test-helpers/path-filter-test-fixtures.mts'

function filterMatches(
  globs: string[],
  path: string,
  predicateQuantifier: 'some' | 'every',
  options: Parameters<typeof picomatch.isMatch>[2] = {},
): boolean {
  const matches = (glob: string) => picomatch.isMatch(path, glob, options)
  return predicateQuantifier === 'every' ? globs.every(matches) : globs.some(matches)
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

function refinedRuntimeFilterMatchesChangedFiles(filterName: string, paths: string[]): boolean {
  const globs = refineRuntimeWebFilters[filterName]
  expect(globs).toBeDefined()

  return paths.some(path => filterMatches(globs!, path, 'every', { dot: true }))
}

const refinedRuntimeFilters = [
  'web',
  'storybook',
  'playwright',
  'web-integration',
  'build-web',
  'build-backend',
] as const

const expensiveRuntimeFilters = [
  'playwright',
  'web-integration',
  'build-web',
  'build-backend',
] as const

describe('Area CI triggers', () => {
  it('routes web dependency-cruiser config changes only to their owning web test job', () => {
    const dependencyCruiserConfig = ['web/.dependency-cruiser.cjs']
    const detectChangesOutputs = detectChangesWorkflow.jobs?.['detect-changes']?.outputs ?? {}

    for (const filterName of refinedRuntimeFilters) {
      expect(detectChangesOutputs[filterName]).toContain(
        `steps.refine-runtime-web.outputs.runtime-${filterName}`,
      )
      if (filterName === 'web') continue
      expectRefinedRuntimeFilterMisses(filterName, dependencyCruiserConfig)
    }

    expect(refinedRuntimeFilterMatchesChangedFiles('web', dependencyCruiserConfig)).toBe(true)
    expect(
      refinedRuntimeFilterMatchesChangedFiles('web', [
        'web/.dependency-cruiser.cjs',
        'web/app/page.tsx',
      ]),
    ).toBe(true)
    expectRefinedRuntimeFilterMatches('web', [
      'backend/types/api.mts',
      'ts-shared/session-jwt/index.mts',
      'pnpm-workspace.yaml',
    ])

    expectRefinedRuntimeFilterMatches('web', ['web/app/page.tsx'])
    // version-only package.json bump (no lockfile change) must NOT trigger storybook
    expectRefinedRuntimeFilterMisses('storybook', ['package.json'])
    // real dep change (lockfile update) still triggers storybook
    expectRefinedRuntimeFilterMatches('storybook', [
      'web/components/Button.stories.tsx',
      'pnpm-lock.yaml',
    ])
    expectRefinedRuntimeFilterMatches('playwright', [
      'web/app/page.tsx',
      'cloudflare-worker/src/index.mts',
    ])
    expectRefinedRuntimeFilterMatches('web-integration', [
      'web/app/page.tsx',
      'backend/services/foo.mts',
    ])
    expectRefinedRuntimeFilterMatches('build-web', ['web/app/page.tsx', 'backend/types/api.mts'])
    expectRefinedRuntimeFilterMatches('build-backend', ['backend/services/foo.mts'])
  })

  it('excludes markdown, Vitest files, and test helpers from runtime filters', () => {
    for (const filterName of expensiveRuntimeFilters) {
      expectRefinedRuntimeFilterMisses(filterName, [
        '.github/actions/build-web-targets/build-web-targets.test.mts',
        'backend/test-helpers/subagent-test-utils.mts',
        'backend/services/foo.test.mts',
        'backend/test-helpers/entities/users.mts',
        'cloudflare-worker/src/proxy.spec.mts',
        'docs/development/ci.md',
        'email-templates/welcome.test.tsx',
        'lambdas/test-helpers/image-resize/index.mts',
        'lambdas/image-resize/transform.spec.mts',
        'ts-shared/session-jwt/index.test.mts',
        'web/app/routes.spec.mts',
        'web/components/button.test.tsx',
        'web/test-helpers/form-keyboard.ts',
      ])
    }

    expect(
      refinedRuntimeFilterMatchesChangedFiles('build-web', [
        'web/components/button.test.tsx',
        'web/test-helpers/form-keyboard.ts',
      ]),
    ).toBe(false)
    expect(
      refinedRuntimeFilterMatchesChangedFiles('build-backend', [
        'backend/test-helpers/subagent-test-utils.mts',
        'backend/test-helpers/entities/users.mts',
        'backend/services/foo.test.mts',
      ]),
    ).toBe(false)
    expect(
      refinedRuntimeFilterMatchesChangedFiles('build-backend', [
        'backend/test-helpers/package.json',
      ]),
    ).toBe(true)
    expect(
      refinedRuntimeFilterMatchesChangedFiles('storybook', [
        'docs/development/ci.md',
        'web/app/page.mock.test.tsx',
        'web/components/button.test.tsx',
        'web/instrumentation.mock.test.ts',
        'web/test-helpers/form-keyboard.ts',
      ]),
    ).toBe(false)
  })

  it('excludes Storybook-only changes from other runtime filters', () => {
    const storybookOnlyFiles = [
      'web/.storybook/main.ts',
      'web/components/button.stories.tsx',
      'web/storybook/design-system/button.stories.tsx',
    ]

    expectRefinedRuntimeFilterMatches('storybook', storybookOnlyFiles)
    for (const filterName of expensiveRuntimeFilters) {
      expectRefinedRuntimeFilterMisses(filterName, storybookOnlyFiles)
    }
  })
})
