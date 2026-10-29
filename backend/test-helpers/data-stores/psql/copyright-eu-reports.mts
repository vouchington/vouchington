import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Counts snapshots for one randomized exact period without retaining staff identity. */
export async function countEuTransparencyReportsInPeriod(
  periodStartedAt: Date,
  periodEndedAt: Date,
): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* countEuTransparencyReportsInPeriod */
    SELECT count(*)::integer AS count
    FROM copyright_eu_transparency_reports
    WHERE period_started_at = ${periodStartedAt}
      AND period_ended_at = ${periodEndedAt}
  `)
  return rows[0]?.count ?? 0
}
