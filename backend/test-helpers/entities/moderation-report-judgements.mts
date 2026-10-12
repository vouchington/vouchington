import { read } from '../fixture-executor.mts'
import sql from '../fixture-sql.mts'

export async function getTestJudgementDispatchedAt(
  judgementId: string,
): Promise<Date | null | undefined> {
  const { rows } = await read<{ dispatched_at: Date | null }>(
    sql`/* getTestJudgementDispatchedAt */
      SELECT dispatched_at FROM moderation_report_judgements WHERE id = ${judgementId}::uuid`,
  )
  return rows[0]?.dispatched_at
}
