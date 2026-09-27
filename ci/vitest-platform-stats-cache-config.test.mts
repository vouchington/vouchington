import { describe, expect, it } from 'vitest'
import picomatch from 'picomatch'
import type { TestProjectInlineConfiguration } from 'vitest/config'
import { backendDataProjects } from '../test-helpers/vitest-config/backend-data-projects.mts'

describe('platform-stats cache project', () => {
  it('owns only the platform-stats route test with private cache setup before runtime imports', () => {
    const routeTest = 'backend/api/v1/platform-stats/platform-stats.test.mts'
    const projects = backendDataProjects.filter(
      (project): project is TestProjectInlineConfiguration =>
        typeof project === 'object' && project !== null && 'test' in project,
    )
    const owners = projects.filter(
      ({ test }) =>
        picomatch(test?.include ?? [])(routeTest) && !picomatch(test?.exclude ?? [])(routeTest),
    )
    expect(owners.map(({ test }) => test?.name)).toEqual(['backend-platform-stats-cache'])
    const project = owners[0].test
    const ordinary = projects.find(({ test }) => test?.name === 'backend-data-stores')?.test
    expect(project).toMatchObject({
      pool: 'forks',
      isolate: true,
      testTimeout: 30_000,
      hookTimeout: 30_000,
      runner: './test-helpers/vitest.runner.shared-db-scope-guard.mts',
      include: [routeTest],
      exclude: ['**/node_modules/**', '**/.git/**'],
    })
    expect(project?.globalSetup).toEqual([
      './test-helpers/vitest.setup.data-stores.mts',
      './test-helpers/vitest.global-setup.platform-stats-cache.mts',
    ])
    expect(project?.setupFiles).toEqual([
      './test-helpers/vitest.setup.platform-stats-cache.mts',
      ...(ordinary!.setupFiles as string[]),
    ])
    expect(project).not.toHaveProperty('maxWorkers')
    expect(project).not.toHaveProperty('fileParallelism')
  })
})
