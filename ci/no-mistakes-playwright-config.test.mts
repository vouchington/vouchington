import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

type NoMistakesConfig = {
  tests?: {
    playwright?: {
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
    expect(playwright?.coverage).toEqual({ routes: false, selectors: true })
    expect(noMistakes).not.toContain('ignoreRoutes:')
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
