import { afterEach, describe, expect, it, vi } from 'vitest'
import { ciReporters } from 'vouchington-tooling/vitest-diagnostics'
import { vitestCiReporterOptions } from '../../test-helpers/vitest-ci-reporter-options.mts'
import { vitestReporterPolicyViolations } from '../../ci/vitest-reporter-policy.mts'
import {
  reporterWorkflowFixtures,
  reporterUploadFieldMutations,
} from '../../ci/test-helpers/vitest-reporter-fixtures.mts'

describe('Vitest CI reporters', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('accepts compliant workflow fixtures', () => {
    expect(vitestReporterPolicyViolations(reporterWorkflowFixtures())).toEqual([])
  })

  it('rejects a missing JUnit upload', () => {
    const sources = reporterWorkflowFixtures()
    sources['.github/workflows/tests-web.yml'] = sources['.github/workflows/tests-web.yml'].replace(
      'actions/upload-artifact@',
      'actions/other@',
    )
    expect(vitestReporterPolicyViolations(sources)).toEqual([
      '.github/workflows/tests-web.yml: web-tests JUnit upload policy',
    ])
  })

  it.each(reporterUploadFieldMutations)('rejects invalid upload field %s', (before, after) => {
    const sources = reporterWorkflowFixtures()
    const path = '.github/workflows/tests-web.yml'
    sources[path] = sources[path].replace(before, after)
    expect(vitestReporterPolicyViolations(sources)).toContain(
      '.github/workflows/tests-web.yml: web-tests JUnit upload policy',
    )
  })

  it('rejects command and reporter policy violations', () => {
    const sources = reporterWorkflowFixtures()
    const path = '.github/workflows/tests-web.yml'
    sources[path] = sources[path].replace('vitest run --bail=3', 'vitest run --reporter=blob')
    expect(vitestReporterPolicyViolations(sources)).toEqual([
      '.github/workflows/tests-web.yml: command missing --bail=3: vitest run --reporter=blob',
      '.github/workflows/tests-web.yml: reporter configuration: vitest run --reporter=blob',
    ])
  })

  it('rejects changes to the isolated route command', () => {
    const sources = reporterWorkflowFixtures()
    const path = '.github/workflows/tests-tooling.yml'
    sources[path] = sources[path].replace('i18n-route-bounds', 'i18n-route-bounds-extra')
    expect(vitestReporterPolicyViolations(sources)).toEqual([
      'i18n-route-bounds command or environment differs',
    ])
  })

  it('keeps annotated JUnit and diagnostic reporting without a blob collector', () => {
    vi.stubEnv('VITEST_CI_REPORTERS', 'run')
    vi.stubEnv('VITEST_STORYBOOK_BROWSER', undefined)
    vi.stubEnv('VITEST_DIAGNOSTICS', undefined)
    vi.stubEnv('VITEST_FILE_PROGRESS_FILE', undefined)
    vi.stubEnv('GITHUB_REPOSITORY', 'example/repository')
    vi.stubEnv('GITHUB_SHA', 'a'.repeat(40))
    vi.stubEnv('GITHUB_WORKSPACE', '/workspace')
    const reporters = ciReporters(vitestCiReporterOptions)

    expect(reporters).toEqual(
      expect.arrayContaining([expect.objectContaining({ onProcessTimeout: expect.any(Function) })]),
    )
    expect(reporters).toEqual(expect.arrayContaining(vitestCiReporterOptions.extraReporters))
    expect(vitestCiReporterOptions.fileProgressPrefix).toBe('[backend-unit-file]')
    expect(vitestCiReporterOptions.storybookProgressPrefix).toBe('[storybook-browser-progress]')
  })

  it('adds browser progress diagnostics for Storybook runs', () => {
    vi.stubEnv('VITEST_CI_REPORTERS', 'run')
    vi.stubEnv('VITEST_STORYBOOK_BROWSER', '1')
    vi.stubEnv('VITEST_DIAGNOSTICS', undefined)
    vi.stubEnv('VITEST_FILE_PROGRESS_FILE', undefined)

    expect(ciReporters(vitestCiReporterOptions)).toEqual(
      expect.arrayContaining(vitestCiReporterOptions.extraReporters),
    )
  })
})
