import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

type NoMistakesConfig = {
  tests?: {
    playwright?: {
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

function readRepoFile(path: string): string {
  return readFileSync(`${repoRoot}/${path}`, 'utf8')
}

function readNoMistakesConfig(): NoMistakesConfig {
  return parseYaml(readRepoFile('.no-mistakes.yml')) as NoMistakesConfig
}

describe('no-mistakes Playwright config', () => {
  it('keeps Playwright analyzer configuration and rules under .no-mistakes.yml', () => {
    const noMistakes = readRepoFile('.no-mistakes.yml')
    const config = readNoMistakesConfig()
    const playwright = config.tests?.playwright

    expect(noMistakes).toContain('tests:')
    expect(noMistakes).toContain('playwright:')
    expect(noMistakes).toContain('configs: playwright.config.mts')
    expect(noMistakes).toContain('projects:')
    expect(noMistakes).toContain('chromium:')
    expect(noMistakes).toContain('- playwright/tests/**/*.spec.mts')
    expect(noMistakes).toContain('support-tests:')
    expect(noMistakes).toContain('- ci/playwright/**/*.test.mts')
    expect(noMistakes).toContain('testIds:')
    expect(noMistakes).toContain('- data-pw')
    expect(noMistakes).toContain('componentTestIds:')
    expect(noMistakes).toContain('selectorRoots:')
    expect(noMistakes).toContain('- web/lib/navigation')
    expect(noMistakes).toContain('- web/lib/podcast-player')
    expect(noMistakes).toContain('- web/lib/routes')
    expect(noMistakes).toContain('rule: playwright-coverage')
    expect(noMistakes).toContain('rule: playwright-unique-test-ids')
    expect(noMistakes).toContain('rule: playwright-unique-html-ids')
    expect(noMistakes).toContain('rule: playwright-prefer-test-id-locators')
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
    expect(noMistakes).not.toContain('playwrightAstCoverage:')
    expect(noMistakes).not.toContain('frontendRoot: web/app')
    expect(noMistakes).not.toContain('playwrightConfig: playwright.config.mts')
  })

  it('credits only the finite HTTP-contract routes from the real Vitest integration owner', () => {
    expect(readNoMistakesConfig().tests?.playwright?.routeCoverageSources).toEqual([
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
          '/user/:idOrUsername/communities/proxy-following',
          '/user/:idOrUsername/communities/proxy-muted',
          '/user/:idOrUsername/communities/saved',
          '/user/:idOrUsername/domains/blocked',
          '/user/:idOrUsername/domains/muted',
          '/user/:idOrUsername/posts/following',
          '/user/:idOrUsername/posts/hidden',
          '/user/:idOrUsername/posts/saved',
          '/user/:idOrUsername/rss-feed-items/hidden',
          '/user/:idOrUsername/rss-feed-items/saved',
          '/user/:idOrUsername/rss-feed-items/viewed',
          '/user/:idOrUsername/rss-feeds/muted',
          '/user/:idOrUsername/topics/blocked',
          '/user/:idOrUsername/topics/dismissed-recommendations',
          '/user/:idOrUsername/topics/muted',
          '/user/:idOrUsername/topics/viewed',
          '/user/:idOrUsername/users/dismissed-recommendations',
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
    const rules = readNoMistakesConfig().rules ?? []
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
