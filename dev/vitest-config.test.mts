import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import picomatch from 'picomatch'
import { describe, expect, it } from 'vitest'

type VitestProjectConfig = {
  root?: string
  test?: {
    env?: Record<string, string>
    name?: string
    include?: string[]
    exclude?: string[]
    setupFiles?: string[]
    testTimeout?: number
    hookTimeout?: number
  }
}

const rootConfigSource = readFileSync(new URL('../vitest.config.mts', import.meta.url), 'utf8')
const rootConfig = (await import('../vitest.config.mts')).default
const vitestProjects = (rootConfig.test?.projects ?? []) as VitestProjectConfig[]

const configHelperDir = new URL('../test-helpers/vitest-config/', import.meta.url)
const configHelperFiles = readdirSync(configHelperDir)
  .filter(f => f.endsWith('.mts'))
  .sort()
const projectConfigPaths = configHelperFiles.reduce<string[]>((paths, file) => {
  if (file.endsWith('projects.mts')) paths.push(`test-helpers/vitest-config/${file}`)
  return paths
}, [])
const allConfigSources = [
  rootConfigSource,
  ...configHelperFiles.map(f => readFileSync(new URL(f, configHelperDir), 'utf8')),
].join('\n')
const astGrepBin = join(process.cwd(), 'node_modules/@ast-grep/cli/ast-grep')
const vitestExcludeArrayRule = [
  'id: vitest-exclude-arrays',
  'language: Tsx',
  'rule:',
  '  kind: pair',
  '  all:',
  '    - has:',
  '        field: key',
  '        kind: property_identifier',
  '        regex: "^exclude$"',
  '    - has:',
  '        field: value',
  '        kind: array',
].join('\n')

type AstGrepMatch = {
  text: string
  file: string
}

describe('dev-tools Vitest config', () => {
  it('collects dev test files directly', () => {
    const devTools = vitestProjects.find(project => project.test?.name === 'dev-tools')

    expect(devTools?.test).toMatchObject({
      include: ['dev/**/*.test.mts'],
      setupFiles: ['./test-helpers/vitest.setup.tooling-isolated-env.mts'],
    })
  })

  it('assigns split preflight tests to exactly one dedicated project', () => {
    for (const [projectName, testFile] of [
      ['lambdas-portability', 'lambdas/dev-server.test.mts'],
      ['cloudflare-worker-portability', 'cloudflare-worker/scripts/wrangler/runtime.test.mts'],
      ['static-analysis-ast-grep', 'static-code-analysis/__tests__/ast-grep-tsx-parity.test.mts'],
      [
        'web-storybook-component-coverage',
        'web/storybook/__tests__/component-story-coverage.test.ts',
      ],
    ] as const) {
      const owners = vitestProjects.filter(project => {
        const included =
          project.test?.include?.some(pattern => picomatch(pattern)(testFile)) ?? false
        const excluded =
          project.test?.exclude?.some(pattern => picomatch(pattern)(testFile)) ?? false
        return included && !excluded
      })
      expect({ testFile, owners: owners.map(owner => owner.test?.name) }).toEqual({
        testFile,
        owners: [projectName],
      })
    }
  })

  it('assigns future root tooling helper tests to ci-tools only', () => {
    const testFile = 'test-helpers/future-tooling-helper.test.mts'
    const owners = vitestProjects.filter(project => {
      const included = project.test?.include?.some(pattern => picomatch(pattern)(testFile)) ?? false
      const excluded = project.test?.exclude?.some(pattern => picomatch(pattern)(testFile)) ?? false
      return included && !excluded
    })

    expect(owners.map(owner => owner.test?.name)).toEqual(['ci-tools'])
  })

  it('loads worktree resources only for Playwright helpers', () => {
    const playwrightHelpers = vitestProjects.find(
      project => project.test?.name === 'playwright-helpers',
    )

    expect(playwrightHelpers?.test?.setupFiles).toEqual([
      './test-helpers/vitest.setup.tooling-worktree-env.mts',
    ])
  })

  it('uses synthetic buckets for Lambda dev-server fixtures', () => {
    for (const projectName of ['lambdas-portability', 'lambdas-mocks']) {
      const project = vitestProjects.find(project => project.test?.name === projectName)

      expect(project?.test?.env).toEqual({
        S3_BUCKET_IMAGES: 'test-images',
        S3_BUCKET_RENDERS: 'test-renders',
      })
    }
  })
})

describe('Vitest project exclude invariant', () => {
  it('uses AST-selected literal exclude arrays that preserve Vitest defaults', () => {
    const rawExcludeArrays = JSON.parse(
      execFileSync(
        astGrepBin,
        [
          'scan',
          '--inline-rules',
          vitestExcludeArrayRule,
          '--json=compact',
          'vitest.config.mts',
          ...projectConfigPaths,
        ],
        { encoding: 'utf8' },
      ),
    ) as AstGrepMatch[]
    expect(rawExcludeArrays).not.toHaveLength(0)

    const missingDefaultExcludes = rawExcludeArrays.filter(
      match => !match.text.includes("'**/node_modules/**'") || !match.text.includes("'**/.git/**'"),
    )
    expect(missingDefaultExcludes.map(match => `${match.file}: ${match.text}`)).toEqual([])
  })

  it('preserves Vitest default dependency-tree excludes in every project', () => {
    expect(vitestProjects).not.toHaveLength(0)

    const projectsMissingDefaultExcludes = vitestProjects.filter(
      project =>
        !project.test?.exclude?.includes('**/node_modules/**') ||
        !project.test.exclude.includes('**/.git/**'),
    )
    expect(projectsMissingDefaultExcludes.map(project => project.test?.name)).toEqual([])
  })

  it('does not match nested dependency tests in backend services analytics', () => {
    const project = vitestProjects.find(p => p.test?.name === 'backend/services/analytics')
    expect(project).toBeDefined()

    const dependencyTest =
      'backend/services/analytics/node_modules/ssrf-guard/src/node/safe-fetch.test.mts'
    const includeMatcher = picomatch(project?.test?.include ?? [], { dot: true })
    const excludeMatcher = picomatch(project?.test?.exclude ?? [], { dot: true })

    expect(includeMatcher(dependencyTest)).toBe(true)
    expect(excludeMatcher(dependencyTest)).toBe(true)
    expect(includeMatcher(dependencyTest) && !excludeMatcher(dependencyTest)).toBe(false)
  })
})

describe('Vitest fileParallelism invariant', () => {
  it('fileParallelism is never false in any vitest config file', () => {
    // All projects must allow parallel file execution. DB safety comes from randomized IDs
    // (the dirty-DB design in backend/test-helpers/CLAUDE.md), not serial ordering.
    // Concurrency is throttled only by the VITEST_MAX_WORKERS repo variable — see the
    // 'Vitest worker-count invariant' describe block below for why a project-level
    // `maxWorkers` literal is both banned and non-functional.
    //
    // Strip comments before matching to avoid false positives from explanatory comments,
    // and handle optional quotes around the key for robustness.
    const strippedSources = allConfigSources.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    expect(strippedSources).not.toMatch(/['"]?fileParallelism['"]?\s*:\s*false/)
  })

  it('root vitest.config.mts explicitly sets fileParallelism to true', () => {
    expect(rootConfigSource).toContain('fileParallelism: true')
  })
})

describe('Vitest worker-count invariant', () => {
  it('never hardcodes a project maxWorkers literal', () => {
    // vitest's config resolution reads VITEST_MAX_WORKERS *after* merging project config, so it
    // unconditionally overwrites any project-level `maxWorkers` the moment the env var is set —
    // which every test workflow in this repo does (the VITEST_MAX_WORKERS repo variable). A
    // literal maxWorkers is therefore both misleading (reads as a real cap; is not one in CI) and,
    // for fileParallelism-style serialization, actively harmful (maxWorkers: 1 is how
    // fileParallelism: false is implemented internally, so pinning it defeats the invariant above
    // the same way). Worker counts must always be derived from the environment via
    // parseVitestMaxWorkers()/parseStorybookBrowserMaxWorkers()
    // (test-helpers/vitest-config/environment.mts) — function calls, not literals — so this
    // matches only a hardcoded number.
    const strippedSources = allConfigSources.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    expect(strippedSources).not.toMatch(/['"]?maxWorkers['"]?\s*:\s*\d/)
  })
})

describe('Vitest timeout policy (#10762, #8078)', () => {
  // A project without an explicit testTimeout/hookTimeout silently inherits Vitest's built-in
  // 5000/10000 defaults, invisible at the project's definition site — how ts-shared broke `main`
  // twice. Read from the raw imported config objects, not resolved config, so the root backstop
  // in vitest.config.mts cannot mask a per-project omission that this suite exists to catch.
  const projectTimeouts = vitestProjects.map(project => ({
    name: project.test?.name,
    testTimeout: project.test?.testTimeout,
    hookTimeout: project.test?.hookTimeout,
  }))

  // Grounded in the current highest legitimate per-project override (real AWS/OpenAI network
  // calls, and web-integration's multi-process global setup). A genuinely slower test belongs a
  // targeted per-test override, not a bump to these ceilings. Inclusive by design: web-integration
  // deliberately sits exactly at HOOK_TIMEOUT_CEILING_MS, so this must stay `>`, never `>=`.
  const TEST_TIMEOUT_CEILING_MS = 60_000
  const HOOK_TIMEOUT_CEILING_MS = 90_000

  it('declares an explicit testTimeout on every project (#10762)', () => {
    const missing = projectTimeouts
      .filter(project => project.testTimeout === undefined)
      .map(project => project.name)
    expect(missing).toEqual([])
  })

  it('declares an explicit hookTimeout on every project (#10762)', () => {
    const missing = projectTimeouts
      .filter(project => project.hookTimeout === undefined)
      .map(project => project.name)
    expect(missing).toEqual([])
  })

  it('declares backstop testTimeout/hookTimeout at the root (#10762)', () => {
    expect(rootConfig.test?.testTimeout).toBeDefined()
    expect(rootConfig.test?.hookTimeout).toBeDefined()
  })

  it('never sets a project testTimeout above the ceiling', () => {
    const overCap = projectTimeouts
      .filter(
        project =>
          project.testTimeout !== undefined && project.testTimeout > TEST_TIMEOUT_CEILING_MS,
      )
      .map(project => ({ name: project.name, testTimeout: project.testTimeout }))
    expect(overCap).toEqual([])
  })

  it('never sets a project hookTimeout above the ceiling', () => {
    const overCap = projectTimeouts
      .filter(
        project =>
          project.hookTimeout !== undefined && project.hookTimeout > HOOK_TIMEOUT_CEILING_MS,
      )
      .map(project => ({ name: project.name, hookTimeout: project.hookTimeout }))
    expect(overCap).toEqual([])
  })
})
