import * as Sentry from '@sentry/nextjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RUNTIME_PUBLIC_CONFIG_READY_EVENT } from './lib/runtime-public-config'
import {
  clearRuntimePublicConfigForTest,
  setRuntimePublicConfigForTest,
} from './test-helpers/runtime-public-config'

const { sentryInitCall, mockSentryInit } = vi.hoisted(() => {
  const sentryInitCall: { options?: Parameters<typeof Sentry.init>[0] } = {}
  return {
    sentryInitCall,
    mockSentryInit: vi.fn<typeof Sentry.init>(options => {
      sentryInitCall.options = options
    }),
  }
})

vi.mock<typeof import('@sentry/nextjs')>(import('@sentry/nextjs'), () => ({
  init: mockSentryInit,
  close: vi.fn<typeof Sentry.close>(),
  captureRouterTransitionStart:
    vi.fn<(typeof import('@sentry/nextjs'))['captureRouterTransitionStart']>(),
}))

function getInitOptions(): Record<string, unknown> {
  const options = sentryInitCall.options
  if (!options) throw new Error('Expected Sentry.init to be called')
  return options as Record<string, unknown>
}

describe('client Sentry instrumentation', () => {
  const listeners: Array<{ type: string; listener: EventListenerOrEventListenerObject }> = []
  beforeEach(() => {
    vi.resetModules()
    const addEventListener = window.addEventListener.bind(window)
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
      listeners.push({ type, listener })
      addEventListener(type, listener, options)
    })
    localStorage.clear()
    mockSentryInit.mockClear()
    delete sentryInitCall.options
  })
  afterEach(() => {
    localStorage.setItem('cookie-consent', 'essential')
    window.dispatchEvent(new Event('cookie-consent-changed'))
    listeners.splice(0).forEach(({ type, listener }) => window.removeEventListener(type, listener))
    vi.restoreAllMocks()
    clearRuntimePublicConfigForTest()
  })

  it('does not initialize without consent', async () => {
    await import('./instrumentation-client')
    window.dispatchEvent(new Event(RUNTIME_PUBLIC_CONFIG_READY_EVENT))
    expect(mockSentryInit).not.toHaveBeenCalled()
  })

  it('registers request metadata scrubbing', async () => {
    localStorage.setItem('cookie-consent', 'all')
    await import('./instrumentation-client')
    window.dispatchEvent(new Event('cookie-consent-changed'))
    expect(sentryInitCall.options).toBeUndefined()
    setRuntimePublicConfigForTest({
      environment: 'production',
      sentryDsn: 'https://public@example.test/123',
    })
    window.dispatchEvent(new Event(RUNTIME_PUBLIC_CONFIG_READY_EVENT))

    const options = getInitOptions()
    const beforeSend = options.beforeSend as (
      event: Record<string, unknown>,
      hint: Record<string, unknown>,
    ) => unknown
    const result = await beforeSend(
      {
        request: {
          url: 'https://example.com/verify?token=secret',
          headers: { authorization: 'Bearer secret' },
        },
      },
      {},
    )

    expect(result).toEqual({
      request: {
        url: 'https://example.com/verify',
        headers: { authorization: '[Filtered]' },
      },
    })
    expect(options.beforeSendSpan).toBeTypeOf('function')
  })
})
