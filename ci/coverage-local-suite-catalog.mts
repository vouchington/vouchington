import { coverageConfigForScope } from '../test-helpers/vitest-config/environment.mts'
import type { CoverageSuiteDescriptor } from './coverage-suites.mts'
import { SUITES, type Suite } from './coverage-suites-local.mts'
import { projectsForVitestGroup } from './run-vitest-project-group.mts'

const WEB_API_COVERAGE_SUITE: Suite = {
  name: 'web-api',
  projects: [...projectsForVitestGroup('web-api')],
  coverageScope: 'web-lib-api',
  requiresWebInit: true,
  unsetEnv: ['CF_WORKER_SECRET'],
  sourcePatterns: ['web/lib/api/**'],
}

export const LOCAL_COVERAGE_SUITES: readonly Suite[] = [...SUITES, WEB_API_COVERAGE_SUITE]

export function localCoverageSuite(name: string): Suite {
  const suite = LOCAL_COVERAGE_SUITES.find(candidate => candidate.name === name)
  if (!suite) throw new Error(`Unknown local coverage suite: ${name}`)
  return suite
}

export function localCoverageSuiteDescriptor(suite: Suite): CoverageSuiteDescriptor {
  const config = coverageConfigForScope(suite.coverageScope)
  return {
    suite: suite.name,
    projects: suite.projects,
    collector: {
      name: 'vitest-v8',
      settings: {
        all: true,
        exclude: config.exclude,
        include: config.include,
        provider: 'v8',
        reporters: config.reporter,
        scope: suite.coverageScope ?? null,
      },
    },
  }
}
