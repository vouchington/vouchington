import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { groupByNotice } from './read-models-staff-group.mts'
import type { CopyrightStaffCase } from './read-models-staff-types.mts'

const MATCHES_PER_CASE = 25

/** Unreviewed uploads that matched an image each case confirmed as infringing, oldest first. */
export async function selectStaffStaydownMatches(
  noticeIds: readonly string[],
  query: TransactionQuery,
) {
  const { rows } = await query<
    CopyrightStaffCase['staydown_matches'][number] & { copyright_notice_id: string }
  >(sql`
    /* getPendingCopyrightStaffCase:staydownMatches */
    SELECT requested.notice_id AS copyright_notice_id, match.id, match.image_id,
      match.registered_image_id, match.uploaded_by_id, match.match_kind,
      match.hamming_distance, match.matched_at
    FROM unnest(${noticeIds}::uuid[]) AS requested(notice_id)
    CROSS JOIN LATERAL (
      SELECT staydown_match.id, staydown_match.image_id,
        entry.image_id AS registered_image_id,
        staydown_match.uploaded_by_id, staydown_match.match_kind,
        staydown_match.hamming_distance, staydown_match.created_at AS matched_at
      FROM copyright_staydown_matches staydown_match
      JOIN copyright_staydown_entries entry ON entry.id = staydown_match.copyright_staydown_entry_id
      JOIN copyright_restrictions restriction ON restriction.id = entry.copyright_restriction_id
      JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE target.copyright_notice_id = requested.notice_id
        AND staydown_match.reviewed_at IS NULL
      ORDER BY staydown_match.id
      LIMIT ${MATCHES_PER_CASE + 1}
    ) AS match
  `)
  const grouped = groupByNotice(rows)
  return new Map(
    [...grouped].map(([noticeId, matches]) => [
      noticeId,
      { matches: matches.slice(0, MATCHES_PER_CASE), hasMore: matches.length > MATCHES_PER_CASE },
    ]),
  )
}
