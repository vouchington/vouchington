import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getReportingCleanupRows } from './work-limits.mts'
import { getReportingDayBounds } from './windows.mts'

export async function cleanupModeratorWorkloadDays(now = new Date()) {
  const before = getReportingDayBounds(new Date(now.getTime() - 90 * 86_400_000))
    .start.toISOString()
    .slice(0, 10)
  const limit = getReportingCleanupRows()
  const { rows } = await write<{ id: string }>(sql`/* cleanupModeratorWorkloadDays */
    DELETE FROM moderator_workload_daily_totals WHERE id IN (
      SELECT id FROM moderator_workload_daily_totals WHERE day < ${before}::date
      ORDER BY day, id LIMIT ${limit}
    ) RETURNING id
  `)
  return { hasMore: rows.length === limit, revision: rows[0]?.id }
}
