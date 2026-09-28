import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { lockCurrentCopyrightTerritorialPolicy } from './territorial-policy.mts'

export type UkCopyrightAcknowledgment = {
  id: string
  attempt_count: number
  last_attempt_at: Date | null
  acknowledged_at: Date | null
  exhausted_at: Date | null
  escalated: boolean
}

type UkAcknowledgmentRow = UkCopyrightAcknowledgment & { requester_user_id: string | null }

export async function acknowledgeUkCopyrightNotice(
  actor: PrivateUser,
  noticeId: string,
): Promise<UkCopyrightAcknowledgment> {
  return recordUkAcknowledgment(actor, noticeId, 'acknowledged')
}

export async function recordUkCopyrightAcknowledgmentFailure(
  actor: PrivateUser,
  noticeId: string,
): Promise<UkCopyrightAcknowledgment> {
  return recordUkAcknowledgment(actor, noticeId, 'failed')
}

async function recordUkAcknowledgment(
  actor: PrivateUser,
  noticeId: string,
  outcome: 'acknowledged' | 'failed',
): Promise<UkCopyrightAcknowledgment> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<UkAcknowledgmentRow>(
    sql`/* recordUkAcknowledgment:lock */
    SELECT acknowledgment.id, acknowledgment.attempt_count, acknowledgment.last_attempt_at,
      acknowledgment.acknowledged_at, acknowledgment.exhausted_at, receipt.requester_user_id,
      false AS escalated
    FROM copyright_uk_notice_acknowledgments acknowledgment
    JOIN copyright_uk_notice_receipts receipt
      ON receipt.id = acknowledgment.copyright_uk_notice_receipt_id
    WHERE receipt.copyright_notice_id = ${noticeId}
    FOR UPDATE OF acknowledgment
  `,
  )
  const current = rows[0]
  assert(current, 404, 'UK copyright notice not found')
  if (current.acknowledged_at && outcome === 'acknowledged') {
    await transaction.commit()
    return current
  }
  assert(
    !current.acknowledged_at && !current.exhausted_at,
    409,
    'Acknowledgment is already terminal',
  )
  if (outcome === 'failed') {
    assert(currentUserCanReviewCopyrightNotices(actor), 403, 'Forbidden')
  } else {
    assert(
      actor.id === current.requester_user_id || currentUserCanReviewCopyrightNotices(actor),
      403,
      'Forbidden',
    )
  }
  await lockCurrentCopyrightTerritorialPolicy('uk', transaction)
  const { rows: updatedRows } = await transaction<UkCopyrightAcknowledgment>(
    sql`/* recordUkAcknowledgment */
    UPDATE copyright_uk_notice_acknowledgments
    SET attempt_count = attempt_count + 1, last_attempt_at = CURRENT_TIMESTAMP,
      acknowledged_at = CASE WHEN ${outcome} = 'acknowledged' THEN CURRENT_TIMESTAMP ELSE acknowledged_at END,
      exhausted_at = CASE
        WHEN ${outcome} = 'failed' AND attempt_count + 1 = 5 THEN CURRENT_TIMESTAMP
        ELSE exhausted_at
      END
    WHERE id = ${current.id}
    RETURNING id, attempt_count, last_attempt_at, acknowledged_at, exhausted_at, false AS escalated
  `,
  )
  const updated = updatedRows[0]
  assert(updated, 409, 'Acknowledgment is already terminal')
  if (updated.exhausted_at) {
    await transaction(sql`/* recordUkAcknowledgment:escalate */
      INSERT INTO copyright_uk_escalations (
        copyright_notice_id, copyright_uk_notice_acknowledgment_id
      ) VALUES (${noticeId}, ${updated.id})
    `)
    updated.escalated = true
  }
  await transaction.commit()
  return updated
}
