import * as Sentry from '@sentry/nextjs'
import { describe, expect, it, vi } from 'vitest'
import { reportClientError } from '../report-error'

vi.mock<typeof import('@sentry/nextjs')>(import('@sentry/nextjs'), () => ({
  captureException: vi.fn<(error: unknown) => void>(),
}))

describe('reportClientError', () => {
  it('forwards the error to Sentry', () => {
    const error = new Error('boom')
    reportClientError(error)
    expect(Sentry.captureException).toHaveBeenCalledWith(error)
  })
})
