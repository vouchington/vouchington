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

vi.mock<typeof import('@sentry/nextjs')>(import('@sentry/nextjs'), () => ({ init: mockSentryInit }))

import './sentry.client.config'

function getInitOptions(): Record<string, unknown> {
  const options = sentryInitCall.options
  if (!options) throw new Error('Expected Sentry.init to be called')
  return options as Record<string, unknown>
}

describe('client Sentry config', () => {
  afterEach(() => {
    clearRuntimePublicConfigForTest()
  })

  it('registers request metadata scrubbing', async () => {
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
    expect(options.beforeSendTransaction).toBeTypeOf('function')
  })
})
