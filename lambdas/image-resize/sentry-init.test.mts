import { describe, it, expect } from 'vitest'
import type { InitSentryOptions } from '@lambdas/shared/sentry'
import { LambdaError } from './errors.mts'

import { imageResizeSentryOptions } from './sentry-init.mts'

type BeforeSend = NonNullable<InitSentryOptions['beforeSend']>

// Minimal event and hint shapes that satisfy Sentry's beforeSend signature.
const MOCK_EVENT = { level: 'error' } as Parameters<BeforeSend>[0]

function makeHint(error: unknown): Parameters<BeforeSend>[1] {
  return { originalException: error } as Parameters<BeforeSend>[1]
}

describe('image-resize sentry-init beforeSend filter', () => {
  const beforeSend = imageResizeSentryOptions.beforeSend as BeforeSend

  it('filters out 400 errors (RequestParseError)', () => {
    const err = new LambdaError('RequestParseError', 'bad request', 400)
    const result = beforeSend?.(MOCK_EVENT, makeHint(err))
    expect(result).toBeNull()
  })

  it('filters out 404 errors (S3OperationError cache miss)', () => {
    const err = new LambdaError('S3OperationError', 'not found', 404)
    const result = beforeSend?.(MOCK_EVENT, makeHint(err))
    expect(result).toBeNull()
  })

  it('does not filter 500 errors (internal errors)', () => {
    const err = new LambdaError('S3OperationError', 'internal', 500)
    const result = beforeSend?.(MOCK_EVENT, makeHint(err))
    expect(result).toBe(MOCK_EVENT)
  })

  it('does not filter plain Error (no statusCode)', () => {
    const err = new Error('unexpected error')
    const result = beforeSend?.(MOCK_EVENT, makeHint(err))
    expect(result).toBe(MOCK_EVENT)
  })

  it('does not filter null exception', () => {
    const result = beforeSend?.(MOCK_EVENT, makeHint(null))
    expect(result).toBe(MOCK_EVENT)
  })
})
