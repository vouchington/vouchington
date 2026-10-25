import { describe, expect, it, vi } from 'vitest'

vi.mock<typeof import('@sentry/aws-serverless')>(import('@sentry/aws-serverless'), () => ({
  init: vi.fn<VitestLooseMock>(),
  captureException: vi.fn<VitestLooseMock>(),
}))

const Sentry = await import('@sentry/aws-serverless')

describe('image-resize sentry-init', () => {
  it('initializes Sentry tagged for the image-resize Lambda on import', async () => {
    await import('../image-resize/sentry-init.mts')
    console.log(
      'CALLS',
      Sentry.init.mock.calls.length,
      Object.keys(Sentry),
      (await import('@lambdas/shared/sentry')).initSentry.toString().slice(0, 80),
    )

    expect(Sentry.init).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ initialScope: { tags: { lambda: 'image-resize' } } }),
    )
  })
})
