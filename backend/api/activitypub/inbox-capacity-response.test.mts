import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@jongleberry/api-server'
import { ACTIVITYPUB_INBOX_STORAGE_POLICY } from '@modules/activitypub-inbox-storage-policy'
import {
  rejectActivityPubInboxCapacity,
  rejectRateLimitedActivityPubDelivery,
} from './inbox-capacity-response.mts'

describe('ActivityPub inbox rejection responses', () => {
  it('logs the bounded-capacity snapshot and returns a retryable 503', () => {
    const { ctx, set, throwResponse } = responseContext()
    const warn = vi.spyOn(console, 'warn').mockReturnValue(undefined)

    expect(() =>
      rejectActivityPubInboxCapacity(ctx, {
        snapshot: { unverifiedRows: 10_000, unverifiedRawBodyBytes: 256 * 1024 * 1024 },
        attemptedRows: 1,
        attemptedRawBodyBytes: 42,
        limitingDimensions: ['rows', 'raw-body-bytes'],
      }),
    ).toThrow('Service Unavailable')

    expect(set).toHaveBeenCalledWith(
      'Retry-After',
      String(ACTIVITYPUB_INBOX_STORAGE_POLICY.capacityRetryAfterSeconds),
    )
    expect(throwResponse).toHaveBeenCalledWith(503, 'Service Unavailable')
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toEqual({
      event: 'activitypub_inbox_unverified_capacity_rejected',
      unverifiedRows: 10_000,
      unverifiedRawBodyBytes: 256 * 1024 * 1024,
      attemptedRows: 1,
      attemptedRawBodyBytes: 42,
      limitingDimensions: ['rows', 'raw-body-bytes'],
    })

    warn.mockRestore()
  })

  it('returns a retryable 429 for sender rate limits', () => {
    const { ctx, set, throwResponse } = responseContext()

    expect(() => rejectRateLimitedActivityPubDelivery(ctx, 60)).toThrow('Too Many Requests')

    expect(set).toHaveBeenCalledWith('Retry-After', '60')
    expect(throwResponse).toHaveBeenCalledWith(429, 'Too Many Requests')
  })
})

function responseContext() {
  const set = vi.fn<(name: string, value: string) => void>()
  const throwResponse = vi.fn<(status: number, message: string) => never>((status, message) => {
    throw Object.assign(new Error(message), { status })
  })
  return { ctx: { set, throw: throwResponse } as unknown as Context, set, throwResponse }
}
