import { getCopyrightNoticesWorkLimit } from './work-limits.mts'
/* oxlint-disable max-lines -- Delivery transitions stay centralized around one durable-intent invariant. */
import { beginTransaction, read, write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql, { type SQLStatement } from 'sql-template-strings'
import type {
  CopyrightDeliveryIntentRecord,
  CopyrightDeliveryRecipientRecord,
  CopyrightNoticeDeliveryKind,
} from './delivery-types.mts'
import {
  queryCopyrightSweepIdPage,
  type CopyrightSweepIdPage,
  type CopyrightSweepPageOptions,
} from './sweep-id-pages.mts'
export type {
  CopyrightDeliveryIntentRecord,
  CopyrightDeliveryRecipientRecord,
} from './delivery-types.mts'

export type ClaimedCopyrightDeliveryIntent = CopyrightDeliveryIntentRecord & {
  lease_token: string
  copyright_notice_email_intake_id: string | null
  body_ciphertext: string | null
}

export async function createCopyrightDeliveryIntent(
  input: {
    noticeId: string
    submissionId: string | null
    correspondenceId: string | null
    recipientUserId: string | null
    recipientRole: 'claimant' | 'poster' | 'informed_owner' | 'correspondent'
    deliveryKind: CopyrightNoticeDeliveryKind
    channel: CopyrightDeliveryIntentRecord['channel']
    idempotencyKey: string
    recipientEmail?: string
    targetPath?: string
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
): Promise<ClaimedCopyrightDeliveryIntent | null> {
  const COPYRIGHT_NOTICES_DELIVERY_LEASE_MINUTES =
    getCopyrightNoticesWorkLimit('delivery_lease_minutes')
  const { rows } =
    await write<ClaimedCopyrightDeliveryIntent>(sql`/* claimCopyrightDeliveryIntent */
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
    RETURNING id, lease_token, copyright_notice_id, copyright_notice_email_intake_id,
      copyright_notice_submission_id, copyright_notice_correspondence_message_id, recipient_user_id,
      recipient_role, delivery_kind, target_path, channel, state, amazon_ses_message_id, attempt_count,
      body_ciphertext
  `)
  return rows[0] ?? null
}

export async function markCopyrightDeliveryIntentSent(input: {
  leaseToken: string
  intentId: string
  sesMessageId?: string
}): Promise<boolean> {
  const { rows } = await write(sql`/* markCopyrightDeliveryIntentSent */
    UPDATE copyright_notice_delivery_work_items
    SET sent_at = CURRENT_TIMESTAMP,
      amazon_ses_message_id = ${input.sesMessageId ?? null}
    WHERE id = ${input.intentId} AND state = 'claimed' AND lease_token = ${input.leaseToken} AND lease_expires_at > clock_timestamp()
    RETURNING id
  `)
  return rows.length === 1
}

export async function markCopyrightDeliveryIntentEmailSent(input: {
  leaseToken: string
  intentId: string
  correspondenceId: string
  sesMessageId: string
}): Promise<boolean> {
  await using transaction = await beginTransaction()
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
  const { rows } = await write(sql`/* markCopyrightDeliveryIntentFailed */
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
  return rows.length === 1
}

export async function markCopyrightDeliveryIntentBouncedBySesMessageId(input: {
  sesMessageId: string
  recipientEmails: string[]
}): Promise<number> {
  const { rows } = await write<CopyrightDeliveryRecipientRecord & { intent_id: string }>(
    sql`/* markCopyrightDeliveryIntentBouncedBySesMessageId:recipients */
      SELECT intent.id AS intent_id, recipient.copyright_notice_delivery_work_item_id, recipient.email_ciphertext
      FROM copyright_notice_delivery_work_items intent
      JOIN copyright_notice_delivery_recipients recipient
        ON recipient.copyright_notice_delivery_work_item_id = intent.id
      WHERE intent.amazon_ses_message_id = ${input.sesMessageId} AND intent.state = 'sent'`,
  )
  const bouncedRecipients = new Set(input.recipientEmails.map(normalizeEmailAddress))
  const intentIds = rows.flatMap(row => {
    const recipient = decryptSecret(
      row.email_ciphertext,
      `copyright-delivery-recipient:${row.copyright_notice_delivery_work_item_id}`,
    )
    return bouncedRecipients.has(normalizeEmailAddress(recipient)) ? [row.intent_id] : []
  })
  if (intentIds.length === 0) return 0
  const { rowCount } = await write(sql`/* markCopyrightDeliveryIntentBouncedBySesMessageId:update */
    UPDATE copyright_notice_delivery_work_items
    SET bounced_at = CURRENT_TIMESTAMP
    WHERE id = ANY(${intentIds}::uuid[]) AND state = 'sent'
  `)
  return rowCount ?? 0
}

async function insertCopyrightDeliveryIntent(
  input: Parameters<typeof createCopyrightDeliveryIntent>[0],
  transaction: TransactionQuery,
): Promise<CopyrightDeliveryIntentRecord> {
  assert(
    !['poster', 'informed_owner'].includes(input.recipientRole) || input.recipientUserId,
    422,
    'Poster delivery requires a user recipient',
  )
  assert(
    input.recipientRole !== 'correspondent' || (!input.recipientUserId && input.recipientEmail),
    422,
    'Correspondent delivery requires an external email recipient',
  )
  assert(
    (input.recipientRole === 'informed_owner') === Boolean(input.targetPath),
    422,
    'Informed owner delivery requires a community path',
  )
  const { rows } =
    await transaction<CopyrightDeliveryIntentRecord>(sql`/* createCopyrightDeliveryIntent */
    INSERT INTO copyright_notice_delivery_work_items (
      copyright_notice_id, copyright_notice_submission_id, copyright_notice_correspondence_message_id,
      recipient_user_id, recipient_role, delivery_kind, target_path, channel, idempotency_key
    ) SELECT ${input.noticeId}, ${input.submissionId}, ${input.correspondenceId},
      ${input.recipientUserId}, ${input.recipientRole}, ${input.deliveryKind}, ${input.targetPath ?? null}, ${input.channel}, ${input.idempotencyKey}
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
    RETURNING id, lease_token, copyright_notice_id, copyright_notice_submission_id,
      copyright_notice_correspondence_message_id, recipient_user_id, recipient_role, delivery_kind, target_path,
      channel, state, amazon_ses_message_id, attempt_count
  `)
  const intent = rows[0]
  if (intent) {
    await insertCopyrightDeliveryRecipient(input.recipientEmail, intent.id, transaction)
    return intent
  }
  const { rows: existingRows } =
    await transaction<CopyrightDeliveryIntentRecord>(sql`/* createCopyrightDeliveryIntent:existing */
    SELECT id, lease_token, copyright_notice_id, copyright_notice_submission_id,
      copyright_notice_correspondence_message_id, recipient_user_id, recipient_role, delivery_kind, target_path,
      channel, state, amazon_ses_message_id, attempt_count
    FROM copyright_notice_delivery_work_items
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
      existing.target_path === (input.targetPath ?? null) &&
      existing.channel === input.channel,
    409,
    'Copyright delivery idempotency key was reused',
  )
  return existing
}

export async function insertCopyrightDeliveryRecipient(
  recipientEmail: string | undefined,
  intentId: string,
  transaction: TransactionQuery,
): Promise<void> {
  if (!recipientEmail) return
  assert(recipientEmail.trim().length > 0, 422, 'Copyright email recipient is required')
  await transaction(sql`/* insertCopyrightDeliveryRecipient */
    INSERT INTO copyright_notice_delivery_recipients (
      copyright_notice_delivery_work_item_id, email_ciphertext
    ) VALUES (
      ${intentId}, ${encryptSecret(recipientEmail.trim(), `copyright-delivery-recipient:${intentId}`)}
    ) ON CONFLICT (copyright_notice_delivery_work_item_id) DO NOTHING
  `)
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
  await using transaction = await beginTransaction()
  await insertCopyrightDeliveryRecipient(input.recipientEmail, input.intentId, transaction)
  await transaction.commit()
}

/**
 * Pages one channel's delivery intents that are due or whose claim lease expired. Expired claims at
 * the retry cap stay listed: `claimCopyrightDeliveryIntent` fails them when their job runs.
 */
export function searchRecoverableCopyrightDeliveryIntentIds(
  options: CopyrightSweepPageOptions & { channel: CopyrightDeliveryIntentRecord['channel'] },
): Promise<CopyrightSweepIdPage> {
  return queryCopyrightSweepIdPage(
    options,
    'Invalid copyright delivery intent cursor',
    'searchRecoverableCopyrightDeliveryIntentIds',
    'rowId',
    sql`/* searchRecoverableCopyrightDeliveryIntentIds */
      SELECT id
      FROM copyright_notice_delivery_work_items
      WHERE channel = ${options.channel}
        AND (
          (state = 'pending' AND (available_at IS NULL OR available_at <= CURRENT_TIMESTAMP))
          OR (state = 'claimed' AND lease_expires_at <= clock_timestamp())
        )`,
    statement => read(statement),
  )
}

export async function replayFailedCopyrightDeliveryIntent(input: {
  intentId: string
  noticeId: string
  actorUserId: string
}): Promise<boolean> {
  const replayed = await resetFailedCopyrightDeliveryIntent(
    sql`id = ${input.intentId} AND copyright_notice_id = ${input.noticeId}`,
    input.actorUserId,
  )
  return replayed !== null
}

/**
 * Resets the one failed reply to a declined email intake and returns its intent id, or null when
 * the intake has no failed reply. A bounced, sent, claimed or pending reply never matches.
 */
export function replayFailedCopyrightEmailIntakeReplyIntent(input: {
  intakeId: string
  actorUserId: string
}): Promise<string | null> {
  return resetFailedCopyrightDeliveryIntent(
    sql`copyright_notice_email_intake_id = ${input.intakeId} AND delivery_kind IN ('email_intake_rejected', 'email_intake_needs_information')`,
    input.actorUserId,
  )
}

/**
 * The conditional update is the replay guard: a concurrent second replay waits on the row lock,
 * then matches nothing, so one reset writes exactly one audit row. The body and recipient stay as
 * stored, so the retry resends the exact text.
 */
async function resetFailedCopyrightDeliveryIntent(
  scope: SQLStatement,
  actorUserId: string,
): Promise<string | null> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ id: string; copyright_notice_id: string | null }>(
    sql`/* replayFailedCopyrightDeliveryIntent */
    UPDATE copyright_notice_delivery_work_items
    SET leased_at = NULL, failed_at = NULL, available_at = clock_timestamp(),
      attempt_count = 0, failure_ciphertext = NULL
    WHERE `.append(scope).append(sql` AND state = 'failed'
    RETURNING id, copyright_notice_id`),
  )
  const intent = rows[0]
  if (!intent) return null
  await transaction(sql`/* replayFailedCopyrightDeliveryIntent:event */
    INSERT INTO copyright_notice_lifecycle_changes (
      copyright_notice_id, change_type, changed_by_id, copyright_notice_delivery_work_item_id
    ) VALUES (
      ${intent.copyright_notice_id}, 'delivery_intent_replayed', ${actorUserId}, ${intent.id}
    )
  `)
  await transaction.commit()
  return intent.id
}

function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase()
}
