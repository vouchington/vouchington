import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { CopyrightStaffCase } from './read-models-staff-types.mts'

/** Unreviewed uploads that matched an image this case confirmed as infringing, oldest first. */
export async function selectStaffStaydownMatches(
  noticeId: string,
  query: TransactionQuery,
): Promise<CopyrightStaffCase['staydown_matches']> {
  const { rows } = await query<CopyrightStaffCase['staydown_matches'][number]>(sql`
    /* getPendingCopyrightStaffCase:staydownMatches */
    SELECT staydown_match.id, staydown_match.image_id, entry.image_id AS registered_image_id,
      staydown_match.uploaded_by_id, staydown_match.match_kind, staydown_match.hamming_distance,
      staydown_match.created_at AS matched_at
    FROM copyright_staydown_matches staydown_match
    JOIN copyright_staydown_entries entry ON entry.id = staydown_match.copyright_staydown_entry_id
    JOIN copyright_restrictions restriction ON restriction.id = entry.copyright_restriction_id
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE target.copyright_notice_id = ${noticeId} AND staydown_match.reviewed_at IS NULL
    ORDER BY staydown_match.id
  `)
  return rows
}
