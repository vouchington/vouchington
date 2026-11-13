import { getCopyrightNoticesWorkLimit } from '../services/copyright-notices/work-limits.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUser } from './index.mts'
import { createRetentionParsedEmail } from './services/copyright-notices/retention-parsed-email.mts'
import { rejectCopyrightEmailIntake } from '../services/copyright-notices/email-rejection.mts'
import { failTestCopyrightDeliveryIntent } from './data-stores/psql/copyright-notice-reads.mts'

/** All prior receipt, reply, lease and terminal facts commit normally before the replay subject. */
export async function createOwnedCopyrightReplyFixture(
  state: 'pending' | 'failed' | 'sent' | 'bounced' = 'failed',
) {
  const moderator = await createTestUser({ extraRoles: ['moderator'] })
  const intake = await createRetentionParsedEmail('owned-replay-source')
  const rejected = await rejectCopyrightEmailIntake({
    currentUser: moderator,
    intakeId: intake.id,
    recommendationId: null,
    manualFallbackReason: 'The extraction agent was unavailable.',
    rationale: 'The message lacks required declarations.',
    responseKind: 'needs_information',
    responseMessage: 'Please identify the work and material.',
  })
  const intentId = rejected.responseId
  if (!intentId) throw new Error('Owned declined reply was not created')
  if (state !== 'pending') {
    await seedOwnedCopyrightReplyClaim(intentId)
    if (state === 'failed') await failTestCopyrightDeliveryIntent(intentId)
    else {
      await using transaction = await beginTransaction()
      await transaction(sql`/* createOwnedCopyrightReplyFixture:sent */
        UPDATE copyright_notice_delivery_work_items SET sent_at = clock_timestamp(),
          delivery_attempted_at = clock_timestamp(), amazon_ses_message_id = ${`ses-${crypto.randomUUID()}`},
          leased_at = NULL, available_at = NULL WHERE id = ${intentId} AND state = 'claimed'`)
      if (state === 'bounced')
        await transaction(sql`/* createOwnedCopyrightReplyFixture:bounced */
        UPDATE copyright_notice_delivery_work_items SET bounced_at = clock_timestamp() WHERE id = ${intentId} AND state = 'sent'`)
      await transaction.commit()
    }
  }
  return { intakeId: intake.id, intentId }
}

export async function seedOwnedCopyrightReplyClaim(intentId: string) {
  await using query = await beginTransaction()
  const { rowCount } = await query(sql`/* seedOwnedCopyrightReplyClaim */
    UPDATE copyright_notice_delivery_work_items SET lease_token = uuidv7(),
      attempt_count = attempt_count + 1, delivery_attempted_at = CURRENT_TIMESTAMP,
      leased_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + ${getCopyrightNoticesWorkLimit('delivery_lease_minutes')} * INTERVAL '1 minute', available_at = clock_timestamp()
    WHERE id = ${intentId} AND state = 'pending'`)
  if (rowCount !== 1) throw new Error('Owned reply was not pending')
  await query.commit()
}

/** Canonical completed replay is a prerequisite for independent resend or failed-again subjects. */
export async function seedOwnedCopyrightReplyReplay(intentId: string, actorId: string) {
  await using query = await beginTransaction()
  await query(sql`/* seedOwnedCopyrightReplyReplay:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
      copyright_notice_delivery_work_item_id) VALUES (NULL, 'delivery_intent_replayed', ${actorId}, ${intentId})`)
  const { rowCount } = await query(sql`/* seedOwnedCopyrightReplyReplay */
    UPDATE copyright_notice_delivery_work_items SET leased_at = NULL, failed_at = NULL,
      available_at = clock_timestamp(), attempt_count = 0, failure_ciphertext = NULL
    WHERE id = ${intentId} AND state = 'failed'`)
  if (rowCount !== 1) throw new Error('Owned reply was not failed')
  await query.commit()
}
