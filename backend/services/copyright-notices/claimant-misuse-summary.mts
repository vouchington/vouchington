import { read } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { ClaimantMisuseEvent } from './claimant-misuse-ledger.mts'

/** How many of one claimant's notices ended in each misuse outcome. */
export type ClaimantMisuseSummary = Record<ClaimantMisuseEvent['outcome'], number>

type SummaryQuery = (
  statement: SQLStatement,
) => Promise<{ rows: Array<{ outcome: ClaimantMisuseEvent['outcome']; notices: number }> }>

/**
 * Staff-facing ledger summary for one claimant account. Counts notices, not events, so a notice
 * with several reversed restrictions is one outcome. It informs a moderator's decision about a
 * warned suspension; nothing reads it to act automatically.
 */
export async function readClaimantMisuseSummary(
  claimantUserId: string,
  query: SummaryQuery = statement => read(statement),
): Promise<ClaimantMisuseSummary> {
  const { rows } = await query(sql`/* readClaimantMisuseSummary */
    SELECT event.outcome, count(DISTINCT event.copyright_notice_id)::int AS notices
    FROM copyright_notices notice
    JOIN copyright_claimant_misuse_events event ON event.copyright_notice_id = notice.id
    WHERE notice.claimant_user_id = ${claimantUserId}
    GROUP BY event.outcome
  `)
  const summary: ClaimantMisuseSummary = {
    notice_withdrawn: 0,
    notice_rejected: 0,
    restriction_reversed_by_counter_notice: 0,
    restriction_reversed_by_appeal: 0,
  }
  for (const row of rows) summary[row.outcome] = row.notices
  return summary
}
