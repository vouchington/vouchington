import { afterEach, describe, expect, it, vi } from 'vitest'
import { ciReporters } from './vitest-ci-reporters.mts'
import { VitestNoSkipsReporter } from './vitest-no-skips-reporter.mts'

type CompletedModule = Parameters<VitestNoSkipsReporter['onTestRunEnd']>[0][number]
function moduleWithSkipped(count: number): CompletedModule {
  return { children: { allTests: () => Array.from({ length: count }) } }
}

describe('CI whole-test skip acceptance', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('rejects skipped results across modules', async () => {
    const reporter = new VitestNoSkipsReporter()
    await expect(
      reporter.onTestRunEnd([moduleWithSkipped(1), moduleWithSkipped(2)], [], 'passed'),
    ).rejects.toThrow('3 skipped results')
  })

  it('accepts completed runs without skipped results', async () => {
    const reporter = new VitestNoSkipsReporter()
    await expect(
      reporter.onTestRunEnd([moduleWithSkipped(0)], [], 'passed'),
    ).resolves.toBeUndefined()
    await expect(reporter.onTestRunEnd([], [], 'passed')).resolves.toBeUndefined()
  })

  it.each(['failed', 'interrupted'] as const)('preserves an existing %s outcome', async reason => {
    const reporter = new VitestNoSkipsReporter()
    await expect(reporter.onTestRunEnd([moduleWithSkipped(1)], [], reason)).resolves.toBeUndefined()
  })

  it('preserves an existing unhandled error without a second gate error', async () => {
    const reporter = new VitestNoSkipsReporter()
    await expect(
      reporter.onTestRunEnd([moduleWithSkipped(1)], [new Error('primary failure')], 'passed'),
    ).resolves.toBeUndefined()
  })

  it('uses only current run results when reused', async () => {
    const reporter = new VitestNoSkipsReporter()
    await expect(reporter.onTestRunEnd([moduleWithSkipped(1)], [], 'passed')).rejects.toThrow(
      '1 skipped results',
    )
    await expect(
      reporter.onTestRunEnd([moduleWithSkipped(0)], [], 'passed'),
    ).resolves.toBeUndefined()
  })

  it.each(['', '1'])(
    'includes the gate in normal CI and Storybook browser mode %s',
    async browser => {
      vi.stubEnv('VITEST_CI_REPORTERS', 'run')
      vi.stubEnv('VITEST_STORYBOOK_BROWSER', browser)
      const reporters = ciReporters()
      if (!Array.isArray(reporters)) throw new Error('CI reporter array missing')
      const gates = reporters.filter(reporter => reporter instanceof VitestNoSkipsReporter)
      expect(gates).toHaveLength(1)
      expect(reporters).toContain('junit')
      await expect(gates[0]!.onTestRunEnd([moduleWithSkipped(1)], [], 'passed')).rejects.toThrow(
        '1 skipped results',
      )
    },
  )

  it.each([undefined, ''])('keeps local reporter selection for %s', configured => {
    vi.stubEnv('VITEST_CI_REPORTERS', configured)
    vi.stubEnv('VITEST_DIAGNOSTICS', '')
    expect(ciReporters()).toBeUndefined()
    vi.stubEnv('VITEST_DIAGNOSTICS', '1')
    const diagnosticReporters = ciReporters()
    if (!Array.isArray(diagnosticReporters)) throw new Error('Diagnostic reporter array missing')
    expect(diagnosticReporters[0]).toBe('default')
    expect(diagnosticReporters.some(reporter => reporter instanceof VitestNoSkipsReporter)).toBe(
      false,
    )
  })

  it('retains rejection of unsupported reporter modes', () => {
    vi.stubEnv('VITEST_CI_REPORTERS', 'verbose')
    expect(ciReporters).toThrow('Unknown VITEST_CI_REPORTERS value')
  })
})
