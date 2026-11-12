import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export async function deleteAttemptBatch(
  transaction: TransactionQuery,
  kind: 'action_attempts' | 'delivery_attempts',
  ids: readonly string[],
  cutoff: Date,
): Promise<number> {
  const table =
    kind === 'action_attempts'
      ? 'copyright_notice_action_attempts'
      : 'copyright_notice_delivery_attempts'
  const resultTable =
    kind === 'action_attempts'
      ? 'copyright_notice_action_attempt_results'
      : 'copyright_notice_delivery_attempt_results'
  const terminalAt =
    kind === 'action_attempts'
      ? 'COALESCE(result.completed_at, result.stale_at, result.blocked_at, result.failed_at, result.abandoned_at)'
      : 'COALESCE(result.sent_at, result.failed_at, result.bounced_at, result.abandoned_at)'
  const { rows } = await transaction<{ id: string }>(
    sql`/* selectExpiredCopyrightExecutionAttempts */ SELECT attempt.id FROM `
      .append(table)
      .append(sql` attempt JOIN `)
      .append(resultTable)
      .append(sql` result ON result.attempt_id = attempt.id
        WHERE attempt.id = ANY(${[...ids]}::uuid[])
          AND `)
      .append(terminalAt)
      .append(sql` <= ${cutoff}
          AND EXISTS (
            SELECT 1 FROM `)
      .append(table).append(sql` newer WHERE newer.work_item_id = attempt.work_item_id
              AND newer.attempt_number > attempt.attempt_number)
        ORDER BY attempt.id`),
  )
  const eligible = rows.map(row => row.id)
  if (eligible.length === 0) return 0
  await transaction(
    sql`/* deleteExpiredCopyrightExecutionResults */ DELETE FROM `
      .append(resultTable)
      .append(sql` WHERE attempt_id = ANY(${eligible}::uuid[])`),
  )
  const { rowCount } = await transaction(
    sql`/* deleteExpiredCopyrightExecutionAttempts */ DELETE FROM `
      .append(table)
      .append(sql` WHERE id = ANY(${eligible}::uuid[])`),
  )
  return rowCount ?? 0
}
