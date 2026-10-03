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

const breachContext = {
  agentJobName: 'report-judgement',
  dailyTotalMicrounits: 12_000_000,
  dailyCapMicrounits: 10_000_000,
  reason: 'cap_exceeded' as const,
}

// lastSpendCapBreachReportedAt is module-level throttle state -- vi.resetModules() plus a dynamic
// import per test gives each test a fresh, unthrottled instance.
describe('recordSpendCapBreach', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    captureMessage.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('captures a Sentry message with the breach context and skips console output in test mode', async () => {
    const { recordSpendCapBreach } = await import('./spend-cap-breach.mts')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      recordSpendCapBreach(breachContext)

      expect(consoleWarn).not.toHaveBeenCalled()
      expect(captureMessage).toHaveBeenCalledOnce()
      expect(captureMessage).toHaveBeenCalledWith('ai_spend_cap_breach', {
        level: 'warning',
        tags: {
          reason: 'ai_spend_cap_breach',
          agent_job_name: 'report-judgement',
          breach_reason: 'cap_exceeded',
        },
        extra: { dailyTotalMicrounits: 12_000_000, dailyCapMicrounits: 10_000_000 },
      })
    } finally {
      consoleWarn.mockRestore()
    }
  })

  it('logs to console in development mode', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { recordSpendCapBreach } = await import('./spend-cap-breach.mts')
      recordSpendCapBreach(breachContext)

      expect(consoleWarn).toHaveBeenCalledWith(
        '[ai-usage] daily AI spend cap breached',
        breachContext,
      )
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
      const { recordSpendCapBreach } = await import('./spend-cap-breach.mts')
      recordSpendCapBreach(breachContext)

      expect(consoleWarn).toHaveBeenCalledWith(
        '[ai-usage] daily AI spend cap breached',
        breachContext,
      )
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
      const { recordSpendCapBreach } = await import('./spend-cap-breach.mts')
      recordSpendCapBreach(breachContext)

      expect(consoleWarn).not.toHaveBeenCalled()
    } finally {
      consoleWarn.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it('throttles repeated Sentry captures within the 60s window, then allows a new one once it elapses', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      const { recordSpendCapBreach } = await import('./spend-cap-breach.mts')

      recordSpendCapBreach(breachContext)
      recordSpendCapBreach(breachContext)
      expect(captureMessage).toHaveBeenCalledOnce()

      vi.advanceTimersByTime(60_000)
      recordSpendCapBreach(breachContext)

      expect(captureMessage).toHaveBeenCalledTimes(2)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
