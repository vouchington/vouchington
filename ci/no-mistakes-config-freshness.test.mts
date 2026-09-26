import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

function runOxlintOnMockBoundaryFixture(source: string): { status: number; output: string } {
  const dir = mkdtempSync(join(tmpdir(), 'voucha-oxlint-mock-fixture-'))
  const file = join(dir, 'provider.mock.test.mts')
  try {
    writeFileSync(file, source)
    try {
      execFileSync('pnpm', ['exec', 'oxlint', '--type-aware', '--deny-warnings', file], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      })
      return { status: 0, output: '' }
    } catch (error) {
      // execFileSync always throws string stdout/stderr here since it's called with encoding: 'utf8'.
      const result = error as { status?: number; stderr?: string; stdout?: string }
      return { status: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
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
    })
  })

  it('keeps integration markers on analyzer-limited LLM seams', () => {
    expect(readRepoFile('backend/agents/_shared/run-tool-loop-streaming.mts')).toContain(
      '/* no-mistakes: integration=openai */\nexport async function* runToolLoopStreaming',
    )
    expect(readRepoFile('backend/agents/story-post/agent.mts')).toContain(
      '/* no-mistakes: integration=openrouter */\nexport async function callStoryPostAgent',
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

  it('allows spread-preserving mocks of tagged module integration exports only', () => {
    const mockFixture = (exportName: string): string => `
      import { vi } from 'vitest'

      vi.mock<typeof import('@modules/openai-utils/create-response')>(
        import('@modules/openai-utils/create-response'),
        async importOriginal => ({
          ...(await importOriginal()),
          ${exportName}: vi.fn<VitestLooseMock>(),
        }),
      )
    `
    const tagged = runOxlintOnMockBoundaryFixture(mockFixture('createOpenAIResponse'))
    expect(tagged).toEqual({ status: 0, output: '' })

    const untagged = runOxlintOnMockBoundaryFixture(mockFixture('streamOpenAIResponseEvents'))
    expect(untagged.status).not.toBe(0)
    expect(untagged.output).toContain('module-mock-boundary')
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
    expect(noMistakes).not.toContain('.github/workflows/CLAUDE.md')
  })
})
