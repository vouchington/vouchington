import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type LandingPageCandidateId = { id: string; tier: number }

/** Select a bounded page of entities before loading review ratings or media projections. */
export async function getLandingPageCandidateIds(
  userId: string,
  limit: number,
  cursor: LandingPageCandidateId | null,
): Promise<LandingPageCandidateId[]> {
  const { rows } = await read<LandingPageCandidateId>(sql`/* getLandingPageCandidateIds */
    WITH profile_links AS MATERIALIZED (
      SELECT id, 2 AS tier FROM user_profile_links
      WHERE user_id = ${userId}
        AND (${cursor?.tier ?? 2} > 2 OR (${cursor?.tier ?? 2} = 2 AND (${cursor?.id ?? null}::uuid IS NULL OR id < ${cursor?.id ?? null}::uuid)))
      ORDER BY id DESC LIMIT ${limit}
    ), reviews AS MATERIALIZED (
      -- no-mistakes-disable-next-line postgres-required-predicates: owned review candidates span post-id partitions; the author index and bounded keyset preserve older candidates
      SELECT post.id, 1 AS tier FROM posts post
      JOIN view_public_post_eligibility eligibility ON eligibility.post_id = post.id
      WHERE post.created_by_id = ${userId} AND post.post_type = 'review'
        AND (${cursor?.tier ?? 2} > 1 OR (${cursor?.tier ?? 2} = 1 AND post.id < ${cursor?.id ?? null}::uuid))
      ORDER BY post.id DESC LIMIT ${limit}
    ), referral_links AS MATERIALIZED (
      -- no-mistakes-disable-next-line postgres-required-predicates: topic merges repoint referral-program owners; deletion remains checked
      SELECT link.id, 0 AS tier FROM user_referral_program_links link
      JOIN topics topic ON topic.id = link.referral_program_topic_id
      WHERE link.user_id = ${userId} AND link.deleted_at IS NULL
        AND link.activated_at IS NOT NULL AND link.deactivated_at IS NULL
        AND topic.deleted_at IS NULL
        AND (${cursor?.tier ?? 2} > 0 OR (${cursor?.tier ?? 2} = 0 AND link.id < ${cursor?.id ?? null}::uuid))
      ORDER BY link.id DESC LIMIT ${limit}
    )
    SELECT id, tier FROM (
      SELECT id, tier FROM profile_links UNION ALL SELECT id, tier FROM reviews
      UNION ALL SELECT id, tier FROM referral_links
    ) candidates ORDER BY tier DESC, id DESC LIMIT ${limit}
  `)
  return rows
}
