import sql from 'sql-template-strings'

export const MEDIA_DELIVERY_CLAIM_TIMEOUT_MS = 5 * 60 * 1000
export const MEDIA_DELIVERY_MAX_ATTEMPTS = 5
export const MEDIA_DELIVERY_RETRY_MS = 60 * 1000

/** Shared by discovery and the atomic claim; expired exhausted claims require terminal repair. */
export function mediaDeliveryClaimable(now: Date | string) {
  return sql`attempt_count < ${MEDIA_DELIVERY_MAX_ATTEMPTS}
    AND ((lease_token IS NULL AND available_at <= GREATEST(${now}::timestamptz, clock_timestamp()))
      OR (lease_token IS NOT NULL AND lease_expires_at <= GREATEST(${now}::timestamptz, clock_timestamp())))`
}
