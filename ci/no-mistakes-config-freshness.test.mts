import { execFileSync } from 'node:child_process'
import { globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, matchesGlob } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'
import { parse as parseJsonc } from 'jsonc-parser'
import { describe, expect, it } from 'vitest'
import vitestConfig from '../vitest.config.mts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

type EnvironmentConfig = {
  exclude?: string[]
  groups?: Array<{ limit?: unknown; type: string }>
  include?: string[]
  limit?: unknown
}

type NoMistakesConfig = {
  tests?: {
    vitest?: { projects?: Record<string, { integration_suites?: Record<string, string[]> }> }
  }
  test_plan?: {
    playwright?: { environments?: Record<string, EnvironmentConfig> }
    vitest?: { environments?: Record<string, EnvironmentConfig> }
  }
  rules?: Array<{ name?: string; options?: Record<string, unknown>; rule?: string }>
}

type VitestProject = {
  test?: { name?: string; include?: string[]; exclude?: string[] }
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

function getVitestProject(name: string): VitestProject {
  const projects = (vitestConfig.test?.projects ?? []) as VitestProject[]
  const project = projects.find(candidate => candidate.test?.name === name)
  if (!project) {
    throw new Error(`missing Vitest project ${name}`)
  }
  return project
}

function normalizeGlobPath(path: string): string {
  return path.replaceAll('\\', '/')
}

function filterExcludedPaths(paths: string[], excludePatterns: string[]): string[] {
  return paths
    .map(normalizeGlobPath)
    .filter(path => !excludePatterns.some(pattern => matchesGlob(path, normalizeGlobPath(pattern))))
}

function getVitestProjectFiles(name: string): Set<string> {
  const project = getVitestProject(name)
  const included = (project.test?.include ?? []).flatMap(pattern =>
    globSync(pattern, { cwd: repoRoot }),
  )
  return new Set(filterExcludedPaths(included, project.test?.exclude ?? []))
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

  it('normalizes glob paths before applying project exclusions', () => {
    const included = [
      String.raw`backend\agents\sample.openai.test.mts`,
      String.raw`backend\agents\sample.openai.mock.test.mts`,
    ]

    expect(filterExcludedPaths(included, ['**/*.mock.test.mts'])).toEqual([
      'backend/agents/sample.openai.test.mts',
    ])
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

  it('keeps local planner provider exclusions narrow while PR selection includes credentialed tests', () => {
    const config = readNoMistakesConfig()
    const vitestProjects = config.tests?.vitest?.projects ?? {}
    const vitestEnvironments = config.test_plan?.vitest?.environments ?? {}
    const playwrightEnvironments = config.test_plan?.playwright?.environments ?? {}

    const providerExclusions = vitestEnvironments.prePush?.exclude ?? []
    expect(providerExclusions).toEqual([
      '**/*.openai*.test.mts',
      '**/*.bedrock*.test.mts',
      '**/*.stripe.test.mts',
    ])
    expect(vitestEnvironments.pullRequest?.exclude).toBeUndefined()
    for (const pattern of providerExclusions) {
      const matchedFiles = globSync(pattern, {
        cwd: repoRoot,
        exclude: ['**/node_modules/**', '**/.git/**'],
      }).map(normalizeGlobPath)
      const provider = pattern.match(/\.(openai|bedrock|stripe)/)?.[1]
      expect(provider).toBeDefined()
      const projectFiles = getVitestProjectFiles(`backend-${provider}`)
      expect(matchedFiles).not.toEqual([])
      for (const file of matchedFiles) {
        expect(projectFiles).toContain(file)
      }
    }
    expect(vitestProjects).toMatchObject({
      'backend-aws': { integration_suites: { aws: ['aws'] } },
      'backend-bedrock': { integration_suites: { bedrock: ['bedrock'] } },
      'backend-openai': { integration_suites: { openai: ['openai'] } },
    })
    expect(getVitestProjectFiles('backend-aws')).toContain('backend/modules/aws/s3.test.mts')

    expect(playwrightEnvironments.prePush?.exclude).toEqual([
      'playwright/tests/storybook/**',
      'playwright/credentialed/**',
    ])
    expect(playwrightEnvironments.prePushStorybook).toBeUndefined()
    expect(playwrightEnvironments.credentialed?.include).toEqual(['playwright/credentialed/**'])
    for (const pattern of playwrightEnvironments.credentialed?.include ?? []) {
      expect(globSync(pattern, { cwd: repoRoot })).not.toEqual([])
    }

    // Regression #9440: `prePush`'s env-level `limit` pools its budget across every group,
    // including `direct` -- the files the developer directly changed. Only fan-out-capable
    // groups (`dependencies`, `coverage`) may carry their own scoped budget; `direct` must stay
    // unbounded, or `no-mistakes tests plan --environment prePush` (the optional planning recipe
    // in docs/checklists/commit.md) can silently omit those files. Re-adding an env-level `limit`
    // would re-pool the budget even with these per-group limits in place, so assert it absent too.
    for (const prePush of [vitestEnvironments.prePush, playwrightEnvironments.prePush]) {
      expect(prePush?.limit).toBeUndefined()
      for (const group of prePush?.groups ?? []) {
        expect(group.limit !== undefined).toBe(group.type !== 'direct')
      }
    }
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
