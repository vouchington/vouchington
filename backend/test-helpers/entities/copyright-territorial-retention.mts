import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function finishUkRetentionReplayDelivery(noticeId: string): Promise<void> {
  await write(sql`/* finishUkRetentionReplayDelivery */
    UPDATE copyright_notice_delivery_work_items
    SET leased_at = NULL,
      delivery_attempted_at = COALESCE(delivery_attempted_at, CURRENT_TIMESTAMP),
      failed_at = CURRENT_TIMESTAMP,
      available_at = NULL,
      attempt_count = GREATEST(attempt_count, 5)
    WHERE copyright_notice_id = ${noticeId}
      AND state IN ('pending', 'claimed')`)
}
