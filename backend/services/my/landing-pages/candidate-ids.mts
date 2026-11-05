import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type LandingPageCandidateId = { id: string; tier: number; sort_order: number | null }

export type LandingPageCandidateRow = LandingPageCandidateId & { kept: boolean }

/** Select a bounded page of entities before loading review ratings or media projections. */
export async function getLandingPageCandidateIds(
  userId: string,
  limit: number,
  cursor: LandingPageCandidateId | null,
): Promise<LandingPageCandidateRow[]> {
  const query = sql`/* getLandingPageCandidateIds */
    WITH profile_links AS MATERIALIZED (
      SELECT id, 2 AS tier, sort_order FROM user_profile_links
      WHERE user_id = ${userId} AND ${cursor === null || cursor.tier === 2}`
  if (cursor?.tier === 2) {
    query.append(sql` AND (sort_order, id) > (${cursor.sort_order}::bigint, ${cursor.id}::uuid)`)
  }
  query.append(sql`
      ORDER BY sort_order ASC, id ASC LIMIT ${limit}
    ), reviews AS MATERIALIZED (
      SELECT post.id, 1 AS tier, NULL::integer AS sort_order FROM posts post
      WHERE post.created_by_id = ${userId} AND post.post_type = 'review'
        AND ${cursor === null || cursor.tier >= 1}`)
  if (cursor?.tier === 1) query.append(sql` AND post.id < ${cursor.id}::uuid`)
  query.append(sql`
      ORDER BY post.id DESC LIMIT ${limit}
    ), referral_links AS MATERIALIZED (
      -- no-mistakes-disable-next-line postgres-required-predicates: topic merges repoint referral-program owners; deletion remains checked
      SELECT link.id, 0 AS tier, NULL::integer AS sort_order, link.referral_program_topic_id
      FROM user_referral_program_links link
      WHERE link.user_id = ${userId} AND link.deleted_at IS NULL
        AND link.activated_at IS NOT NULL AND link.deactivated_at IS NULL`)
  if (cursor?.tier === 0) query.append(sql` AND link.id < ${cursor.id}::uuid`)
  query.append(sql`
      ORDER BY link.id DESC LIMIT ${limit}
    )
    SELECT id, tier, sort_order, kept FROM (
      SELECT id, tier, sort_order, TRUE AS kept FROM profile_links
      UNION ALL
      SELECT reviews.id, reviews.tier, reviews.sort_order, (eligibility.post_id IS NOT NULL) AS kept
      FROM reviews
      LEFT JOIN view_public_post_eligibility eligibility ON eligibility.post_id = reviews.id
      UNION ALL
      SELECT referral_links.id, referral_links.tier, referral_links.sort_order,
        (topic.id IS NOT NULL) AS kept
      FROM referral_links
      LEFT JOIN topics topic
        ON topic.id = referral_links.referral_program_topic_id AND topic.deleted_at IS NULL
    ) candidates
    ORDER BY tier DESC, sort_order ASC NULLS LAST, CASE WHEN tier = 2 THEN id END ASC, id DESC
    LIMIT ${limit}
  `)
  const { rows } = await read<LandingPageCandidateRow>(query)
  return rows
}
