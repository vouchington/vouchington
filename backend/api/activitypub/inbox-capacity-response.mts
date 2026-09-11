import type { Context } from '@jongleberry/api-server'
import { ACTIVITYPUB_INBOX_STORAGE_POLICY } from '@modules/activitypub-inbox-storage-policy'
import type { ActivityPubInboxCapacityExceeded } from '@services/ap-inbox-activities'

export function rejectActivityPubInboxCapacity(
  ctx: Context,
  capacity: ActivityPubInboxCapacityExceeded,
): never {
  console.warn(
    JSON.stringify({
      event: 'activitypub_inbox_unverified_capacity_rejected',
      ...capacity.snapshot,
      attemptedRows: capacity.attemptedRows,
      attemptedRawBodyBytes: capacity.attemptedRawBodyBytes,
      limitingDimensions: capacity.limitingDimensions,
    }),
  )
  ctx.set('Retry-After', String(ACTIVITYPUB_INBOX_STORAGE_POLICY.capacityRetryAfterSeconds))
  ctx.throw(503, 'Service Unavailable')
}

export function rejectRateLimitedActivityPubDelivery(
  ctx: Context,
  retryAfterSeconds: number,
): never {
  ctx.set('Retry-After', String(retryAfterSeconds))
  ctx.throw(429, 'Too Many Requests')
}
