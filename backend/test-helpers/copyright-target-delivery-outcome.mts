import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Ends every restriction notice sent to one poster for one target as sent or failed. */
export async function setTestPosterTargetDeliveryOutcome(input: {
  noticeId: string
  targetId: string
  userId: string
  outcome: 'sent' | 'failed'
}): Promise<void> {
  const { rowCount } = await write(sql`/* setTestPosterTargetDeliveryOutcome */
    UPDATE copyright_notice_delivery_work_items SET
      delivery_attempted_at = CURRENT_TIMESTAMP,
      sent_at = CASE WHEN ${input.outcome} = 'sent' THEN CURRENT_TIMESTAMP END,
      failed_at = CASE WHEN ${input.outcome} = 'failed' THEN CURRENT_TIMESTAMP END
    WHERE copyright_notice_id = ${input.noticeId}
      AND copyright_notice_target_id = ${input.targetId}
      AND recipient_user_id = ${input.userId}
      AND delivery_kind = 'poster_restriction_notice'`)
  if (!rowCount) throw new Error('The poster has no restriction notice for the target')
}
