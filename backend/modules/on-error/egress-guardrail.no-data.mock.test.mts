import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { recordOffAllowlistEgress } from './egress-guardrail.mts'

describe('recordOffAllowlistEgress', () => {
  beforeEach(() => {
    captureMessage.mockClear()
  })

  it('captures a warning-level Sentry message naming the off-allowlist host', () => {
    recordOffAllowlistEgress('api.stripe.com', { path: '/v1/charges', method: 'POST' })

    expect(captureMessage).toHaveBeenCalledOnce()
    expect(captureMessage).toHaveBeenCalledWith('off-allowlist API egress: api.stripe.com', {
      level: 'warning',
      tags: { egress_guardrail: 'off_allowlist', egress_host: 'api.stripe.com' },
      extra: { path: '/v1/charges', method: 'POST' },
    })
  })

  it('emits console.warn in development mode', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      recordOffAllowlistEgress('api.stripe.com', { path: '/v1/charges', method: 'POST' })
      expect(consoleWarn).toHaveBeenCalledWith(
        '[egress-guardrail] off-allowlist API egress',
        'api.stripe.com',
        { path: '/v1/charges', method: 'POST' },
      )
    } finally {
      consoleWarn.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
