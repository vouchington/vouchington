import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { recordTestPostModerationDisposition } from './entities/post-moderation.mts'

export async function markModerationReportReviewedForTest(params: {
  reportId: string
  resolvedById: string
}): Promise<void> {
  await write(sql`/* markModerationReportReviewedForTest */
    UPDATE moderation_reports
    SET reviewed_at = CURRENT_TIMESTAMP,
      resolution_action = 'reviewed',
      resolved_by_id = ${params.resolvedById}
    WHERE id = ${params.reportId}
  `)
}

export async function setPostModerationFlaggedForTest(params: {
  postId: string
  flagged: boolean
}): Promise<void> {
  await recordTestPostModerationDisposition({
    postId: params.postId,
    source: 'openai_omni',
    disposition: params.flagged ? 'review' : 'pass',
    reasonCode: params.flagged ? 'provider_flagged' : 'provider_pass',
  })
  await write(sql`/* setPostModerationFlaggedForTest */
    UPDATE posts
    SET approved_at = CASE WHEN ${params.flagged} THEN NULL ELSE CURRENT_TIMESTAMP END,
      rejected_at = NULL,
      in_review_at = CASE WHEN ${params.flagged} THEN CURRENT_TIMESTAMP ELSE NULL END
    WHERE id = ${params.postId}
  `)
}

export async function countPostReviewTopicRatingsForTest(postId: string): Promise<number> {
  const { rows } = await read<{ total: number }>(sql`/* countPostReviewTopicRatingsForTest */
    SELECT COUNT(*)::int AS total
    FROM post_review_topic_ratings
    WHERE post_id = ${postId}
  `)
  return rows[0]?.total ?? 0
}

export async function getModeratorActionRowsForTest(params: {
  actorId?: string
  communityId?: string
  postId?: string
  targetUserId?: string
}): Promise<
  Array<{
    id: string
    community_id: string | null
    actor_user_id: string | null
    action_type: string
    post_id: string | null
    target_user_id: string | null
    report_id: string | null
    review_dispute_id: string | null
    community_application_id: string | null
    reason: string | null
    metadata: Record<string, unknown>
    created_at: string
  }>
> {
  const query = sql`/* getModeratorActionRowsForTest */
    SELECT id, community_id, actor_user_id, action_type, post_id, target_user_id,
           report_id, review_dispute_id, community_application_id, reason, metadata, created_at
    FROM moderator_actions
    WHERE TRUE
  `
  if (params.actorId !== undefined) {
    query.append(sql` AND actor_user_id = ${params.actorId}`)
  }
  if (params.communityId !== undefined) {
    query.append(sql` AND community_id = ${params.communityId}`)
  }
  if (params.postId !== undefined) {
    query.append(sql` AND post_id = ${params.postId}`)
  }
  if (params.targetUserId !== undefined) {
    query.append(sql` AND target_user_id = ${params.targetUserId}`)
  }
  query.append(sql` ORDER BY id DESC`)
  const { rows } = await read<{
    id: string
    community_id: string | null
    actor_user_id: string | null
    action_type: string
    post_id: string | null
    target_user_id: string | null
    report_id: string | null
    review_dispute_id: string | null
    community_application_id: string | null
    reason: string | null
    metadata: Record<string, unknown>
    created_at: string
  }>(query)
  return rows
}
