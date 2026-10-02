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
  errorName: 'StructuredDecisionError',
}
const runAge = {
  kind: 'run-age' as const,
  ...ids,
  oldestRunAgeMs: 100_800_000,
  thresholdMs: 93_600_000,
  incompleteRuns: 3,
}
const requestAge = {
  kind: 'request-age' as const,
  classifier: 'post-classifier',
  requestId: 'request-1',
  oldestRequestAgeMs: 100_800_000,
  thresholdMs: 93_600_000,
  pendingRequests: 2,
}
const subjectUnrequested = {
  kind: 'subject-unrequested' as const,
  classifier: 'story-clustering-classifier',
  unrequestedSubjects: 4,
  oldestUnrequestedAgeMs: 7_200_000,
  graceMs: 3_600_000,
}
const terminalFailures = {
  kind: 'terminal-failures' as const,
  classifier: 'post-classifier',
  windowMs: 86_400_000,
  thresholdCount: 10,
  failedTotal: 12,
  failedByKind: { 'client-unavailable': 2, 'provider-error': 10 },
  completed: 5,
}
const sweepBound = { kind: 'sweep-bound-exceeded' as const, ...ids, sweepEnqueueCount: 10 }
const providerRejected = {
  kind: 'provider-rejected' as const,
  ...ids,
  status: 401,
  providerCode: 'invalid_api_key',
  errorType: 'invalid_request_error',
}

// The periodic-alarm throttle is module-level state -- vi.resetModules() plus a dynamic import per
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
    [clientUnavailable, { runId: 'run-1', errorName: 'StructuredDecisionError' }],
    [
      providerRejected,
      {
        runId: 'run-1',
        status: 401,
        providerCode: 'invalid_api_key',
        errorType: 'invalid_request_error',
      },
    ],
    [sweepBound, { runId: 'run-1', sweepEnqueueCount: 10 }],
    [
      runAge,
      { runId: 'run-1', oldestRunAgeMs: 100_800_000, thresholdMs: 93_600_000, incompleteRuns: 3 },
    ],
    [
      requestAge,
      {
        requestId: 'request-1',
        oldestRequestAgeMs: 100_800_000,
        thresholdMs: 93_600_000,
        pendingRequests: 2,
      },
    ],
    [
      subjectUnrequested,
      { unrequestedSubjects: 4, oldestUnrequestedAgeMs: 7_200_000, graceMs: 3_600_000 },
    ],
    [
      terminalFailures,
      {
        windowMs: 86_400_000,
        thresholdCount: 10,
        failedTotal: 12,
        failedByKind: { 'client-unavailable': 2, 'provider-error': 10 },
        completed: 5,
      },
    ],
  ])(
    'groups %o by kind and classifier with ids and counts kept out of the fingerprint',
    async (context, extra) => {
      const { recordClassifierRunAlarm } = await import('./classifier-run-alarm.mts')
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        recordClassifierRunAlarm(context)

        expect(consoleWarn).not.toHaveBeenCalled()
        expect(captureMessage).toHaveBeenCalledExactlyOnceWith('classifier_run_alarm', {
          level: 'error',
          fingerprint: ['classifier_run_alarm', context.kind, context.classifier],
          tags: {
            reason: 'classifier_run_alarm',
            alarm_kind: context.kind,
            classifier: context.classifier,
          },
          extra: { classifier: context.classifier, ...extra },
        })
      } finally {
        consoleWarn.mockRestore()
      }
    },
  )

  it('drops any field outside its kind, so no prompt, content, key or token can ride along', async () => {
    const { recordClassifierRunAlarm } = await import('./classifier-run-alarm.mts')
    const smuggled = {
      prompt: 'private prompt text',
      content: 'private post body',
      apiKey: 'sk-live-secret',
      token: 'raw-token',
      error: 'the provider said: key sk-live-secret is invalid',
    }

    for (const context of [clientUnavailable, runAge, subjectUnrequested, terminalFailures]) {
      captureMessage.mockClear()
      recordClassifierRunAlarm({ ...context, ...smuggled })

      const [, hint] = captureMessage.mock.calls[0]!
      expect(Object.keys(hint.extra)).not.toEqual(expect.arrayContaining(Object.keys(smuggled)))
      expect(JSON.stringify(hint)).not.toMatch(/private|sk-live|raw-token/)
    }
  })

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

  it('throttles each repeating alarm to once per hour per kind and classifier', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      const { recordClassifierRunAlarm } = await import('./classifier-run-alarm.mts')

      for (const periodic of [runAge, requestAge, subjectUnrequested, terminalFailures]) {
        captureMessage.mockClear()
        recordClassifierRunAlarm(periodic)
        recordClassifierRunAlarm(periodic)
        expect(captureMessage).toHaveBeenCalledOnce()
      }

      captureMessage.mockClear()
      recordClassifierRunAlarm({ ...runAge, classifier: 'tagging-classifier' })
      expect(captureMessage).toHaveBeenCalledOnce()

      vi.advanceTimersByTime(60 * 60 * 1000)
      captureMessage.mockClear()
      recordClassifierRunAlarm(runAge)
      expect(captureMessage).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('reports every at-once alarm each time it happens', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const { recordClassifierRunAlarm } = await import('./classifier-run-alarm.mts')

      for (const once of [clientUnavailable, providerRejected, sweepBound]) {
        captureMessage.mockClear()
        recordClassifierRunAlarm(once)
        recordClassifierRunAlarm(once)
        expect(captureMessage).toHaveBeenCalledTimes(2)
      }
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
