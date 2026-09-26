import { describe, it, expect, vi } from 'vitest'

vi.mock<typeof import('@sentry/aws-serverless')>(import('@sentry/aws-serverless'), () => ({
  init: vi.fn<VitestLooseMock>(),
  captureException: vi.fn<VitestLooseMock>(),
}))

const Sentry = await import('@sentry/aws-serverless')
const { initSentry, scrubSentrySpan } = await import('./sentry.mts')

describe('initSentry URL scrubbing wiring', () => {
  it('wires scrubSentrySpan as beforeSendSpan', () => {
    process.env.NODE_ENV = 'test'
    initSentry({ lambdaName: 'test-lambda' })

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ beforeSendSpan: scrubSentrySpan }),
    )
  })
})
