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

const creditBalance = {
  kind: 'credit-balance-too-low' as const,
  service: 'report-judgement',
  provider: 'anthropic' as const,
  status: 400,
}

// The throttle is module-level state -- vi.resetModules() plus a dynamic import per test gives each
// test a fresh, unthrottled instance.
describe('recordModelProviderAlarm', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    captureMessage.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('groups every service into one issue per kind and provider, keeping the service in extra', async () => {
    const { recordModelProviderAlarm } = await import('./model-provider-alarm.mts')

    recordModelProviderAlarm(creditBalance)

    expect(captureMessage).toHaveBeenCalledExactlyOnceWith('model_provider_alarm', {
      level: 'error',
      fingerprint: ['model_provider_alarm', 'credit-balance-too-low', 'anthropic'],
      tags: {
        reason: 'model_provider_alarm',
        alarm_kind: 'credit-balance-too-low',
        provider: 'anthropic',
      },
      extra: { service: 'report-judgement', status: 400 },
    })
  })

  it('reports once an hour per kind and provider outside tests, and logs in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { recordModelProviderAlarm } = await import('./model-provider-alarm.mts')
    const clientUnavailable = {
      kind: 'client-unavailable' as const,
      service: 'story-post',
      provider: 'anthropic' as const,
    }

    recordModelProviderAlarm(creditBalance)
    recordModelProviderAlarm({ ...creditBalance, service: 'dispute-resolution' })
    recordModelProviderAlarm(clientUnavailable)
    vi.advanceTimersByTime(60 * 60 * 1000)
    recordModelProviderAlarm(creditBalance)

    expect(captureMessage).toHaveBeenCalledTimes(3)
    expect(consoleWarn).toHaveBeenCalledTimes(4)
    consoleWarn.mockRestore()
  })
})
