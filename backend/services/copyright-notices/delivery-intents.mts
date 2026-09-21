/* oxlint-disable max-lines -- Delivery transitions stay centralized around one durable-intent invariant. */
import { beginTransaction, write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type {
  CopyrightDeliveryIntentRecord,
  CopyrightDeliveryRecipientRecord,
} from './delivery-types.mts'
export type {
  CopyrightDeliveryIntentRecord,
  CopyrightDeliveryRecipientRecord,
} from './delivery-types.mts'

export async function createCopyrightDeliveryIntent(
  input: {
    noticeId: string
    submissionId: string | null
    correspondenceId: string | null
    recipientUserId: string | null
    recipientRole: 'claimant' | 'poster' | 'correspondent'
    deliveryKind: CopyrightDeliveryIntentRecord['delivery_kind']
    channel: CopyrightDeliveryIntentRecord['channel']
    idempotencyKey: string
    recipientEmail?: string
  },
  transaction?: TransactionQuery,
): Promise<CopyrightDeliveryIntentRecord> {
  if (transaction) return insertCopyrightDeliveryIntent(input, transaction)
  await using owned = await beginTransaction()
  const intent = await insertCopyrightDeliveryIntent(input, owned)
  await owned.commit()
  return intent
}

export async function claimCopyrightDeliveryIntent(
  intentId: string,
): Promise<CopyrightDeliveryIntentRecord | null> {
  const { rows } = await write<CopyrightDeliveryIntentRecord>(sql`/* claimCopyrightDeliveryIntent */
    WITH exhausted AS (
      UPDATE copyright_notice_delivery_intents
      SET state = 'failed', claimed_at = NULL, failed_at = CURRENT_TIMESTAMP, next_attempt_at = NULL
      WHERE id = ${intentId}
        AND state = 'claimed'
        AND claimed_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes'
        AND delivery_attempt_count >= 5
    )
    UPDATE copyright_notice_delivery_intents
    SET state = 'claimed', claimed_at = CURRENT_TIMESTAMP,
      delivery_attempted_at = CURRENT_TIMESTAMP, next_attempt_at = NULL,
      delivery_attempt_count = delivery_attempt_count + 1, failure_ciphertext = NULL
    WHERE id = ${intentId}
      AND delivery_attempt_count < 5
      AND ((state = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP))
        OR (state = 'claimed' AND claimed_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes'))
    RETURNING id, copyright_notice_id, copyright_notice_submission_id,
      copyright_notice_correspondence_message_id, recipient_user_id, recipient_role, delivery_kind,
      channel, state, ses_message_id, delivery_attempt_count
  `)
  return rows[0] ?? null
}

export async function markCopyrightDeliveryIntentSent(input: {
  intentId: string
  sesMessageId?: string
}): Promise<boolean> {
  const { rows } = await write(sql`/* markCopyrightDeliveryIntentSent */
    UPDATE copyright_notice_delivery_intents
    SET state = 'sent', sent_at = CURRENT_TIMESTAMP,
      ses_message_id = ${input.sesMessageId ?? null}
    WHERE id = ${input.intentId} AND state = 'claimed'
    RETURNING id
  `)
  return rows.length === 1
}

export async function markCopyrightDeliveryIntentEmailSent(input: {
  intentId: string
  correspondenceId: string
  sesMessageId: string
}): Promise<boolean> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction(sql`/* markCopyrightDeliveryIntentEmailSent:intent */
    UPDATE copyright_notice_delivery_intents
    SET state = 'sent', sent_at = CURRENT_TIMESTAMP,
      ses_message_id = ${input.sesMessageId}
    WHERE id = ${input.intentId} AND state = 'claimed' AND channel = 'email'
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
  intentId: string
  error: string
}): Promise<boolean> {
  const boundedError = input.error.slice(0, 10_000)
  const { rows } = await write(sql`/* markCopyrightDeliveryIntentFailed */
    UPDATE copyright_notice_delivery_intents
    SET state = CASE WHEN delivery_attempt_count >= 5 THEN 'failed' ELSE 'pending' END,
      claimed_at = NULL,
      failed_at = CASE WHEN delivery_attempt_count >= 5 THEN CURRENT_TIMESTAMP ELSE NULL END,
      next_attempt_at = CASE WHEN delivery_attempt_count >= 5 THEN NULL
        ELSE CURRENT_TIMESTAMP + make_interval(mins => (2 ^ (delivery_attempt_count - 1))::integer) END,
      failure_ciphertext = ${encryptSecret(boundedError, `copyright-delivery:${input.intentId}`)}
    WHERE id = ${input.intentId} AND state = 'claimed'
    RETURNING id
  `)
  return rows.length === 1
}

export async function markCopyrightDeliveryIntentBouncedBySesMessageId(input: {
  sesMessageId: string
  recipientEmails: string[]
}): Promise<number> {
  const { rows } = await write<CopyrightDeliveryRecipientRecord & { intent_id: string }>(
    sql`/* markCopyrightDeliveryIntentBouncedBySesMessageId:recipients */
      SELECT intent.id AS intent_id, recipient.copyright_notice_delivery_intent_id, recipient.email_ciphertext
      FROM copyright_notice_delivery_intents intent
      JOIN copyright_notice_delivery_recipients recipient
        ON recipient.copyright_notice_delivery_intent_id = intent.id
      WHERE intent.ses_message_id = ${input.sesMessageId} AND intent.state = 'sent'`,
  )
  const bouncedRecipients = new Set(input.recipientEmails.map(normalizeEmailAddress))
  const intentIds = rows.flatMap(row => {
    const recipient = decryptSecret(
      row.email_ciphertext,
      `copyright-delivery-recipient:${row.copyright_notice_delivery_intent_id}`,
    )
    return bouncedRecipients.has(normalizeEmailAddress(recipient)) ? [row.intent_id] : []
  })
  if (intentIds.length === 0) return 0
  const { rowCount } = await write(sql`/* markCopyrightDeliveryIntentBouncedBySesMessageId:update */
    UPDATE copyright_notice_delivery_intents
    SET state = 'bounced', bounced_at = CURRENT_TIMESTAMP
    WHERE id = ANY(${intentIds}::uuid[]) AND state = 'sent'
  `)
  return rowCount ?? 0
}

async function insertCopyrightDeliveryIntent(
  input: Parameters<typeof createCopyrightDeliveryIntent>[0],
  transaction: TransactionQuery,
): Promise<CopyrightDeliveryIntentRecord> {
  assert(
    input.recipientRole !== 'poster' || input.recipientUserId,
    422,
    'Poster delivery requires a user recipient',
  )
  assert(
    input.recipientRole !== 'correspondent' || (!input.recipientUserId && input.recipientEmail),
    422,
    'Correspondent delivery requires an external email recipient',
  )
  const { rows } =
    await transaction<CopyrightDeliveryIntentRecord>(sql`/* createCopyrightDeliveryIntent */
    INSERT INTO copyright_notice_delivery_intents (
      copyright_notice_id, copyright_notice_submission_id, copyright_notice_correspondence_message_id,
      recipient_user_id, recipient_role, delivery_kind, channel, idempotency_key
    ) SELECT ${input.noticeId}, ${input.submissionId}, ${input.correspondenceId},
      ${input.recipientUserId}, ${input.recipientRole}, ${input.deliveryKind}, ${input.channel}, ${input.idempotencyKey}
    WHERE EXISTS (SELECT 1 FROM copyright_notices WHERE id = ${input.noticeId})
      AND (${input.submissionId}::uuid IS NULL OR EXISTS (
        SELECT 1 FROM copyright_notice_submissions
        WHERE id = ${input.submissionId} AND copyright_notice_id = ${input.noticeId}
      ))
      AND (${input.correspondenceId}::uuid IS NULL OR EXISTS (
        SELECT 1 FROM copyright_notice_correspondence_messages
        WHERE id = ${input.correspondenceId} AND copyright_notice_id = ${input.noticeId}
      ))
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id, copyright_notice_id, copyright_notice_submission_id,
      copyright_notice_correspondence_message_id, recipient_user_id, recipient_role, delivery_kind,
      channel, state, ses_message_id, delivery_attempt_count
  `)
  const intent = rows[0]
  if (intent) {
    await insertCopyrightDeliveryRecipient(input.recipientEmail, intent.id, transaction)
    return intent
  }
  const { rows: existingRows } =
    await transaction<CopyrightDeliveryIntentRecord>(sql`/* createCopyrightDeliveryIntent:existing */
    SELECT id, copyright_notice_id, copyright_notice_submission_id,
      copyright_notice_correspondence_message_id, recipient_user_id, recipient_role, delivery_kind,
      channel, state, ses_message_id, delivery_attempt_count
    FROM copyright_notice_delivery_intents
    WHERE idempotency_key = ${input.idempotencyKey}
  `)
  const existing = existingRows[0]
  assert(existing, 404, 'Copyright notice was not found')
  assert(
    existing.copyright_notice_id === input.noticeId &&
      existing.copyright_notice_submission_id === input.submissionId &&
      existing.copyright_notice_correspondence_message_id === input.correspondenceId &&
      existing.recipient_user_id === input.recipientUserId &&
      existing.recipient_role === input.recipientRole &&
      existing.delivery_kind === input.deliveryKind &&
      existing.channel === input.channel,
    409,
    'Copyright delivery idempotency key was reused',
  )
  return existing
}

async function insertCopyrightDeliveryRecipient(
  recipientEmail: string | undefined,
  intentId: string,
  transaction: TransactionQuery,
): Promise<void> {
  if (!recipientEmail) return
  assert(recipientEmail.trim().length > 0, 422, 'Copyright email recipient is required')
  await transaction(sql`/* insertCopyrightDeliveryRecipient */
    INSERT INTO copyright_notice_delivery_recipients (
      copyright_notice_delivery_intent_id, email_ciphertext
    ) VALUES (
      ${intentId}, ${encryptSecret(recipientEmail.trim(), `copyright-delivery-recipient:${intentId}`)}
    ) ON CONFLICT (copyright_notice_delivery_intent_id) DO NOTHING
  `)
}

export async function getCopyrightDeliveryRecipient(
  intentId: string,
): Promise<CopyrightDeliveryRecipientRecord | null> {
  const { rows } =
    await write<CopyrightDeliveryRecipientRecord>(sql`/* getCopyrightDeliveryRecipient */
    SELECT copyright_notice_delivery_intent_id, email_ciphertext
    FROM copyright_notice_delivery_recipients
    WHERE copyright_notice_delivery_intent_id = ${intentId}
  `)
  return rows[0] ?? null
}

export async function recordCopyrightDeliveryRecipient(input: {
  intentId: string
  recipientEmail: string
}): Promise<void> {
  await using transaction = await beginTransaction()
  await insertCopyrightDeliveryRecipient(input.recipientEmail, input.intentId, transaction)
  await transaction.commit()
}

export async function listRecoverableCopyrightDeliveryIntents(
  limit: number,
): Promise<CopyrightDeliveryIntentRecord[]> {
  const { rows } =
    await write<CopyrightDeliveryIntentRecord>(sql`/* listRecoverableCopyrightDeliveryIntents */
    WITH exhausted AS (
      UPDATE copyright_notice_delivery_intents
      SET state = 'failed', claimed_at = NULL, failed_at = CURRENT_TIMESTAMP, next_attempt_at = NULL
      WHERE state = 'claimed'
        AND claimed_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes'
        AND delivery_attempt_count >= 5
    )
    SELECT id, copyright_notice_id, copyright_notice_submission_id,
      copyright_notice_correspondence_message_id, recipient_user_id, recipient_role, delivery_kind,
      channel, state, ses_message_id, delivery_attempt_count
    FROM copyright_notice_delivery_intents
    WHERE (state = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP))
      OR (state = 'claimed' AND claimed_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes'
        AND delivery_attempt_count < 5)
    ORDER BY id
    LIMIT ${limit}
  `)
  return rows
}

export async function replayFailedCopyrightDeliveryIntent(input: {
  intentId: string
  noticeId: string
  actorUserId: string
}): Promise<boolean> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction(sql`/* replayFailedCopyrightDeliveryIntent */
    UPDATE copyright_notice_delivery_intents
    SET state = 'pending', claimed_at = NULL, failed_at = NULL, next_attempt_at = NULL,
      delivery_attempt_count = 0, failure_ciphertext = NULL
    WHERE id = ${input.intentId} AND copyright_notice_id = ${input.noticeId} AND state = 'failed'
    RETURNING id
  `)
  if (!rows[0]) return false
  await transaction(sql`/* replayFailedCopyrightDeliveryIntent:event */
    INSERT INTO copyright_notice_lifecycle_events (
      copyright_notice_id, event_type, actor_user_id, metadata
    ) VALUES (
      ${input.noticeId}, 'delivery_intent_replayed', ${input.actorUserId},
      ${JSON.stringify({ intentId: input.intentId })}::jsonb
    )
  `)
  await transaction.commit()
  return true
}

function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase()
}
