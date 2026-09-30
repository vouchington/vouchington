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

const ids = { postId: 'post-1', applicationId: 'application-1' }
const clientUnavailable = {
  kind: 'client-unavailable' as const,
  ...ids,
  error: 'StructuredDecisionError: A structured-decision API key is required.',
}
const receiptAge = {
  kind: 'receipt-age' as const,
  ...ids,
  oldestReceiptAgeMs: 93_600_000,
  thresholdMs: 86_400_000,
}

// lastReceiptAgeReportedAt is module-level throttle state -- vi.resetModules() plus a dynamic
// import per test gives each test a fresh, unthrottled instance.
describe('recordPostClassifierReceiptAlarm', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    captureMessage.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    [clientUnavailable, { error: clientUnavailable.error, ...ids }],
    [
      {
        kind: 'sweep-bound-exceeded' as const,
        ...ids,
        sweepEnqueueCount: 10,
        terminal: false,
      },
      { ...ids, sweepEnqueueCount: 10, terminal: false },
    ],
    [receiptAge, { ...ids, oldestReceiptAgeMs: 93_600_000, thresholdMs: 86_400_000 }],
  ])('groups %o by kind with receipt ids kept out of the fingerprint', async (context, extra) => {
    const { recordPostClassifierReceiptAlarm } = await import('./post-classifier-receipt-alarm.mts')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      recordPostClassifierReceiptAlarm(context)

      expect(consoleWarn).not.toHaveBeenCalled()
      expect(captureMessage).toHaveBeenCalledExactlyOnceWith('post_classifier_receipt_alarm', {
        level: 'error',
        fingerprint: ['post_classifier_receipt_alarm', context.kind],
        tags: { reason: 'post_classifier_receipt_alarm', alarm_kind: context.kind },
        extra,
      })
    } finally {
      consoleWarn.mockRestore()
    }
  })

  it('logs to console in development mode', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { recordPostClassifierReceiptAlarm } =
        await import('./post-classifier-receipt-alarm.mts')
      recordPostClassifierReceiptAlarm(clientUnavailable)

      expect(consoleWarn).toHaveBeenCalledWith('[post-classifier] receipt alarm', clientUnavailable)
    } finally {
      consoleWarn.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it('does not log to console in production without CI', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CI', '')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { recordPostClassifierReceiptAlarm } =
        await import('./post-classifier-receipt-alarm.mts')
      recordPostClassifierReceiptAlarm(clientUnavailable)

      expect(consoleWarn).not.toHaveBeenCalled()
    } finally {
      consoleWarn.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it('logs to console in CI even outside development mode', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CI', 'true')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { recordPostClassifierReceiptAlarm } =
        await import('./post-classifier-receipt-alarm.mts')
      recordPostClassifierReceiptAlarm(clientUnavailable)

      expect(consoleWarn).toHaveBeenCalledOnce()
    } finally {
      consoleWarn.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it('throttles only the repeating age alarm to once per hour', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      const { recordPostClassifierReceiptAlarm } =
        await import('./post-classifier-receipt-alarm.mts')

      recordPostClassifierReceiptAlarm(receiptAge)
      recordPostClassifierReceiptAlarm(receiptAge)
      expect(captureMessage).toHaveBeenCalledOnce()

      recordPostClassifierReceiptAlarm(clientUnavailable)
      recordPostClassifierReceiptAlarm(clientUnavailable)
      expect(captureMessage).toHaveBeenCalledTimes(3)

      vi.advanceTimersByTime(60 * 60 * 1000)
      recordPostClassifierReceiptAlarm(receiptAge)
      expect(captureMessage).toHaveBeenCalledTimes(4)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
