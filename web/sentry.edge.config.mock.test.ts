import * as Sentry from '@sentry/nextjs'
import { describe, expect, it, vi } from 'vitest'

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

import './sentry.edge.config'

function getInitOptions(): Record<string, unknown> {
  const options = sentryInitCall.options
  if (!options) throw new Error('Expected Sentry.init to be called')
  return options as Record<string, unknown>
}

describe('edge Sentry config', () => {
  it('registers request metadata scrubbing', async () => {
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
