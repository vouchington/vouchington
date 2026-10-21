import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'
import { parse as parseJsonc } from 'jsonc-parser'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

type NoMistakesConfig = {
  rules?: Array<{ name?: string; options?: Record<string, unknown>; rule?: string }>
}

type OxlintConfig = {
  rules?: Record<string, unknown>
}

function readRepoFile(path: string): string {
  return readFileSync(`${repoRoot}/${path}`, 'utf8')
}

function readNoMistakesConfig(): NoMistakesConfig {
  return parseYaml(readRepoFile('.no-mistakes.yml')) as NoMistakesConfig
}

function readOxlintConfig(): OxlintConfig {
  return parseJsonc(readRepoFile('.oxlintrc.json')) as OxlintConfig
}

describe('no-mistakes config freshness', () => {
  it('routes no-data mock tests to backend CI and their production source stems', () => {
    const rules = readNoMistakesConfig().rules ?? []
    const correspondence = rules.find(rule => rule.rule === 'vitest-test-correspondence')
    const ciCoverage = rules.find(rule => rule.rule === 'vitest-ci-path-coverage')

    expect(correspondence?.options?.stemSuffixesToStrip).toContain('.no-data.mock')
    expect(ciCoverage?.options?.projectFilters).toMatchObject({
      'backend-no-data-mocks': ['backend'],
      'backend-real-glide-mq': ['backend'],
      'backend-migration-initializers': ['backend'],
    })
  })

  it('keeps integration markers on analyzer-limited LLM seams', () => {
    expect(readRepoFile('backend/modules/model-providers/generate.mts')).toContain(
      '/* no-mistakes: integration=anthropic */\n/* no-mistakes: integration=openai */\nexport async function generateJson',
    )
  })

  it('enables no-mistakes Next.js feature ban rules for the web project', () => {
    const noMistakes = readRepoFile('.no-mistakes.yml')

    expect(noMistakes).toContain('root: web')
    expect(noMistakes).toContain('rule: nextjs-no-api-routes')
    expect(noMistakes).toContain('rule: nextjs-no-caching')
  })

  // The release-age rule owns registry synchronization; structured config owns value shapes.
  it('keeps pnpm patch bans and release-age/allowBuilds value assertions in repository policy', () => {
    const rules = readNoMistakesConfig().rules?.filter(
      candidate => candidate.name === 'pnpm-workspace.yaml value types',
    )

    expect(rules).toHaveLength(1)
    expect(rules?.[0]).toMatchObject({
      options: {
        policies: [
          expect.objectContaining({
            bannedKeys: ['patchedDependencies', 'allowUnusedPatches'],
            files: ['pnpm-workspace.yaml'],
            valueAssertions: expect.arrayContaining([
              { key: 'minimumReleaseAge', kind: 'positive-number' },
              { key: 'allowBuilds', kind: 'record-of-boolean' },
            ]),
          }),
        ],
      },
      rule: 'structured-config-policy',
    })
  })

  it('keeps module mock integration exports inside the guarded internal specifiers', () => {
    const moduleMockBoundary = readOxlintConfig().rules?.['no-mistakes/module-mock-boundary']

    expect(moduleMockBoundary).toEqual([
      'error',
      expect.objectContaining({
        internalSpecifiers: expect.arrayContaining(['@modules/**']),
        integrationExports: expect.objectContaining({
          specifiers: ['@modules/**'],
          specifierPrefix: '@modules/',
          sourcePathTemplates: [
            'backend/modules/{specifierSuffix}.mts',
            'backend/modules/{specifierSuffix}/index.mts',
          ],
        }),
      }),
    ])
  })

  it('keeps filesystem exceptions limited to current files', () => {
    const config = readNoMistakesConfig()
    const agentCoverage = config.rules?.find(rule => rule.name === 'backend agent test coverage')
    const storyCoverage = config.rules?.find(
      rule => rule.name === 'web/components/ui story coverage',
    )
    const noMistakes = readRepoFile('.no-mistakes.yml')
    const webVitestConfig = readRepoFile('test-helpers/vitest-config/web-projects.mts')

    expect(agentCoverage?.options).not.toHaveProperty('excludeDirs')
    expect(storyCoverage?.options).toMatchObject({
      excludeBasenames: [
        '_button-tooltip.tsx',
        'availability-indicator.test.tsx',
        'breadcrumb.mock.test.tsx',
        'carousel.mock.test.tsx',
        'checkbox-card.test.tsx',
        'error-boundary.test.tsx',
      ],
    })
    expect(storyCoverage?.options).not.toHaveProperty('excludePrefixes')
    expect(noMistakes).not.toContain('web/node_modules/**')
    expect(webVitestConfig).not.toContain("'web/node_modules/**'")
    expect(noMistakes).not.toContain('.github/workflows/AGENTS.md')
  })
})
