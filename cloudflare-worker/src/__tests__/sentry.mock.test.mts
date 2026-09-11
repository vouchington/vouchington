import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock<typeof import('@sentry/cloudflare')>(import('@sentry/cloudflare'), () => ({
  captureException: vi.fn<VitestLooseMock>(),
  withSentry: vi.fn<VitestLooseMock>((_opts: unknown, handler: unknown) => handler),
}))

const { captureException } = await import('@sentry/cloudflare')
const { captureWorkerException } = await import('../sentry.mts')

describe('captureWorkerException', () => {
  beforeEach(() => {
    vi.mocked(captureException).mockClear()
  })

  it('captures errors with status >= 500', () => {
    const err = Object.assign(new Error('server error'), { status: 500 })
    captureWorkerException(err, { routeTarget: 'backend', requestId: 'req-1' })
    expect(captureException).toHaveBeenCalledWith(err, {
      tags: { routeTarget: 'backend', requestId: 'req-1' },
    })
  })

  it('captures errors without a status property', () => {
    const err = new Error('unknown error')
    captureWorkerException(err)
    expect(captureException).toHaveBeenCalledWith(err, { tags: {} })
  })

  it('captures null thrown as error (does not crash)', () => {
    captureWorkerException(null)
    expect(captureException).toHaveBeenCalledWith(null, { tags: {} })
  })

  it('captures string thrown as error (does not crash)', () => {
    captureWorkerException('unexpected string')
    expect(captureException).toHaveBeenCalledWith('unexpected string', { tags: {} })
  })

  it('filters out errors with status < 500', () => {
    const err = Object.assign(new Error('not found'), { status: 404 })
    captureWorkerException(err, { routeTarget: 'backend' })
    expect(captureException).not.toHaveBeenCalled()
  })

  it('filters out errors with statusCode < 500', () => {
    const err = Object.assign(new Error('bad request'), { statusCode: 400 })
    captureWorkerException(err)
    expect(captureException).not.toHaveBeenCalled()
  })

  it('includes only non-null tags', () => {
    captureWorkerException(new Error('err'), {
      routeTarget: 'web',
      botTier: null,
      countryCode: null,
      requestId: 'abc',
    })
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { routeTarget: 'web', requestId: 'abc' },
    })
  })

  it('includes botTier and countryCode tags when present', () => {
    captureWorkerException(new Error('err'), { botTier: 'known', countryCode: 'US' })
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { botTier: 'known', countryCode: 'US' },
    })
  })
})
