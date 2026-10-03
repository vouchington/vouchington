import * as Sentry from '@sentry/nextjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

import './instrumentation-client'

describe('client Sentry instrumentation', () => {
  afterEach(() => {
    localStorage.setItem('cookie-consent', 'essential')
    window.dispatchEvent(new Event('cookie-consent-changed'))
    clearRuntimePublicConfigForTest()
  })

  it('waits for consent then registers request metadata scrubbing', async () => {
    expect(mockSentryInit).not.toHaveBeenCalled()
    window.dispatchEvent(new Event(RUNTIME_PUBLIC_CONFIG_READY_EVENT))
    expect(mockSentryInit).not.toHaveBeenCalled()
    localStorage.setItem('cookie-consent', 'all')
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
