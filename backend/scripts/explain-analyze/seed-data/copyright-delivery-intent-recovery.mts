import { randomInt } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { seedUser } from '../run-support.mts'
import { seedUuidAtTimestamp } from './common.mts'
import { cleanupCopyrightRecoveryFixture } from './copyright-recovery-fixture-cleanup.mts'

const noticeCount = 2_500
const recoveryWindow = 600
const analyzeSql = `/* analyzeCopyrightDeliveryIntentRecovery */
  ANALYZE copyright_notice_delivery_work_items`

export async function seedCopyrightDeliveryIntentRecovery() {
  const timestamp = Date.UTC(1970, 0, 2) + randomInt(86_400_000)
  const ids = (offset: number) =>
    Array.from({ length: noticeCount }, (_, index) =>
      seedUuidAtTimestamp(timestamp + offset, index),
    )
  const notices = ids(0)
  const submissions = ids(1)
  const emails = Array.from({ length: noticeCount }, (_, index) =>
    seedUuidAtTimestamp(timestamp + 2, index * 2),
  )
  const inApp = Array.from({ length: noticeCount }, (_, index) =>
    seedUuidAtTimestamp(timestamp + 2, index * 2 + 1),
  )

  await using transaction = await beginTransaction()
  await transaction(
    `/* seedCopyrightDeliveryIntentRecovery:notices */
      INSERT INTO copyright_notices
        (id, jurisdiction, legal_basis, received_at, accepted_at, claimant_user_id,
          claimant_contact_ciphertext, work_description, policy_version)
      SELECT id, 'us_dmca', 'copyright', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $2::uuid,
        'v1:explain-contact', 'Scheduled delivery recovery capacity fixture', 'explain-v1'
      FROM unnest($1::uuid[]) AS notices(id)`,
    [notices, seedUser.id],
  )
  await transaction(
    `/* seedCopyrightDeliveryIntentRecovery:submissions */
      INSERT INTO copyright_notice_submissions
        (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext, submitted_by_id)
      SELECT id, notice_id, 'notice', CURRENT_TIMESTAMP, 'signed_in_form', 'v1:explain-notice', $3::uuid
      FROM unnest($1::uuid[], $2::uuid[]) AS filings(id, notice_id)`,
    [submissions, notices, seedUser.id],
  )
  await transaction(
    `/* seedCopyrightDeliveryIntentRecovery:work */
      WITH messages AS (
        INSERT INTO copyright_notice_correspondence_messages
          (copyright_notice_id, copyright_notice_submission_id, direction, composition_kind,
            correspondence_kind, body_ciphertext, sent_at)
        SELECT notice_id, submission_id, 'outbound', 'deterministic_template', 'receipt',
          'v1:explain-receipt', CURRENT_TIMESTAMP
        FROM unnest($1::uuid[], $2::uuid[]) AS filings(notice_id, submission_id)
        RETURNING id, copyright_notice_id
      ), work AS (
        SELECT intent.id, notice_id, submission_id, messages.id AS correspondence_id,
          channel, ordinal <= $6::integer AND slot < 2 AS recoverable,
          slot = 2 AS future, ordinal <= $6::integer AND slot IN (1, 3) AS claimed,
          slot = 4 AS failed
        FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[]) WITH ORDINALITY
          AS inputs(notice_id, submission_id, email_id, in_app_id, ordinal)
        JOIN messages ON messages.copyright_notice_id = inputs.notice_id
        CROSS JOIN LATERAL (VALUES
          (email_id, 'email'::copyright_notice_delivery_intent_channels),
          (in_app_id, 'in_app'::copyright_notice_delivery_intent_channels)
        ) AS intent(id, channel)
        CROSS JOIN LATERAL (SELECT (ordinal - 1) % 5 AS slot) AS mix
      ), inserted AS (
        INSERT INTO copyright_notice_delivery_work_items
          (id, copyright_notice_id, copyright_notice_submission_id,
            copyright_notice_correspondence_message_id, recipient_user_id, recipient_role,
            delivery_kind, channel, idempotency_key, available_at, leased_at, lease_expires_at,
            delivery_attempted_at, sent_at, failed_at, attempt_count)
        SELECT id, notice_id, CASE WHEN channel = 'email' THEN submission_id END,
          CASE WHEN channel = 'email' THEN correspondence_id END,
          CASE WHEN channel = 'in_app' THEN $5::uuid END, 'claimant',
          CASE WHEN channel = 'email' THEN 'claimant_receipt'::copyright_notice_delivery_kinds
            ELSE 'status_update'::copyright_notice_delivery_kinds END,
          channel, 'explain-delivery-recovery/' || id,
          CURRENT_TIMESTAMP + CASE WHEN future THEN interval '1 day' ELSE interval '-1 day' END,
          CASE WHEN claimed THEN CURRENT_TIMESTAMP - interval '1 hour' END,
          CASE WHEN claimed THEN CURRENT_TIMESTAMP
            + CASE WHEN recoverable THEN interval '-30 minutes' ELSE interval '1 day' END END,
          CASE WHEN claimed OR NOT (future OR recoverable) THEN CURRENT_TIMESTAMP - interval '1 hour' END,
          CASE WHEN NOT (claimed OR failed OR future OR recoverable) THEN CURRENT_TIMESTAMP END,
          CASE WHEN failed THEN CURRENT_TIMESTAMP END,
          CASE WHEN claimed AND recoverable THEN 5 WHEN claimed OR NOT (future OR recoverable) THEN 1
            ELSE 0 END
        FROM work
        RETURNING id, channel
      )
      INSERT INTO copyright_notice_delivery_recipients
        (copyright_notice_delivery_work_item_id, email_ciphertext)
      SELECT id, 'v1:explain-recipient' FROM inserted WHERE channel = 'email'`,
    [notices, submissions, emails, inApp, seedUser.id, recoveryWindow],
  )
  await transaction(analyzeSql)
  await transaction.commit()

  const eligible = (workIds: string[]) =>
    workIds.slice(0, recoveryWindow).filter((_, index) => index % 5 < 2)
  return {
    intentCount: emails.length + inApp.length,
    eligibleIds: { email: eligible(emails), in_app: eligible(inApp) },
    cleanup: () => cleanupCopyrightDeliveryIntentRecovery(notices),
  }
}

async function cleanupCopyrightDeliveryIntentRecovery(notices: string[]): Promise<void> {
  await using transaction = await beginTransaction()
  await cleanupCopyrightRecoveryFixture(transaction, notices)
  await transaction(analyzeSql)
  await transaction.commit()
}
