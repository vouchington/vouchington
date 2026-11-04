import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type LandingPageCandidateId = { id: string; tier: number; sort_order: number | null }

/** Select a bounded page of entities before loading review ratings or media projections. */
export async function getLandingPageCandidateIds(
  userId: string,
  limit: number,
  cursor: LandingPageCandidateId | null,
): Promise<LandingPageCandidateId[]> {
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
      -- no-mistakes-disable-next-line postgres-required-predicates: owned review candidates span post-id partitions; the author index and bounded keyset preserve older candidates
      SELECT post.id, 1 AS tier, NULL::integer AS sort_order FROM posts post
      JOIN view_public_post_eligibility eligibility ON eligibility.post_id = post.id
      WHERE post.created_by_id = ${userId} AND post.post_type = 'review'
        AND ${cursor === null || cursor.tier >= 1}`)
  if (cursor?.tier === 1) query.append(sql` AND post.id < ${cursor.id}::uuid`)
  query.append(sql`
      ORDER BY post.id DESC LIMIT ${limit}
    ), referral_links AS MATERIALIZED (
      -- no-mistakes-disable-next-line postgres-required-predicates: topic merges repoint referral-program owners; deletion remains checked
      SELECT link.id, 0 AS tier, NULL::integer AS sort_order FROM user_referral_program_links link
      JOIN topics topic ON topic.id = link.referral_program_topic_id
      WHERE link.user_id = ${userId} AND link.deleted_at IS NULL
        AND link.activated_at IS NOT NULL AND link.deactivated_at IS NULL
        AND topic.deleted_at IS NULL`)
  if (cursor?.tier === 0) query.append(sql` AND link.id < ${cursor.id}::uuid`)
  query.append(sql`
      ORDER BY link.id DESC LIMIT ${limit}
    )
    SELECT id, tier, sort_order FROM (
      SELECT id, tier, sort_order FROM profile_links
      UNION ALL SELECT id, tier, sort_order FROM reviews
      UNION ALL SELECT id, tier, sort_order FROM referral_links
    ) candidates
    ORDER BY tier DESC, sort_order ASC NULLS LAST, CASE WHEN tier = 2 THEN id END ASC, id DESC
    LIMIT ${limit}
  `)
  const { rows } = await read<LandingPageCandidateId>(query)
  return rows
}
