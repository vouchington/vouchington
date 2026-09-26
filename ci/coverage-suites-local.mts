import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import picomatch from 'picomatch'
import { shellQuote } from './coverage-local-utils.mts'
import { NO_DATA_MOCK_SOURCE_PATTERNS } from './coverage-no-data-mock-source-patterns.mts'
import { envForCoverageRun, type CoverageEnvSuite } from './coverage-suite-env.mts'
import { projectsForVitestGroup } from './run-vitest-project-group.mts'
export {
  DB_ENV_NAMES,
  WORKTREE_RESOURCE_ENV_NAMES,
  envForDbBackedToolingProject,
  envForCoverageRun,
  envWithoutWorktreeResources,
  envForDbBackedSuite,
  envForSuite,
  hasWebInit,
  loadCurrentWorktreeEnv,
} from './coverage-suite-env.mts'

export interface Suite extends CoverageEnvSuite {
  name: string
  projects: string[]
  sourcePatterns: string[]
}

export const UNINSTRUMENTED_LOCAL_COVERAGE_GLOBS: string[] = ['**/*.md', '**/vitest.setup*.mts']
export const SETUP_FILE_LOCAL_COVERAGE_GLOBS: string[] = ['**/vitest.setup*.mts']
export const LOCAL_COVERAGE_SUITE_TIMEOUT_MS = 25 * 60 * 1000

export const SUITES: Suite[] = [
  {
    name: 'ts-shared',
    projects: [...projectsForVitestGroup('ts-shared')],
    sourcePatterns: ['ts-shared/**'],
  },
  {
    name: 'backend-modules',
    projects: [...projectsForVitestGroup('local-coverage-backend-modules')],
    sourcePatterns: [
      'backend/data-stores/analytics/**',
      'backend/modules/**',
      'backend/services/analytics/**',
      'backend/test-helpers/**',
      'backend/**/*.no-data.mock.test.mts',
      ...NO_DATA_MOCK_SOURCE_PATTERNS,
      'email-templates/**',
    ],
  },
  {
    name: 'web',
    projects: [...projectsForVitestGroup('web')],
    sourcePatterns: ['web/**'],
  },
  {
    name: 'web-storybook',
    projects: [...projectsForVitestGroup('local-coverage-web-storybook')],
    coverageScope: 'web-storybook',
    sourcePatterns: ['web/components/**', 'web/hooks/**', 'web/storybook/**'],
  },
  {
    name: 'lambdas',
    projects: ['lambdas', 'lambdas-mocks'],
    sourcePatterns: ['lambdas/**'],
  },
  {
    name: 'cloudflare-worker',
    projects: ['cloudflare-worker', 'cloudflare-worker-mocks'],
    sourcePatterns: ['cloudflare-worker/**'],
  },
  {
    name: 'tooling',
    projects: [...projectsForVitestGroup('local-coverage-tooling')],
    coverageScope: 'tooling',
    sourcePatterns: [
      'ci/**',
      'dev/**',
      'static-code-analysis/**',
      '.github/actions/**',
      '.github/workflows/**',
      '.husky/**',
    ],
  },
  {
    name: 'portability',
    projects: [...projectsForVitestGroup('portability')],
    coverageScope: 'portability',
    sourcePatterns: ['dev/**', 'lambdas/**', 'cloudflare-worker/**'],
  },
  {
    name: 'playwright-helpers',
    projects: [...projectsForVitestGroup('local-coverage-playwright-helpers')],
    coverageScope: 'tooling',
    requiresWebInit: true,
    sourcePatterns: ['playwright/helpers/**'],
  },
  {
    name: 'backend-data-stores',
    projects: [...projectsForVitestGroup('local-coverage-backend-data-stores')],
    requiresWebInit: true,
    serialExecution: true,
    // Broad intentional — backend-modules overlaps; per-file predicate avoids false alarms.
    sourcePatterns: ['backend/**'],
  },
  {
    name: 'web-integration',
    projects: [...projectsForVitestGroup('local-coverage-web-integration')],
    requiresWebInit: true,
    unsetEnv: ['CF_WORKER_SECRET'],
    sourcePatterns: ['web/lib/api/**', 'integration-tests/web/**', 'integration-tests/web-api/**'],
  },
]

export function webInitSuiteNames(suites: Suite[] = SUITES): string {
  return suites.flatMap(suite => (suite.requiresWebInit ? [suite.name] : [])).join(', ')
}

export function runSuiteCoverage(
  suite: Suite,
  coverageDir: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
): number {
  const { args } = suiteCoverageCommand(suite, coverageDir)
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, {
    stdio: 'inherit',
    env: envForCoverageRun(suite, process.cwd(), baseEnv),
    timeout: LOCAL_COVERAGE_SUITE_TIMEOUT_MS,
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

export function suiteCoverageCommand(
  suite: Suite,
  coverageDir: string,
): { envPrefix: string; args: string[]; command: string } {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const args = [
    'exec',
    'vitest',
    'run',
    ...suite.projects.flatMap(p => ['--project', p]),
    ...(suite.serialExecution ? ['--no-file-parallelism'] : []),
    '--coverage',
    '--coverage.all=true',
    `--coverage.reportsDirectory=${join(coverageDir, suite.name)}`,
  ]
  const envPrefix = `${suite.coverageScope ? `VITEST_COVERAGE_SCOPE=${suite.coverageScope} ` : ''}${suite.serialExecution ? 'VITEST_MAX_WORKERS=1 ' : ''}`
  return { envPrefix, args, command: [pnpm, ...args].map(shellQuote).join(' ') }
}
const matcherCache = new Map<string, (str: string) => boolean>()
function getMatcher(pattern: string): (str: string) => boolean {
  let m = matcherCache.get(pattern)
  if (!m) {
    m = picomatch(pattern)
    matcherCache.set(pattern, m)
  }
  return m
}
export function suitesForFile(file: string): Suite[] {
  return SUITES.filter(suite => suite.sourcePatterns.some(pattern => getMatcher(pattern)(file)))
}

export function affectedSuites(changedFiles: string[]): {
  suites: Suite[]
  unmapped: string[]
  uninstrumented: string[]
} {
  const matched = new Set<Suite>()
  const unmapped: string[] = []
  const uninstrumented: string[] = []
  const isUninstrumented = picomatch(UNINSTRUMENTED_LOCAL_COVERAGE_GLOBS, { dot: true })
  const isSetupFile = picomatch(SETUP_FILE_LOCAL_COVERAGE_GLOBS)

  for (const file of changedFiles) {
    const matches = suitesForFile(file)
    if (isUninstrumented(file)) {
      uninstrumented.push(file)
      if (isSetupFile(file)) {
        for (const s of matches) matched.add(s)
      }
      continue
    }
    if (matches.length === 0) {
      unmapped.push(file)
    } else {
      for (const s of matches) matched.add(s)
    }
  }

  const suites = SUITES.filter(s => matched.has(s))
  return { suites, unmapped, uninstrumented }
}
