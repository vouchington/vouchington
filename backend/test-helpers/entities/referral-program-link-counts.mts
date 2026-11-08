import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function deactivateReferralLinkForCount(linkId: string): Promise<void> {
  await write(
    sql`/* deactivateReferralLinkForCount */
      UPDATE user_referral_program_links
      SET activated_at = NULL,
          deactivated_at = CURRENT_TIMESTAMP
      WHERE id = ${linkId}`,
  )
}

export async function readReferralProgramActiveLinkCount(topicId: string): Promise<number | null> {
  const { rows } = await read<{ active_link_count: number | string }>(
    sql`/* readReferralProgramActiveLinkCount */
      SELECT active_link_count
      FROM referral_program_topics
      WHERE topic_id = ${topicId}`,
  )
  const value = rows[0]?.active_link_count
  return value == null ? null : Number(value)
}

export async function readHighestActiveLinkCount(): Promise<number> {
  const { rows } = await read<{ max_count: number | string | null }>(
    sql`/* readHighestActiveLinkCount */
      SELECT COALESCE(MAX(active_link_count), 0) AS max_count
      FROM referral_program_link_counts`,
  )
  return Number(rows[0]?.max_count ?? 0)
}

export async function readReferralProgramRankedLinkCount(topicId: string): Promise<number | null> {
  const { rows } = await read<{ active_link_count: number }>(
    sql`/* readReferralProgramRankedLinkCount */
      SELECT active_link_count FROM referral_program_link_counts
      WHERE topic_id = ${topicId} LIMIT 1`,
  )
  return rows[0]?.active_link_count ?? null
}

// Places owned programs at the front of the link-count keyset. The row trigger owns real
// increments; this setter only positions a page-fill fixture and the caller deletes those rows.
export async function setReferralProgramActiveLinkCountForTest(
  topicId: string,
  activeLinkCount: number,
): Promise<void> {
  await write(
    sql`/* setReferralProgramActiveLinkCountForTest */
      UPDATE referral_program_topics
      SET active_link_count = ${activeLinkCount}
      WHERE topic_id = ${topicId}`,
  )
}
