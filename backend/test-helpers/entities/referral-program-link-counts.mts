import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readReferralProgramRankedLinkCount(topicId: string): Promise<number | null> {
  const { rows } = await read<{ active_link_count: number | string }>(
    sql`/* readReferralProgramRankedLinkCount */
      SELECT active_link_count FROM mv_referral_program_link_counts
      WHERE topic_id = ${topicId}`,
  )
  const count = rows[0]?.active_link_count
  return count == null ? null : Number(count)
}
