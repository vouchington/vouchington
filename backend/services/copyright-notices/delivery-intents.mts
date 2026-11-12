import { readCopyrightDeliveryPreservationCoverage } from './delivery-preservation.mts'
import { getCopyrightNoticesWorkLimit } from './work-limits.mts'
import { beginTransaction, write } from '@data-stores/psql'
import { readCopyrightThreadRetirement } from '@data-stores/psql/copyright-preservation-coverage'
import type { TransactionQuery } from '@data-stores/psql/types'
import { CONFLICT } from '@modules/on-error/error-codes'
import { encryptSecret } from '@modules/token-secrets'
import { conflictOnSerializationFailure } from '@modules/utils/serialization-conflict'
import assert from 'http-assert'
import {
  createCopyrightDeliveryIntents,
  insertCopyrightDeliveryRecipients,
} from './delivery-intent-batch.mts'
import sql from 'sql-template-strings'
import type {
  CopyrightDeliveryIntentInput,
  CopyrightDeliveryIntentRecord,
  CopyrightDeliveryRecipientRecord,
} from './delivery-types.mts'
export type {
  CopyrightDeliveryIntentRecord,
  CopyrightDeliveryRecipientRecord,
} from './delivery-types.mts'

export type ClaimedCopyrightDeliveryIntent = CopyrightDeliveryIntentRecord & {
  lease_token: string
  copyright_notice_email_intake_receipt_id: string | null
  body_ciphertext: string | null
}

export async function createCopyrightDeliveryIntent(
  input: CopyrightDeliveryIntentInput,
  transaction?: TransactionQuery,
): Promise<CopyrightDeliveryIntentRecord> {
  if (transaction) return (await createCopyrightDeliveryIntents([input], transaction))[0]!
  return conflictOnSerializationFailure(
    async () => {
      await using owned = await beginTransaction({ serializable: true })
      await readCopyrightThreadRetirement(owned, [input.noticeId])
      const intent = (await createCopyrightDeliveryIntents([input], owned))[0]!
      await owned.commit()
      return intent
    },
    'Conflicting copyright case change',
    CONFLICT,
  )
}

export async function claimCopyrightDeliveryIntent(
  intentId: string,
): Promise<ClaimedCopyrightDeliveryIntent | null> {
  const COPYRIGHT_NOTICES_DELIVERY_LEASE_MINUTES =
    getCopyrightNoticesWorkLimit('delivery_lease_minutes')
  await using transaction = await beginTransaction({ serializable: true })
  await readCopyrightDeliveryPreservationCoverage(transaction, [intentId])
  const { rows } =
    await transaction<ClaimedCopyrightDeliveryIntent>(sql`/* claimCopyrightDeliveryIntent */
    WITH exhausted AS (
      UPDATE copyright_notice_delivery_work_items
      SET leased_at = NULL, failed_at = CURRENT_TIMESTAMP, available_at = clock_timestamp()
      WHERE id = ${intentId}
        AND state = 'claimed'
        AND lease_expires_at <= clock_timestamp()
        AND attempt_count >= 5
    )
    UPDATE copyright_notice_delivery_work_items
    SET lease_token = uuidv7(), leased_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + ${COPYRIGHT_NOTICES_DELIVERY_LEASE_MINUTES} * INTERVAL '1 minute',
      delivery_attempted_at = CURRENT_TIMESTAMP, available_at = clock_timestamp(),
      attempt_count = attempt_count + 1, failure_ciphertext = NULL
    WHERE id = ${intentId}
      AND attempt_count < 5
      AND ((state = 'pending' AND (available_at IS NULL OR available_at <= CURRENT_TIMESTAMP))
        OR (state = 'claimed' AND lease_expires_at <= clock_timestamp()))
    RETURNING id, lease_token, copyright_notice_id, copyright_notice_email_intake_receipt_id,
      copyright_notice_submission_id, copyright_notice_correspondence_message_id, recipient_user_id,
      recipient_role, delivery_kind, target_path, channel, state, amazon_ses_message_id, attempt_count,
      body_ciphertext
  `)
  await transaction.commit()
  return rows[0] ?? null
}

export async function markCopyrightDeliveryIntentSent(input: {
  leaseToken: string
  intentId: string
  sesMessageId?: string
}): Promise<boolean> {
  await using transaction = await beginTransaction({ serializable: true })
  await readCopyrightDeliveryPreservationCoverage(transaction, [input.intentId])
  const { rows } = await transaction(sql`/* markCopyrightDeliveryIntentSent */
    UPDATE copyright_notice_delivery_work_items
    SET sent_at = CURRENT_TIMESTAMP,
      amazon_ses_message_id = ${input.sesMessageId ?? null}
    WHERE id = ${input.intentId} AND state = 'claimed' AND lease_token = ${input.leaseToken} AND lease_expires_at > clock_timestamp()
    RETURNING id
  `)
  await transaction.commit()
  return rows.length === 1
}

export async function markCopyrightDeliveryIntentEmailSent(input: {
  leaseToken: string
  intentId: string
  correspondenceId: string
  sesMessageId: string
}): Promise<boolean> {
  await using transaction = await beginTransaction({ serializable: true })
  await readCopyrightDeliveryPreservationCoverage(transaction, [input.intentId])
  const { rows } = await transaction(sql`/* markCopyrightDeliveryIntentEmailSent:intent */
    UPDATE copyright_notice_delivery_work_items
    SET sent_at = CURRENT_TIMESTAMP,
      amazon_ses_message_id = ${input.sesMessageId}
    WHERE id = ${input.intentId} AND state = 'claimed' AND lease_token = ${input.leaseToken} AND lease_expires_at > clock_timestamp() AND channel = 'email'
      AND copyright_notice_correspondence_message_id = ${input.correspondenceId}
    RETURNING id
  `)
  if (!rows[0]) return false
  const { rowCount } =
    await transaction(sql`/* markCopyrightDeliveryIntentEmailSent:correspondence */
    UPDATE copyright_notice_correspondence_messages
    SET sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP)
    WHERE id = ${input.correspondenceId} AND direction = 'outbound'
  `)
  assert(rowCount === 1, 409, 'Copyright correspondence was not found')
  await transaction.commit()
  return true
}

export async function markCopyrightDeliveryIntentFailed(input: {
  leaseToken: string
  intentId: string
  error: string
}): Promise<boolean> {
  const boundedError = input.error.slice(0, 10_000)
  await using transaction = await beginTransaction({ serializable: true })
  await readCopyrightDeliveryPreservationCoverage(transaction, [input.intentId])
  const { rows } = await transaction(sql`/* markCopyrightDeliveryIntentFailed */
    UPDATE copyright_notice_delivery_work_items
    SET
      leased_at = NULL,
      failed_at = CASE WHEN attempt_count >= 5 THEN CURRENT_TIMESTAMP ELSE NULL END,
      available_at = CASE WHEN attempt_count >= 5 THEN clock_timestamp()
        ELSE clock_timestamp() + make_interval(mins => (2 ^ (attempt_count - 1))::integer) END,
      failure_ciphertext = ${encryptSecret(boundedError, `copyright-delivery:${input.intentId}`)}
    WHERE id = ${input.intentId} AND state = 'claimed' AND lease_token = ${input.leaseToken} AND lease_expires_at > clock_timestamp()
    RETURNING id
  `)
  await transaction.commit()
  return rows.length === 1
}

export async function insertCopyrightDeliveryRecipient(
  recipientEmail: string | undefined,
  intentId: string,
  transaction: TransactionQuery,
): Promise<void> {
  if (!recipientEmail) return
  await insertCopyrightDeliveryRecipients([{ recipientEmail, intentId }], transaction)
}

export async function getCopyrightDeliveryRecipient(
  intentId: string,
): Promise<CopyrightDeliveryRecipientRecord | null> {
  const { rows } =
    await write<CopyrightDeliveryRecipientRecord>(sql`/* getCopyrightDeliveryRecipient */
    SELECT copyright_notice_delivery_work_item_id, email_ciphertext
    FROM copyright_notice_delivery_recipients
    WHERE copyright_notice_delivery_work_item_id = ${intentId}
  `)
  return rows[0] ?? null
}

export async function recordCopyrightDeliveryRecipient(input: {
  intentId: string
  recipientEmail: string
}): Promise<void> {
  await using transaction = await beginTransaction({ serializable: true })
  await readCopyrightDeliveryPreservationCoverage(transaction, [input.intentId])
  await insertCopyrightDeliveryRecipient(input.recipientEmail, input.intentId, transaction)
  await transaction.commit()
}
