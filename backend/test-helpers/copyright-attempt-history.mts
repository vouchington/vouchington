import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readTestCopyrightDeliveryAttempts(workItemId: string) {
  const { rows } = await read<{
    attempt_number: number
    generation: string
    sent: boolean
    failed: boolean
    abandoned: boolean
  }>(sql`
    /* readTestCopyrightDeliveryAttempts */
    SELECT attempt.attempt_number, attempt.generation,
      result.sent_at IS NOT NULL AS sent, result.failed_at IS NOT NULL AS failed,
      result.abandoned_at IS NOT NULL AS abandoned
    FROM copyright_notice_delivery_attempts attempt
    LEFT JOIN copyright_notice_delivery_attempt_results result ON result.attempt_id = attempt.id
    WHERE attempt.work_item_id = ${workItemId} ORDER BY attempt.attempt_number
  `)
  return rows
}

export async function rewriteTestCopyrightDeliveryAttempt(workItemId: string): Promise<void> {
  await write(sql`/* rewriteTestCopyrightDeliveryAttempt */
    UPDATE copyright_notice_delivery_attempts SET started_at = clock_timestamp()
    WHERE work_item_id = ${workItemId}
  `)
}
