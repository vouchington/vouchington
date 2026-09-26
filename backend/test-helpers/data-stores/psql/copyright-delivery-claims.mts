import { write } from '@data-stores/psql'
import assert from 'node:assert/strict'
import sql from 'sql-template-strings'

/**
 * Moves one owned delivery intent's claim past its 15-minute lease with `deliveryAttemptCount`
 * attempts. Delivery claims read `CURRENT_TIMESTAMP`, so tests age the lease instead of the clock.
 */
export async function expireTestCopyrightDeliveryIntentClaim(
  intentId: string,
  deliveryAttemptCount: number,
): Promise<void> {
  const { rowCount } = await write(sql`/* expireTestCopyrightDeliveryIntentClaim */
    UPDATE copyright_notice_delivery_intents
    SET claimed_at = CURRENT_TIMESTAMP - INTERVAL '16 minutes',
      delivery_attempt_count = ${deliveryAttemptCount}
    WHERE id = ${intentId} AND state = 'claimed'`)
  assert.equal(rowCount, 1, `delivery intent ${intentId} is not claimed`)
}

/** Moves one owned email intake response's claim past its 15-minute lease. */
export async function expireTestCopyrightEmailIntakeResponseClaim(
  responseId: string,
  deliveryAttemptCount: number,
): Promise<void> {
  const { rowCount } = await write(sql`/* expireTestCopyrightEmailIntakeResponseClaim */
    UPDATE copyright_notice_email_intake_responses
    SET claimed_at = CURRENT_TIMESTAMP - INTERVAL '16 minutes',
      delivery_attempt_count = ${deliveryAttemptCount}
    WHERE id = ${responseId} AND state = 'claimed'`)
  assert.equal(rowCount, 1, `email intake response ${responseId} is not claimed`)
}
