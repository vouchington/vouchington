import { afterEach, describe, expect, it, vi } from 'vitest'

const originalArgv = [...process.argv]
const originalCoverageScope = process.env.VITEST_COVERAGE_SCOPE
const originalCoverageEnabled = process.env.VITEST_COVERAGE_ENABLED

// Cache-busting query suffixes force vitest to re-evaluate the module with the
// current process.argv; computed specifiers keep tsc from resolving the query URL.
const environmentModulePath = '../test-helpers/vitest-config/environment.mts'
const loadEnvironment = (
  name: string,
): Promise<typeof import('../test-helpers/vitest-config/environment.mts')> => {
  vi.resetModules()
  const cacheBustingQuery = name === 'single-web-project' ? name : 'multiple-projects'
  return import(`${environmentModulePath}?${cacheBustingQuery}`)
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

    const { coverageConfig, coverageFlags } = await loadEnvironment('single-web-project')

    expect(coverageFlags.isScopedCoverage).toBe(true)
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

    const { coverageConfig, coverageFlags } = await loadEnvironment('multiple-projects')

    expect(coverageFlags.isScopedCoverage).toBe(false)
    expect(coverageConfig().include).toEqual(['**/*.{mts,ts,tsx}'])
  })

  it('includes Storybook helper modules in the web-storybook coverage scope', async () => {
    process.env.VITEST_COVERAGE_SCOPE = 'web-storybook'
    process.argv = ['node', 'vitest', 'run', '--project', 'web-storybook', '--coverage']

    const { coverageConfig, coverageFlags } = await loadEnvironment('multiple-projects')

    expect(coverageFlags.isWebStorybookCoverage).toBe(true)
    expect(coverageConfig().include).toEqual([
      'web/storybook/entities/entity-fixtures.ts',
      'web/storybook/entities/topics-story-recommendations.ts',
      'web/test-helpers/storybook/component-story-coverage/message.ts',
    ])
  })

  it('limits portability coverage to the two host-sensitive implementations', async () => {
    process.env.VITEST_COVERAGE_SCOPE = 'portability'
    process.argv = ['node', 'vitest', 'run', '--project', 'lambdas-portability', '--coverage']

    const { coverageConfig, coverageFlags } = await loadEnvironment('multiple-projects')

    expect(coverageFlags.isScopedCoverage).toBe(true)
    expect(coverageConfig().include).toEqual([
      'lambdas/dev-server.mts',
      'cloudflare-worker/scripts/wrangler/runtime.mts',
    ])
  })

  it('leaves include unset for the changed scope so uninstrumented files stay absent from LCOV', async () => {
    process.env.VITEST_COVERAGE_SCOPE = 'changed'
    process.argv = ['node', 'vitest', 'run', 'ci/coverage-local-changed.test.mts', '--coverage']

    const { coverageConfig, coverageFlags } = await loadEnvironment('multiple-projects')

    expect(coverageFlags.isScopedCoverage).toBe(true)
    expect(coverageFlags.isChangedCoverage).toBe(true)
    expect(coverageConfig().include).toBeUndefined()
  })

  it('disables coverage when a CI workflow does not publish it', async () => {
    process.env.VITEST_COVERAGE_ENABLED = 'false'
    process.argv = ['node', 'vitest', 'run', '--project', 'backend-modules']

    const { coverageConfig, isVitestCoverageEnabled } = await loadEnvironment('multiple-projects')

    expect(isVitestCoverageEnabled).toBe(false)
    expect(coverageConfig().enabled).toBe(false)
  })

  it('keeps an explicit local --coverage flag enabled', async () => {
    process.env.VITEST_COVERAGE_ENABLED = 'false'
    process.argv = ['node', 'vitest', 'run', '--project', 'backend-modules', '--coverage']

    const { coverageConfig, isVitestCoverageEnabled } = await loadEnvironment('single-web-project')

    expect(isVitestCoverageEnabled).toBe(true)
    expect(coverageConfig().enabled).toBe(true)
  })
})
