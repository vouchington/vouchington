import { runWithTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getReportingDayBounds } from './windows.mts'
import { recomputeGrowthDay } from './recompute-growth.mts'
import { recomputeModeratorWorkloadDay } from './recompute-workload.mts'
import { findNextReportingSourceDay, initializeReportingRollupCursors } from './initialize.mts'
import { getReportingDaysPerJob } from './work-limits.mts'

export type ReportingRollupKind = 'growth' | 'moderator_workload'

export async function recomputeReportingDay(kind: ReportingRollupKind, day: string) {
  if (getReportingDayBounds(day).start >= getReportingDayBounds(new Date()).start) return
  await runWithTransaction(undefined, async query => {
    if (kind === 'growth') await recomputeGrowthDay(day, query)
    else await recomputeModeratorWorkloadDay(day, query)
  })
}

/** Ordered jobs alone write the cursor; source-change jobs share the same ordering lane. */
export function materializeReportingDays(kind: ReportingRollupKind, now = new Date()) {
  return materializeDays(kind, getReportingDayBounds(now).start, getReportingDaysPerJob())
}

async function materializeDays(
  kind: ReportingRollupKind,
  today: Date,
  remaining: number,
): Promise<{ hasMore: boolean; nextDay: string }> {
  const nextDay = await runWithTransaction(undefined, async query => {
    await initializeReportingRollupCursors(query)
    const { rows } = await query<{ cursor_rollup_on: string }>(sql`/* nextReportingDay */
      SELECT cursor_rollup_on::text FROM reporting_daily_rollup_cursors WHERE kind = ${kind}
    `)
    const day = rows[0]!.cursor_rollup_on
    const bounds = getReportingDayBounds(day)
    if (bounds.start >= today) return day
    if (kind === 'growth') await recomputeGrowthDay(day, query)
    else await recomputeModeratorWorkloadDay(day, query)
    const next = await findNextReportingSourceDay(kind, bounds.end, query)
    await query(sql`/* advanceReportingDay */
      UPDATE reporting_daily_rollup_cursors SET cursor_rollup_on = ${next}::date WHERE kind = ${kind}
    `)
    return next
  })
  if (new Date(nextDay) >= today) return { hasMore: false, nextDay }
  if (remaining <= 1) return { hasMore: true, nextDay }
  return materializeDays(kind, today, remaining - 1)
}
