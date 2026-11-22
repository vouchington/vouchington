import { afterEach, describe, expect, it, vi } from 'vitest'
import { VitestNoSkipsReporter, ciReporters } from 'vouchington-tooling/vitest-diagnostics'
import { vitestCiReporterOptions } from './vitest-ci-reporter-options.mts'

describe('CI whole-test skip acceptance', () => {
  afterEach(() => vi.unstubAllEnvs())

  it.each(['', '1'])('includes the gate in normal CI and Storybook browser mode %s', browser => {
    vi.stubEnv('VITEST_CI_REPORTERS', 'run')
    vi.stubEnv('VITEST_STORYBOOK_BROWSER', browser)
    const reporters = ciReporters(vitestCiReporterOptions)
    if (!Array.isArray(reporters)) throw new Error('CI reporter array missing')
    expect(reporters.filter(r => r instanceof VitestNoSkipsReporter)).toHaveLength(1)
    expect(reporters).toContain('junit')
  })
})
