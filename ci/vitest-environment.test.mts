import { afterEach, describe, expect, it, vi } from 'vitest'

const originalArgv = [...process.argv]
const originalCoverageScope = process.env.VITEST_COVERAGE_SCOPE
const originalCoverageEnabled = process.env.VITEST_COVERAGE_ENABLED

// vi.resetModules() makes each import re-evaluate the module with the current process.argv.
const loadEnvironment = async () => {
  vi.resetModules()
  const environment = await import('../test-helpers/vitest-config/environment.mts')
  return environment
}

describe('vitest environment coverage config', () => {
  afterEach(() => {
    process.argv = [...originalArgv]
    if (originalCoverageScope === undefined) {
      delete process.env.VITEST_COVERAGE_SCOPE
    } else {
      process.env.VITEST_COVERAGE_SCOPE = originalCoverageScope
    }
    if (originalCoverageEnabled === undefined) {
      delete process.env.VITEST_COVERAGE_ENABLED
    } else {
      process.env.VITEST_COVERAGE_ENABLED = originalCoverageEnabled
    }
    vi.resetModules()
  })

  it('scopes coverage to web files for the single web project run', async () => {
    delete process.env.VITEST_COVERAGE_SCOPE
    process.argv = ['node', 'vitest', 'run', '--project', 'web', '--coverage']

    const { coverageConfig } = await loadEnvironment()

    expect(coverageConfig().include).toEqual(['web/**/*.{mts,ts,tsx}'])
  })

  it('keeps default coverage scope when multiple projects are selected', async () => {
    delete process.env.VITEST_COVERAGE_SCOPE
    process.argv = [
      'node',
      'vitest',
      'run',
      '--project',
      'web-api',
      '--project=web-integration',
      '--coverage',
    ]

    const { coverageConfig } = await loadEnvironment()

    expect(coverageConfig().include).toEqual(['**/*.{mts,ts,tsx}'])
  })

  it('includes Storybook helper modules in the web-storybook coverage scope', async () => {
    process.env.VITEST_COVERAGE_SCOPE = 'web-storybook'
    process.argv = ['node', 'vitest', 'run', '--project', 'web-storybook', '--coverage']

    const { coverageConfig } = await loadEnvironment()

    expect(coverageConfig().include).toEqual([
      'web/storybook/entities/entity-fixtures.ts',
      'web/storybook/entities/topics-story-recommendations.ts',
    ])
  })

  it('limits portability coverage to the two host-sensitive implementations', async () => {
    process.env.VITEST_COVERAGE_SCOPE = 'portability'
    process.argv = ['node', 'vitest', 'run', '--project', 'lambdas-portability', '--coverage']

    const { coverageConfig } = await loadEnvironment()

    expect(coverageConfig().include).toEqual([
      'lambdas/dev-server.mts',
      'cloudflare-worker/scripts/wrangler/runtime.mts',
    ])
  })

  it('disables coverage when a CI workflow does not publish it', async () => {
    process.env.VITEST_COVERAGE_ENABLED = 'false'
    process.argv = ['node', 'vitest', 'run', '--project', 'backend-modules']

    const { coverageConfig } = await loadEnvironment()

    expect(coverageConfig().enabled).toBe(false)
  })

  it('keeps an explicit local --coverage flag enabled', async () => {
    process.env.VITEST_COVERAGE_ENABLED = 'false'
    process.argv = ['node', 'vitest', 'run', '--project', 'backend-modules', '--coverage']

    const { coverageConfig } = await loadEnvironment()

    expect(coverageConfig().enabled).toBe(true)
  })
})
