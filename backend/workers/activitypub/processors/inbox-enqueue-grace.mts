import { INBOX_RECOVERY_ENQUEUE_GRACE_MS } from '@queues/activitypub/config'

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function activityPubInboxEnvelopeCreatedAtMs(deliveryId: string): number | null {
  if (!UUID_V7.test(deliveryId)) return null
  return Number.parseInt(deliveryId.slice(0, 8) + deliveryId.slice(9, 13), 16)
}

/** True while the HTTP handler may still be enqueuing this freshly inserted envelope. */
export function isInsideActivityPubInboxEnqueueGrace(deliveryId: string, nowMs: number): boolean {
  const createdAtMs = activityPubInboxEnvelopeCreatedAtMs(deliveryId)
  if (createdAtMs === null) return false
  return nowMs - createdAtMs < INBOX_RECOVERY_ENQUEUE_GRACE_MS
}
