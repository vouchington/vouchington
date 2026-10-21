import { afterEach, describe, expect, it, vi } from 'vitest'
import TestLifecycleReporter from '../playwright/test-lifecycle-reporter.mts'

type LifecycleTest = Parameters<TestLifecycleReporter['onTestEnd']>[0]
type LifecycleResult = Parameters<TestLifecycleReporter['onTestEnd']>[1]

const testCase: LifecycleTest = {
  id: 'owned-case',
  location: { file: '/owned/tests/case.spec.mts', line: 17, column: 1 },
  parent: { project: () => ({ name: 'chromium' }) },
}

function result(status: LifecycleResult['status']): LifecycleResult {
  return { status, retry: 0, workerIndex: 2, parallelIndex: 1, duration: 8 }
}

function createReporter() {
  const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const diagnostic = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  const reporter = new TestLifecycleReporter()
  reporter.onBegin({ rootDir: '/owned/tests', shard: { current: 2, total: 7 } })
  return { reporter, output, diagnostic }
}

describe('Playwright lifecycle skipped-result gate', () => {
  afterEach(() => vi.restoreAllMocks())
  it('preserves passed runs and the lifecycle event protocol', async () => {
    const { reporter, output, diagnostic } = createReporter()
    reporter.onTestBegin(testCase, result('passed'))
    reporter.onTestEnd(testCase, result('passed'))

    await expect(reporter.onEnd({ status: 'passed' })).resolves.toBeUndefined()
    expect(reporter.printsToStdio()).toBe(true)
    expect(diagnostic).not.toHaveBeenCalled()
    const events = output.mock.calls.map(([line]): unknown => JSON.parse(String(line)))
    expect(events).toEqual([
      {
        marker: 'playwright-test-lifecycle',
        event: 'begin',
        observedAt: expect.any(String),
        testId: 'owned-case',
        file: 'case.spec.mts',
        line: 17,
        project: 'chromium',
        shard: { current: 2, total: 7 },
        retry: 0,
        workerIndex: 2,
        parallelIndex: 1,
      },
      {
        marker: 'playwright-test-lifecycle',
        event: 'end',
        observedAt: expect.any(String),
        testId: 'owned-case',
        file: 'case.spec.mts',
        line: 17,
        project: 'chromium',
        shard: { current: 2, total: 7 },
        retry: 0,
        workerIndex: 2,
        parallelIndex: 1,
        status: 'passed',
        durationMs: 8,
      },
    ])
  })

  it('fails an otherwise passed run containing a skipped whole-test result', async () => {
    const { reporter } = createReporter()
    reporter.onTestEnd(testCase, result('skipped'))
    await expect(reporter.onEnd({ status: 'passed' })).resolves.toEqual({ status: 'failed' })
  })

  it('explains the failed override once with the skipped count and evidence locations', async () => {
    const { reporter, diagnostic } = createReporter()
    reporter.onTestEnd(testCase, result('skipped'))
    reporter.onTestEnd({ ...testCase, id: 'second-case' }, result('skipped'))
    await expect(reporter.onEnd({ status: 'passed' })).resolves.toEqual({ status: 'failed' })
    expect(diagnostic).toHaveBeenCalledTimes(1)
    const message = String(diagnostic.mock.calls[0]?.[0])
    expect(message).toContain('2 skipped results')
    expect(message).toContain('forbidden')
    expect(message).toContain('lifecycle logs and JUnit results')
  })

  it('retains the failed override if the diagnostic stream rejects the write', async () => {
    const { reporter, diagnostic } = createReporter()
    diagnostic.mockImplementation(() => {
      throw new Error('closed diagnostic stream')
    })
    reporter.onTestEnd(testCase, result('skipped'))
    await expect(reporter.onEnd({ status: 'passed' })).resolves.toEqual({ status: 'failed' })
  })

  it('does not mistake a begin placeholder for a skipped result', async () => {
    const { reporter } = createReporter()
    reporter.onTestBegin(testCase, result('skipped'))
    await expect(reporter.onEnd({ status: 'passed' })).resolves.toBeUndefined()
  })

  it.each(['failed', 'timedout', 'interrupted'] as const)(
    'preserves an existing %s run rather than replacing its outcome',
    async status => {
      const { reporter, diagnostic } = createReporter()
      reporter.onTestEnd(testCase, result('skipped'))
      const outcome = { status }
      await expect(reporter.onEnd(outcome)).resolves.toBeUndefined()
      expect(outcome).toEqual({ status })
      expect(diagnostic).not.toHaveBeenCalled()
    },
  )

  it('resets skipped results and run context when the reporter is reused', async () => {
    const { reporter, output } = createReporter()
    reporter.onTestEnd(testCase, result('skipped'))
    await expect(reporter.onEnd({ status: 'passed' })).resolves.toEqual({ status: 'failed' })

    reporter.onBegin({ rootDir: '/owned', shard: null })
    reporter.onTestEnd(testCase, result('passed'))
    await expect(reporter.onEnd({ status: 'passed' })).resolves.toBeUndefined()
    const lastEvent: unknown = JSON.parse(String(output.mock.calls.at(-1)?.[0]))
    expect(lastEvent).toMatchObject({ file: 'tests/case.spec.mts', shard: null, status: 'passed' })
  })
})
