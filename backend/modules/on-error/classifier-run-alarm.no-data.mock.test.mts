import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mirrors vitest.setup.sentry-mock.mts; kept local so this .mock test owns its vi.mock().
const sentryMocks = vi.hoisted(() => {
  const key = 'vouchaSentryMocks'
  const globalMocks = globalThis as typeof globalThis & {
    [key]?: {
      init: ReturnType<typeof vi.fn<VitestLooseMock>>
      captureException: ReturnType<typeof vi.fn<VitestLooseMock>>
      captureMessage: ReturnType<typeof vi.fn<VitestLooseMock>>
      flush: ReturnType<typeof vi.fn<VitestLooseMock>>
      addBreadcrumb: ReturnType<typeof vi.fn<VitestLooseMock>>
    }
  }
  const mocks = globalMocks[key] ?? {
    init: vi.fn<VitestLooseMock>(),
    captureException: vi.fn<VitestLooseMock>(),
    captureMessage: vi.fn<VitestLooseMock>(),
    flush: vi.fn<VitestLooseMock>(() => Promise.resolve(true)),
    addBreadcrumb: vi.fn<VitestLooseMock>(),
  }
  globalMocks[key] = mocks
  mocks.captureMessage ??= vi.fn<VitestLooseMock>()
  return mocks
})

vi.mock<typeof import('@sentry/node')>(import('@sentry/node'), () => ({
  ...sentryMocks,
  default: sentryMocks,
}))

const captureMessage = sentryMocks.captureMessage

const ids = { classifier: 'post-classifier', runId: 'run-1' }
const clientUnavailable = {
  kind: 'client-unavailable' as const,
  ...ids,
  error: 'StructuredDecisionError: A structured-decision API key is required.',
}
const runAge = {
  kind: 'run-age' as const,
  ...ids,
  oldestRunAgeMs: 93_600_000,
  thresholdMs: 86_400_000,
}
const requestAge = {
  kind: 'request-age' as const,
  classifier: 'post-classifier',
  requestId: 'request-1',
  oldestRequestAgeMs: 93_600_000,
  thresholdMs: 86_400_000,
}

// lastAgeReportedAt is module-level throttle state -- vi.resetModules() plus a dynamic import per
// test gives each test a fresh, unthrottled instance.
describe('recordClassifierRunAlarm', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    captureMessage.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    [clientUnavailable, { error: clientUnavailable.error, runId: 'run-1' }],
    [
      { kind: 'sweep-bound-exceeded' as const, ...ids, sweepEnqueueCount: 10 },
      { runId: 'run-1', sweepEnqueueCount: 10 },
    ],
    [runAge, { runId: 'run-1', oldestRunAgeMs: 93_600_000, thresholdMs: 86_400_000 }],
    [
      requestAge,
      { requestId: 'request-1', oldestRequestAgeMs: 93_600_000, thresholdMs: 86_400_000 },
    ],
  ])(
    'groups %o by kind and classifier with run ids kept out of the fingerprint',
    async (context, extra) => {
      const { recordClassifierRunAlarm } = await import('./classifier-run-alarm.mts')
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        recordClassifierRunAlarm(context)

        expect(consoleWarn).not.toHaveBeenCalled()
        expect(captureMessage).toHaveBeenCalledExactlyOnceWith('classifier_run_alarm', {
          level: 'error',
          fingerprint: ['classifier_run_alarm', context.kind, 'post-classifier'],
          tags: {
            reason: 'classifier_run_alarm',
            alarm_kind: context.kind,
            classifier: 'post-classifier',
          },
          extra: { classifier: 'post-classifier', ...extra },
        })
      } finally {
        consoleWarn.mockRestore()
      }
    },
  )

  it('logs to console in development and CI but not in production without CI', async () => {
    const { recordClassifierRunAlarm } = await import('./classifier-run-alarm.mts')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      vi.stubEnv('NODE_ENV', 'development')
      recordClassifierRunAlarm(clientUnavailable)
      expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(
        '[classifier-runs] run alarm',
        clientUnavailable,
      )

      consoleWarn.mockClear()
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('CI', '')
      recordClassifierRunAlarm(clientUnavailable)
      expect(consoleWarn).not.toHaveBeenCalled()

      vi.stubEnv('CI', 'true')
      recordClassifierRunAlarm(clientUnavailable)
      expect(consoleWarn).toHaveBeenCalledOnce()
    } finally {
      consoleWarn.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it('throttles each repeating age alarm to once per hour and nothing else', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      const { recordClassifierRunAlarm } = await import('./classifier-run-alarm.mts')

      recordClassifierRunAlarm(runAge)
      recordClassifierRunAlarm(runAge)
      expect(captureMessage).toHaveBeenCalledOnce()

      recordClassifierRunAlarm(requestAge)
      recordClassifierRunAlarm(requestAge)
      expect(captureMessage).toHaveBeenCalledTimes(2)

      recordClassifierRunAlarm(clientUnavailable)
      recordClassifierRunAlarm(clientUnavailable)
      expect(captureMessage).toHaveBeenCalledTimes(4)

      vi.advanceTimersByTime(60 * 60 * 1000)
      recordClassifierRunAlarm(runAge)
      expect(captureMessage).toHaveBeenCalledTimes(5)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
