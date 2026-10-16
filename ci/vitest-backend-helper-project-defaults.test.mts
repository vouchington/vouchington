import { describe, expect, it } from 'vitest'
import config from '../vitest.config.mts'

describe('backend test-helper project defaults', () => {
  it('declares five-second defaults with no project globalSetup', () => {
    const matches = (config.test?.projects ?? []).filter(
      project =>
        typeof project === 'object' &&
        'test' in project &&
        project.test?.name === 'backend-test-helpers',
    )
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      extends: true,
      test: { testTimeout: 5_000, hookTimeout: 5_000, pool: 'forks', isolate: false },
    })
    expect(matches[0]).not.toHaveProperty('test.globalSetup')
  })

  it('routes resource-bearing helpers through the initialized data-store project', () => {
    const files = [
      'backend/test-helpers/post-search-query-syntax.test.mts',
      'backend/test-helpers/dynamic-config.test.mts',
    ]
    const projects = config.test?.projects ?? []
    const helpers = projects.filter(
      project =>
        typeof project === 'object' &&
        'test' in project &&
        project.test?.name === 'backend-test-helpers',
    )
    const dataStores = projects.filter(
      project =>
        typeof project === 'object' &&
        'test' in project &&
        project.test?.name === 'backend-data-stores',
    )
    expect(helpers).toHaveLength(1)
    expect(dataStores).toHaveLength(1)
    expect(helpers[0]).toMatchObject({ test: { exclude: expect.arrayContaining(files) } })
    expect(dataStores[0]).toMatchObject({
      test: {
        include: expect.arrayContaining(files),
        globalSetup: './test-helpers/vitest.setup.data-stores.mts',
        testTimeout: 30_000,
        hookTimeout: 30_000,
      },
    })
  })
})
