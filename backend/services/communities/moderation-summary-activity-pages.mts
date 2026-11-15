import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  MODERATION_SUMMARY_ZERO_ID,
  type ModerationSummaryScan,
} from '@queues/background/enqueues/moderation-summary-state'

export async function collectModerationSummaryMemberPage(
  scan: ModerationSummaryScan,
  startId: string,
  endId: string,
  start: Date,
  end: Date,
  size: number,
): Promise<void> {
  if (scan.sourceUpperId === null) {
    const { rows } = await read<{ id: string }>(sql`/* moderationSummaryCommunityMemberUpper */
      SELECT id FROM community_members WHERE community_id=${scan.communityId}
      ORDER BY community_id DESC,id DESC LIMIT 1`)
    scan.sourceUpperId = rows[0]?.id ?? MODERATION_SUMMARY_ZERO_ID
  }
  const upperId = scan.sourceUpperId
  const { rows } = await read<{
    id: string
    removed_at: Date | null
    user_live: boolean
    engaged: boolean
  }>(sql`/* collectModerationSummaryMemberPage */
    SELECT member.id,member.removed_at,
      COALESCE((SELECT account.deleted_at IS NULL FROM users account WHERE account.id=member.user_id),FALSE) AS user_live,
      COALESCE((SELECT TRUE FROM posts post WHERE (post.created_by_id,post.community_id,post.id)>=(member.user_id,${scan.communityId},${startId})
        AND (post.created_by_id,post.community_id,post.id)<(member.user_id,${scan.communityId},${endId}) AND post.id>=${startId} AND post.deleted_at IS NULL ORDER BY post.created_by_id,post.community_id,post.id LIMIT 1),FALSE) AS engaged
    FROM community_members member WHERE member.community_id=${scan.communityId}
      AND (member.community_id,member.id)>(${scan.communityId},${scan.afterId})
      AND (member.community_id,member.id)<=(${scan.communityId},${upperId})
    ORDER BY member.community_id,member.id LIMIT ${size}`)
  const metrics = scan.metrics
  for (const row of rows) {
    scan.afterId = row.id
    if (row.user_live && row.id >= startId && row.id < endId)
      metrics.new_members = Math.min(100, metrics.new_members + 1)
    if (row.removed_at && new Date(row.removed_at) >= start && new Date(row.removed_at) < end)
      metrics.departed_members = Math.min(100, metrics.departed_members + 1)
    if (row.removed_at === null) {
      if (row.user_live)
        metrics.total_active_members = Math.min(100, metrics.total_active_members + 1)
      // Intentional: the baseline engagement count does not filter deleted users.
      if (row.engaged) metrics.active_member_count = Math.min(100, metrics.active_member_count + 1)
    }
  }
  if (
    rows.length < size ||
    [
      metrics.new_members,
      metrics.departed_members,
      metrics.total_active_members,
      metrics.active_member_count,
    ].every(n => n === 100)
  ) {
    scan.sourceUpperId = null
    scan.stage = 'activity-posts'
    scan.afterId = MODERATION_SUMMARY_ZERO_ID
  }
}

export async function collectModerationSummaryActivityPostPage(
  scan: ModerationSummaryScan,
  startId: string,
  endId: string,
  size: number,
): Promise<void> {
  const lower =
    scan.afterId >= startId
      ? sql`(post.community_id,post.id)>(${scan.communityId},${scan.afterId})`
      : sql`(post.community_id,post.id)>=(${scan.communityId},${startId})`
  const { rows } = await read<{
    id: string
    post_type: string
    deleted_at: Date | null
    has_children: boolean
  }>(
    sql`/* collectModerationSummaryActivityPostPage */
    SELECT post.id,post.post_type,post.deleted_at,COALESCE((SELECT TRUE FROM posts reply
        WHERE reply.parent_post_id=post.id AND reply.id>post.id AND reply.id<${endId}
        ORDER BY reply.id LIMIT 1),FALSE) AS has_children
    FROM posts post WHERE post.community_id IS NOT NULL AND post.id>=${startId} AND `.append(lower)
      .append(sql`
      AND (post.community_id,post.id)<(${scan.communityId},${endId})
    ORDER BY post.community_id,post.id LIMIT ${size}`),
  )
  for (const row of rows) {
    scan.afterId = row.id
    if (row.deleted_at !== null) continue
    if (row.post_type === 'discussion')
      scan.metrics.new_discussion_posts = Math.min(100, scan.metrics.new_discussion_posts + 1)
    if (row.post_type === 'review')
      scan.metrics.new_review_posts = Math.min(100, scan.metrics.new_review_posts + 1)
    if (row.post_type === 'data_point')
      scan.metrics.new_data_point_posts = Math.min(100, scan.metrics.new_data_point_posts + 1)
    // First ascending discussion with a saturated reply count wins every later tie.
    if (row.post_type === 'discussion' && scan.bestDiscussion?.replies !== 100) {
      if (!row.has_children) {
        if (!scan.bestDiscussion) scan.bestDiscussion = { id: row.id, replies: 0 }
        continue
      }
      scan.parentId = row.id
      scan.afterChildId = MODERATION_SUMMARY_ZERO_ID
      scan.childCount = 0
      scan.stage = 'replies'
      return
    }
  }
  if (rows.length < size) scan.stage = 'complete'
}

export async function collectModerationSummaryReplyPage(
  scan: ModerationSummaryScan,
  endId: string,
  size: number,
): Promise<void> {
  const { rows } = await read<{
    id: string
    post_type: string
    deleted_at: Date | null
  }>(sql`/* collectModerationSummaryReplyPage */
    SELECT id,post_type,deleted_at FROM posts WHERE parent_post_id=${scan.parentId}
      AND id>${scan.parentId} AND id>${scan.afterChildId} AND id<${endId}
    ORDER BY id LIMIT ${size}`)
  for (const row of rows) {
    scan.afterChildId = row.id
    if (row.post_type === 'comment' && row.deleted_at === null)
      scan.childCount = Math.min(100, scan.childCount + 1)
  }
  if (rows.length < size || scan.childCount === 100) {
    if (
      !scan.bestDiscussion ||
      scan.childCount > scan.bestDiscussion.replies ||
      (scan.childCount === scan.bestDiscussion.replies && scan.parentId! < scan.bestDiscussion.id)
    )
      scan.bestDiscussion = { id: scan.parentId!, replies: scan.childCount }
    scan.parentId = null
    scan.sourceUpperId = null
    scan.stage = 'activity-posts'
  }
}
