import { INBOX_RECOVERY_ENQUEUE_GRACE_MS } from '../queues/activitypub/config.mts'

// Same UUIDv7 timestamp layout as the production enqueue-grace check.
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function envelopeCreatedAtMs(deliveryId: string): number | null {
  if (!UUID_V7.test(deliveryId)) return null
  return Number.parseInt(deliveryId.slice(0, 8) + deliveryId.slice(9, 13), 16)
}

/** A clock at which this envelope is eligible for recovery replacement. */
export function activityPubInboxRecoveryClockPastEnqueueGrace(deliveryId: string): number {
  const createdAtMs = envelopeCreatedAtMs(deliveryId)
  if (createdAtMs === null) return Number.MAX_SAFE_INTEGER
  return createdAtMs + INBOX_RECOVERY_ENQUEUE_GRACE_MS
}
