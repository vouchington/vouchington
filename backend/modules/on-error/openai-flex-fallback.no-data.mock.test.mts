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
  mocks.addBreadcrumb ??= vi.fn<VitestLooseMock>()
  return mocks
})

vi.mock<typeof import('@sentry/node')>(import('@sentry/node'), () => ({
  ...sentryMocks,
  default: sentryMocks,
}))

const { captureMessage, addBreadcrumb } = sentryMocks

const streamContext = {
  provider: 'openrouter' as const,
  model: 'openai/gpt-5.4-nano',
  trigger: 'stream_failed' as const,
}

// The Sentry throttle is module-level state -- vi.resetModules() plus a dynamic import per test
// gives each test a fresh, unthrottled instance.
describe('recordOpenAiFlexFallback', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    captureMessage.mockClear()
    addBreadcrumb.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('captures a tagged Sentry message and breadcrumb, with no console output in test mode', async () => {
    const { recordOpenAiFlexFallback } = await import('./openai-flex-fallback.mts')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      recordOpenAiFlexFallback(streamContext)

      expect(consoleWarn).not.toHaveBeenCalled()
      expect(addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'openai', level: 'warning', data: streamContext }),
      )
      expect(captureMessage).toHaveBeenCalledExactlyOnceWith('openai_flex_fallback', {
        level: 'warning',
        tags: {
          reason: 'openai_flex_fallback',
          provider: 'openrouter',
          trigger: 'stream_failed',
        },
        extra: { model: 'openai/gpt-5.4-nano' },
      })
    } finally {
      consoleWarn.mockRestore()
    }
  })

  it.each([
    ['development', ''],
    ['', ''],
    ['production', 'true'],
  ])('logs to console with NODE_ENV=%j and CI=%j', async (nodeEnv, ci) => {
    vi.stubEnv('NODE_ENV', nodeEnv)
    vi.stubEnv('CI', ci)
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { recordOpenAiFlexFallback } = await import('./openai-flex-fallback.mts')
      recordOpenAiFlexFallback(streamContext)

      expect(consoleWarn).toHaveBeenCalledWith(
        '[openai-utils] flex capacity unavailable, resending on the default tier',
        streamContext,
      )
    } finally {
      consoleWarn.mockRestore()
    }
  })

  it('does not log to console in production without CI', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CI', '')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { recordOpenAiFlexFallback } = await import('./openai-flex-fallback.mts')
      recordOpenAiFlexFallback(streamContext)

      expect(consoleWarn).not.toHaveBeenCalled()
    } finally {
      consoleWarn.mockRestore()
    }
  })

  it('throttles Sentry per provider and trigger but keeps every breadcrumb', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const { recordOpenAiFlexFallback } = await import('./openai-flex-fallback.mts')

    recordOpenAiFlexFallback(streamContext)
    recordOpenAiFlexFallback(streamContext)
    expect(captureMessage).toHaveBeenCalledOnce()
    expect(addBreadcrumb).toHaveBeenCalledTimes(2)

    recordOpenAiFlexFallback({ ...streamContext, trigger: 'http_429' })
    recordOpenAiFlexFallback({ ...streamContext, provider: 'openai' })
    expect(captureMessage).toHaveBeenCalledTimes(3)

    vi.advanceTimersByTime(60_000)
    recordOpenAiFlexFallback(streamContext)
    expect(captureMessage).toHaveBeenCalledTimes(4)
  })
})
