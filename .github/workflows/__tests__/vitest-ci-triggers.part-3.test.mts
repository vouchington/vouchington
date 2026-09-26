import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'

import picomatch from 'picomatch'

import { describe, expect, it } from 'vitest'

import { assertNoWorkflowViolations } from '../../test-helpers/workflow-test-helpers.mts'

type PathFilters = Record<string, string[]>

const dockerignoreText = readFileSync('.dockerignore', 'utf8')
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

function expectRefinedRuntimeFilterMatches(filterName: string, paths: string[]): void {
  const globs = refineRuntimeWebFilters[filterName]
  expect(globs).toBeDefined()

  const misses = paths.filter(path => !filterMatches(globs!, path, 'every', { dot: true }))
  assertNoWorkflowViolations(misses, `${filterName} refined filter misses:`)
}

function refinedRuntimeFilterMatchesChangedFiles(filterName: string, paths: string[]): boolean {
  const globs = refineRuntimeWebFilters[filterName]
  expect(globs).toBeDefined()

  return paths.some(path => filterMatches(globs!, path, 'every', { dot: true }))
}

describe('Vitest CI triggers', () => {
  it('keeps Storybook-owned tests and runtime web source wired to Storybook', () => {
    expectRefinedRuntimeFilterMatches('storybook', [
      'web/storybook/__tests__/component-story-coverage.test.ts',
      'web/storybook/design-system/button.stories.tsx',
      'web/storybook/entities/entity-fixtures.ts',
      'web/.storybook/main.ts',
      'web/app/page.tsx',
      'web/components/ui/button.tsx',
    ])
  })

  it('still runs expensive runtime jobs when runtime source is mixed with excluded files', () => {
    expect(
      refinedRuntimeFilterMatchesChangedFiles('playwright', [
        'web/components/button.test.tsx',
        'web/app/page.tsx',
      ]),
    ).toBe(true)
    expect(
      refinedRuntimeFilterMatchesChangedFiles('web-integration', [
        'backend/services/foo.test.mts',
        'backend/services/foo.mts',
      ]),
    ).toBe(true)
    expect(
      refinedRuntimeFilterMatchesChangedFiles('build-web', [
        'web/test-helpers/form-keyboard.ts',
        'web/app/page.tsx',
      ]),
    ).toBe(true)
    expect(
      refinedRuntimeFilterMatchesChangedFiles('build-backend', [
        'backend/test-helpers/entities/users.mts',
        'backend/services/foo.mts',
      ]),
    ).toBe(true)
  })

  it('keeps direct Playwright owner changes wired to Playwright', () => {
    expectRefinedRuntimeFilterMatches('playwright', [
      'playwright.config.mts',
      'playwright/helpers/navigate-to.mts',
      'playwright/tests/auth/login.spec.mts',
      'ts-shared/utils/sentry-deployment-gate.mts',
    ])
  })

  it('keeps direct web integration owner changes wired to web integration', () => {
    expectRefinedRuntimeFilterMatches('web-integration', [
      'integration-tests/web-api/__tests__/routes.public.test.mts',
      'integration-tests/web/tests/web.test.mts',
    ])
  })

  it('keeps Docker contexts from including markdown, test helpers, and Storybook-only files', () => {
    for (const pattern of [
      '**/*.md',
      '**/*.mdx',
      '**/*.stories.ts',
      '**/*.stories.tsx',
      '**/test-helpers/**',
      '!backend/test-helpers/package.json',
      'backend/scripts/tests/**',
      'web/scripts/tests/**',
      'web/.storybook/**',
      'web/storybook/**',
    ]) {
      expect(dockerignoreText).toContain(pattern)
    }
  })
})
