import sql from 'sql-template-strings'

export const MEDIA_DELIVERY_CLAIM_TIMEOUT_MS = 5 * 60 * 1000
export const MEDIA_DELIVERY_MAX_ATTEMPTS = 5
export const MEDIA_DELIVERY_RETRY_MS = 60 * 1000

/** Shared by discovery and the atomic claim; expired exhausted claims require terminal repair. */
export function mediaDeliveryClaimable(now: Date | string) {
  return sql`delivery_attempt_count < ${MEDIA_DELIVERY_MAX_ATTEMPTS}
    AND ((state = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ${now}::timestamptz))
      OR (state = 'claimed' AND claimed_at <= ${now}::timestamptz
        - ${MEDIA_DELIVERY_CLAIM_TIMEOUT_MS} * interval '1 millisecond'))`
}
