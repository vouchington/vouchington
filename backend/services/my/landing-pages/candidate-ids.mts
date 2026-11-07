import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type LandingPageCandidateId = { id: string; tier: number; sort_order: number | null }

/** Walk the shared candidate order, checking each concrete source before the final page limit. */
export async function getLandingPageCandidateIds(
  userId: string,
  limit: number,
  cursor: LandingPageCandidateId | null,
): Promise<LandingPageCandidateId[]> {
  const query = sql`/* getLandingPageCandidateIds */
    SELECT COALESCE(candidate.profile_link_id, candidate.review_post_id, candidate.referral_link_id) AS id,
      candidate.tier, candidate.sort_order
    FROM user_landing_page_candidates candidate
    WHERE candidate.user_id = ${userId}
      AND CASE candidate.tier
        WHEN 2 THEN (
          SELECT TRUE FROM user_profile_links link
          WHERE link.id = candidate.profile_link_id AND link.user_id = ${userId}
        )
        WHEN 1 THEN (
          SELECT TRUE FROM posts post
          WHERE post.id = candidate.review_post_id
            AND post.created_by_id = ${userId}
            AND post.post_type = 'review' AND post.deleted_at IS NULL
            AND EXISTS (
              SELECT 1 FROM view_public_post_eligibility eligibility WHERE eligibility.post_id = post.id
            )
        )
        WHEN 0 THEN (
          -- no-mistakes-disable-next-line postgres-required-predicates: topic merges repoint referral-program links; reference eligibility still excludes deleted topics
          SELECT TRUE FROM user_referral_program_links link
          JOIN topics topic ON topic.id = link.referral_program_topic_id
          WHERE link.id = candidate.referral_link_id AND link.user_id = ${userId}
            AND link.deleted_at IS NULL AND link.activated_at IS NOT NULL AND link.deactivated_at IS NULL
            AND topic.deleted_at IS NULL
        )
      END
  `
  if (cursor) {
    const sourceKey = Buffer.from(cursor.id.replaceAll('-', ''), 'hex')
    const sortKey = cursor.tier === 2 ? sourceKey : sourceKey.map(byte => 255 - byte)
    query.append(sql`
      AND (candidate.tier_sort, candidate.position_sort, candidate.source_sort_key)
        > (${-cursor.tier}, ${cursor.sort_order ?? 0}::bigint, ${sortKey})
    `)
  }
  query.append(sql`
    ORDER BY candidate.tier_sort, candidate.position_sort, candidate.source_sort_key
    LIMIT ${limit}
  `)
  const { rows } = await read<LandingPageCandidateId>(query)
  return rows
}
