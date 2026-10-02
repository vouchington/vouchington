import { write } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'

/**
 * Marks a possible re-upload reviewed so it leaves the staff queue. Staff decide by looking at the
 * case and the upload; this only records that they did. Returns false when the match was already
 * reviewed. Throws 404 when the match does not belong to the notice.
 */
export async function reviewCopyrightStaydownMatch(input: {
  noticeId: string
  matchId: string
  actorUserId: string
}): Promise<boolean> {
  const { rows } = await write<{ owned: boolean; reviewed: boolean }>(sql`
    /* reviewCopyrightStaydownMatch */
    WITH owned AS (
      SELECT staydown_match.id
      FROM copyright_staydown_matches staydown_match
      JOIN copyright_staydown_entries entry
        ON entry.id = staydown_match.copyright_staydown_entry_id
      JOIN copyright_restrictions restriction ON restriction.id = entry.copyright_restriction_id
      JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE staydown_match.id = ${input.matchId} AND target.copyright_notice_id = ${input.noticeId}
    ), reviewed AS (
      UPDATE copyright_staydown_matches
      SET reviewed_at = CURRENT_TIMESTAMP, reviewed_by_id = ${input.actorUserId}
      WHERE id IN (SELECT id FROM owned) AND reviewed_at IS NULL
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM owned) AS owned, EXISTS (SELECT 1 FROM reviewed) AS reviewed
  `)
  assert(rows[0]?.owned, 404, 'Possible re-upload not found')
  return rows[0].reviewed
}
