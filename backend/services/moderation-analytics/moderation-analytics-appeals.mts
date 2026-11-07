import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getCommunityId } from './moderation-analytics-scope.mts'
import type { AppealMetrics, ModerationAnalyticsScope, NewUserFrictionMetrics } from './types.mts'

export async function getAppeals(
  periodStart: Date,
  scope: ModerationAnalyticsScope,
): Promise<AppealMetrics> {
  const communityId = getCommunityId(scope)
  const { rows } = await read(sql`/* getModerationAppeals */
    SELECT
      COUNT(*) FILTER (WHERE resolved_at IS NOT NULL)::INT AS total_closed,
      COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND resolution_action = 'accept')::INT AS accepted,
      COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND resolution_action = 'reduce')::INT AS reduced,
      COUNT(*) FILTER (WHERE resolution_action = 'deny')::INT AS denied
    FROM moderation_appeals
    WHERE resolved_at >= ${periodStart}
      AND (${communityId}::uuid IS NULL OR community_id = ${communityId}::uuid)
  `)

  const row = rows[0]!
  const totalClosed = (row.total_closed as number) ?? 0
  const accepted = (row.accepted as number) ?? 0
  const reduced = (row.reduced as number) ?? 0

  return {
    total_closed: totalClosed,
    accepted,
    reduced,
    denied: (row.denied as number) ?? 0,
    success_rate: totalClosed > 0 ? (accepted + reduced) / totalClosed : null,
  }
}

export async function getNewUserFriction(
  periodStartUuid: string,
  scope: ModerationAnalyticsScope,
): Promise<NewUserFrictionMetrics> {
  const communityId = getCommunityId(scope)
  const { rows } = await read(sql`/* getModerationNewUserFriction */
    WITH first_posts AS (
      SELECT
        p.id,
        p.rejected_at,
        p.deleted_at,
        p.deleted_by_id,
        p.created_by_id,
        cpr.rejected_at AS community_rejected_at,
        cpr.unpublished_at AS community_unpublished_at
      FROM posts p
      LEFT JOIN community_post_reviews cpr ON cpr.post_id = p.id
      WHERE p.id >= ${periodStartUuid}::uuid
        AND p.created_by_id != '00000000-0000-7000-8000-000000000000'::uuid
        AND (${communityId}::uuid IS NULL OR p.community_id = ${communityId}::uuid)
        AND NOT EXISTS (
          SELECT 1
          FROM posts prior
          WHERE prior.created_by_id = p.created_by_id
            AND prior.id < p.id
            AND (${communityId}::uuid IS NULL OR prior.community_id = ${communityId}::uuid)
        )
    )
    SELECT
      COUNT(*)::INT AS first_posts,
      COUNT(*) FILTER (
        WHERE rejected_at IS NOT NULL
          OR community_rejected_at IS NOT NULL
          OR community_unpublished_at IS NOT NULL
          OR (deleted_at IS NOT NULL AND deleted_by_id != created_by_id)
      )::INT AS rejected_first_posts
    FROM first_posts
  `)

  const row = rows[0]!
  const firstPosts = (row.first_posts as number) ?? 0
  const rejectedFirstPosts = (row.rejected_first_posts as number) ?? 0

  return {
    first_posts: firstPosts,
    rejected_first_posts: rejectedFirstPosts,
    rejection_rate: firstPosts > 0 ? rejectedFirstPosts / firstPosts : null,
  }
}
