import { fileURLToPath } from 'node:url'

import { resolveConfig } from 'no-mistakes'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

type NoMistakesConfig = {
  playwrightAstCoverage?: unknown
  frontendRoot?: unknown
  playwrightConfig?: unknown
  tests?: {
    playwright?: {
      configs?: string | string[]
      projects?: Record<string, { include?: string[] }>
      selectorRoots?: string[]
      navigationHelpers?: string[]
      ignoreRoutes?: string[]
      routeCoverageSources?: Array<{
        framework: string
        project: string
        include: string[]
        routes: string[]
        helpers: Array<{
          module: string
          export: string
          method: string
          urlArgument: number
        }>
      }>
      coverage?: {
        routes?: boolean
        selectors?: boolean
      }
      selectorExclude?: string[]
      selectors?: {
        testIds?: string[]
        componentTestIds?: Record<string, string>
        htmlIds?: boolean
        wrappers?: Array<{ module: string; export: string; testIdArgument: number }>
      }
    }
  }
  rules?: Array<{
    projects?: string[]
    rule?: string
    tests?: { playwright?: string[] }
  }>
}

const noMistakesConfig = (await resolveConfig({
  root: repoRoot,
  view: 'declared',
})) as NoMistakesConfig

describe('no-mistakes Playwright config', () => {
  it('keeps Playwright analyzer configuration and rules in declared no-mistakes policy', () => {
    const config = noMistakesConfig
    const playwright = config.tests?.playwright

    expect(playwright?.configs).toBe('playwright.config.mts')
    expect(playwright?.projects?.chromium?.include).toContain('playwright/tests/**/*.spec.mts')
    expect(playwright?.projects?.['support-tests']?.include).toContain(
      'ci/playwright/**/*.test.mts',
    )
    expect(playwright?.selectors?.testIds).toContain('data-pw')
    expect(playwright?.selectors?.componentTestIds).toBeDefined()
    expect(playwright?.selectorRoots).toEqual(
      expect.arrayContaining(['web/lib/navigation', 'web/lib/podcast-player', 'web/lib/routes']),
    )
    for (const rule of [
      'playwright-coverage',
      'playwright-unique-test-ids',
      'playwright-unique-html-ids',
      'playwright-prefer-test-id-locators',
    ])
      expect(config.rules).toContainEqual(expect.objectContaining({ rule }))
    expect(playwright?.coverage).toEqual({ routes: true, selectors: true })
    expect(playwright?.navigationHelpers).toEqual(['navigateTo'])
    expect(playwright?.ignoreRoutes).toEqual([
      '/landing/:idOrUsername',
      '/landing/:idOrUsername/:slug',
    ])
    expect(playwright?.selectorExclude).toEqual([
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.stories.ts',
      '**/*.stories.tsx',
      '**/__tests__/**',
      '**/*.mock.test.tsx',
    ])
    expect(playwright?.selectors?.htmlIds).toBe(false)
    expect(playwright?.selectors?.wrappers).toContainEqual({
      module: 'playwright/helpers/aside-locator.mts',
      export: 'getAsideLocator',
      testIdArgument: 1,
    })
    expect(playwright?.selectors?.wrappers).toEqual(
      expect.arrayContaining(
        [
          'chooseVote',
          'userSignalChoice',
          'voteBinaryChoice',
          'voteChoice',
          'voteChoiceGroup',
          'voteClear',
          'voteTrigger',
        ].map(exportName => ({
          module: 'playwright/helpers/semantic-vote.mts',
          export: exportName,
          testIdArgument: 1,
        })),
      ),
    )
    expect(config).not.toHaveProperty('playwrightAstCoverage')
    expect(config.frontendRoot).not.toBe('web/app')
    expect(config.playwrightConfig).not.toBe('playwright.config.mts')
  })

  it('credits only the finite HTTP-contract routes from the real Vitest integration owner', () => {
    expect(noMistakesConfig.tests?.playwright?.routeCoverageSources).toEqual([
      {
        framework: 'vitest',
        project: 'web-integration',
        include: ['integration-tests/web/**/*.mts'],
        routes: [
          '/bank-account/:id/settings/source',
          '/card/:id/settings/source',
          '/copyright/counter-notice',
          '/copyright/designated-agent',
          '/copyright/repeat-infringer-policy',
          '/healthz',
          '/referral-program/:id/settings/source',
          '/rewards-program-status/:id/settings/source',
          '/rewards-program/:id/settings/source',
          '/topic/:id/settings/source',
        ],
        helpers: [
          {
            module: 'integration-tests/web/helpers/client.mts',
            export: 'WebIntegrationClient',
            method: 'request',
            urlArgument: 0,
          },
          {
            module: 'integration-tests/web/helpers/client.mts',
            export: 'WebIntegrationClient',
            method: 'loadPage',
            urlArgument: 0,
          },
        ],
      },
    ])
  })

  it('binds coverage, unique HTML IDs, and prefer-test-id locators separately', () => {
    const rules = noMistakesConfig.rules ?? []
    const coverage = rules.find(candidate => candidate.rule === 'playwright-coverage')
    const uniqueHtmlIds = rules.find(candidate => candidate.rule === 'playwright-unique-html-ids')
    const preferTestId = rules.find(
      candidate => candidate.rule === 'playwright-prefer-test-id-locators',
    )

    expect(coverage).toMatchObject({ projects: ['web'] })
    expect(coverage?.tests?.playwright).toBeUndefined()
    expect(uniqueHtmlIds).toMatchObject({ projects: ['web'] })
    expect(uniqueHtmlIds?.tests).toBeUndefined()
    expect(preferTestId).toMatchObject({
      projects: ['web'],
      tests: { playwright: ['chromium'] },
    })
  })
})
