import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Streams consent records for the given user (GDPR PII). */
export function streamConsents(userId: string) {
  return createAsyncGeneratorFromCursor<Record<string, unknown>>(sql`/* streamConsents */
    SELECT
      id,
      consent_type,
      version,
      uuid_extract_timestamp(id) AS created_at,
      revoked_at
    FROM user_consents
    WHERE user_id = ${userId}
    ORDER BY id ASC
  `)
}

/** Streams referral attribution rows for the given user. */
export function streamReferralAttributions(userId: string) {
  return createAsyncGeneratorFromCursor<
    Record<string, unknown>
  >(sql`/* streamReferralAttributions */
    SELECT
      id,
      session_id,
      referrer_id,
      landing_url,
      uuid_extract_timestamp(id) AS created_at
    FROM session_referral_attributions
    WHERE user_id = ${userId}
    ORDER BY id ASC
  `)
}
