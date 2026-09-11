import * as Sentry from '@sentry/nextjs'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/error'
import onError from '../on-error'

type SonnerModule = typeof import('sonner')
type SentryModule = typeof import('@sentry/nextjs')

vi.mock(import('sonner'), () => {
  const toastMock = Object.assign(vi.fn<SonnerModule['toast']>(), {
    error: vi.fn<SonnerModule['toast']['error']>(),
    success: vi.fn<SonnerModule['toast']['success']>(),
  }) as SonnerModule['toast']
  return { toast: toastMock }
})

vi.mock(import('@sentry/nextjs'), () => ({
  captureException: vi.fn<SentryModule['captureException']>(),
}))

const mockedToast = vi.mocked(toast)
const mockedCapture = vi.mocked(Sentry.captureException)

describe('onError', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('toasts the ApiError message and skips Sentry for 4xx', () => {
    const err = new ApiError('Validation failed', 400)
    const msg = onError(err, { fallback: 'Failed to save' })
    expect(msg).toBe('Validation failed')
    expect(mockedToast.error).toHaveBeenCalledWith('Validation failed')
    expect(mockedCapture).not.toHaveBeenCalled()
  })

  it('toasts and captures to Sentry for 5xx ApiError', () => {
    const err = new ApiError('Boom', 500)
    onError(err, { fallback: 'Failed', tags: { form: 'post' }, extra: { id: '1' } })
    expect(mockedToast.error).toHaveBeenCalledWith('Boom')
    expect(mockedCapture).toHaveBeenCalledTimes(1)
    expect(mockedCapture).toHaveBeenCalledWith(err, {
      tags: { form: 'post' },
      extra: { id: '1' },
    })
  })

  it('uses rate-limit message for 429 and does not capture', () => {
    const err = new ApiError('Too many', 429, { retry_after: 30 })
    onError(err, { fallback: 'Failed' })
    expect(mockedToast.error).toHaveBeenCalledWith(
      'Too many requests. Please wait 30 seconds and try again.',
    )
    expect(mockedCapture).not.toHaveBeenCalled()
  })

  it('uses fallback for non-ApiError and captures to Sentry', () => {
    const err = new Error('network down')
    onError(err, { fallback: 'Failed to load' })
    expect(mockedToast.error).toHaveBeenCalledWith('Failed to load')
    expect(mockedCapture).toHaveBeenCalledWith(err, {})
  })

  it('normalizes non-Error values into Error before capture', () => {
    onError(null, { fallback: 'Something went wrong' })
    expect(mockedToast.error).toHaveBeenCalledWith('Something went wrong')
    const [captured, hint] = mockedCapture.mock.calls[0]!
    expect(captured).toBeInstanceOf(Error)
    // oxlint-disable-next-line no-mistakes/test-no-error-message-matching -- fallback is the synthesized Sentry Error title contract for non-Error input
    expect((captured as Error).message).toBe('Something went wrong')
    expect(hint).toEqual({ extra: { originalValue: null } })
  })

  it('preserves caller extras when normalizing non-Error values', () => {
    onError('a plain string', { fallback: 'Unknown failure', extra: { source: 'feature-x' } })
    const [captured, hint] = mockedCapture.mock.calls[0]!
    expect(captured).toBeInstanceOf(Error)
    // oxlint-disable-next-line no-mistakes/test-no-error-message-matching -- fallback is the synthesized Sentry Error title contract for non-Error input
    expect((captured as Error).message).toBe('Unknown failure')
    expect(hint).toEqual({ extra: { source: 'feature-x', originalValue: 'a plain string' } })
  })

  it('omits tags/extra when not provided', () => {
    const err = new Error('boom')
    onError(err, { fallback: 'Failed' })
    expect(mockedCapture).toHaveBeenCalledWith(err, {})
  })

  it('honors skipSentry to suppress capture even for unexpected errors', () => {
    const err = new Error('Validation: hostname required')
    onError(err, { fallback: 'Hostname is required', skipSentry: true })
    expect(mockedToast.error).toHaveBeenCalledWith('Hostname is required')
    expect(mockedCapture).not.toHaveBeenCalled()
  })
})
