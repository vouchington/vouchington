import { describe, expect, it } from 'vitest'
import type { TestProjectInlineConfiguration } from 'vitest/config'
import { backendCoreProjects } from '../test-helpers/vitest-config/backend-core-projects.mts'
import { backendDataProjects } from '../test-helpers/vitest-config/backend-data-projects.mts'

const dataStoresSetup = './test-helpers/vitest.setup.data-stores.mts'
const failureInjectionSetup = './test-helpers/vitest.setup.failure-injection.mts'

const projects = [...backendCoreProjects, ...backendDataProjects].filter(
  (project): project is TestProjectInlineConfiguration =>
    typeof project === 'object' && project !== null && 'test' in project,
)

describe('failure-injection test database setup', () => {
  it('installs the shared-table triggers only for backend-data-stores, after data-store setup', () => {
    const installers = projects.filter(({ test }) =>
      [test?.globalSetup ?? []].flat().includes(failureInjectionSetup),
    )

    expect(installers.map(({ test }) => test?.name)).toEqual(['backend-data-stores'])
    expect(installers[0]?.test?.globalSetup).toEqual([dataStoresSetup, failureInjectionSetup])
  })

  it('keeps the triggers out of the project that shares a database with the schema snapshot check', () => {
    const capacity = projects.find(({ test }) => test?.name === 'backend-activitypub-capacity')

    expect(capacity?.test?.globalSetup).toBe(dataStoresSetup)
  })
})
