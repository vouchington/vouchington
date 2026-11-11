import { beginTransaction, read } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { CopyrightDeliveryIntentRecord } from './delivery-types.mts'
import {
  queryCopyrightSweepIdPage,
  type CopyrightSweepIdPage,
  type CopyrightSweepPageOptions,
} from './sweep-id-pages.mts'

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
    sql`copyright_notice_email_intake_receipt_id = ${input.intakeId} AND delivery_kind IN ('email_intake_rejected', 'email_intake_needs_information')`,
    input.actorUserId,
  )
}

/**
 * The conditional update is the replay guard. The existing audit advances case activity before
 * the reset invalidates retention proof; a losing reset rolls that audit back with its transaction.
 * The body and recipient stay as stored, so the retry resends the exact text.
 */
async function resetFailedCopyrightDeliveryIntent(
  scope: SQLStatement,
  actorUserId: string,
): Promise<string | null> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ id: string; copyright_notice_id: string | null }>(
    sql`/* replayFailedCopyrightDeliveryIntent:failed */
    SELECT id, copyright_notice_id FROM copyright_notice_delivery_work_items
    WHERE `.append(scope).append(sql` AND state = 'failed'
    `),
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
  const { rowCount } = await transaction(sql`/* replayFailedCopyrightDeliveryIntent */
    UPDATE copyright_notice_delivery_work_items
    SET leased_at = NULL, failed_at = NULL, available_at = clock_timestamp(),
      attempt_count = 0, failure_ciphertext = NULL
    WHERE id = ${intent.id} AND state = 'failed'
  `)
  if (rowCount !== 1) return null
  await transaction.commit()
  return intent.id
}
