import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  MODERATION_SUMMARY_ZERO_ID,
  type ModerationSummaryScan,
} from '@queues/background/enqueues/moderation-summary-state'
import {
  capModerationSummaryCount,
  startModerationSummarySource,
  type PageStep,
} from './moderation-summary-pages.mts'

export async function collectModerationSummaryMemberPage(
  scan: ModerationSummaryScan,
  startId: string,
  endId: string,
  start: Date,
  end: Date,
  size: number,
): Promise<PageStep<ModerationSummaryScan>> {
  const upperId = await readMemberUpper(scan)
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
  let { new_members, departed_members, total_active_members, active_member_count } = scan.metrics
  for (const row of rows) {
    if (row.user_live && row.id >= startId && row.id < endId)
      new_members = capModerationSummaryCount(new_members)
    if (row.removed_at && new Date(row.removed_at) >= start && new Date(row.removed_at) < end)
      departed_members = capModerationSummaryCount(departed_members)
    if (row.removed_at === null) {
      if (row.user_live) total_active_members = capModerationSummaryCount(total_active_members)
      // Intentional: the baseline engagement count does not filter deleted users.
      if (row.engaged) active_member_count = capModerationSummaryCount(active_member_count)
    }
  }
  const state = {
    ...scan,
    afterId: rows.at(-1)?.id ?? scan.afterId,
    sourceUpperId: upperId,
    metrics: {
      ...scan.metrics,
      new_members,
      departed_members,
      total_active_members,
      active_member_count,
    },
  }
  return rows.length < size ||
    [new_members, departed_members, total_active_members, active_member_count].every(n => n === 100)
    ? { state: startModerationSummarySource(state), next: 'activityPosts' }
    : { state, next: null }
}

async function readMemberUpper(scan: ModerationSummaryScan): Promise<string> {
  if (scan.sourceUpperId !== null) return scan.sourceUpperId
  const { rows } = await read<{ id: string }>(sql`/* moderationSummaryCommunityMemberUpper */
      SELECT id FROM community_members WHERE community_id=${scan.communityId}
      ORDER BY community_id DESC,id DESC LIMIT 1`)
  return rows[0]?.id ?? MODERATION_SUMMARY_ZERO_ID
}

export async function collectModerationSummaryActivityPostPage(
  scan: ModerationSummaryScan,
  startId: string,
  endId: string,
  size: number,
): Promise<PageStep<ModerationSummaryScan>> {
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
  let { new_discussion_posts, new_review_posts, new_data_point_posts } = scan.metrics
  let bestDiscussion = scan.bestDiscussion
  let afterId = scan.afterId
  for (const row of rows) {
    afterId = row.id
    if (row.deleted_at !== null) continue
    if (row.post_type === 'discussion')
      new_discussion_posts = capModerationSummaryCount(new_discussion_posts)
    if (row.post_type === 'review') new_review_posts = capModerationSummaryCount(new_review_posts)
    if (row.post_type === 'data_point')
      new_data_point_posts = capModerationSummaryCount(new_data_point_posts)
    // First ascending discussion with a saturated reply count wins every later tie.
    if (row.post_type === 'discussion' && bestDiscussion?.replies !== 100) {
      if (!row.has_children) {
        bestDiscussion ??= { id: row.id, replies: 0 }
        continue
      }
      return {
        state: {
          ...scan,
          afterId,
          parentId: row.id,
          afterChildId: MODERATION_SUMMARY_ZERO_ID,
          childCount: 0,
          metrics: {
            ...scan.metrics,
            new_discussion_posts,
            new_review_posts,
            new_data_point_posts,
          },
          bestDiscussion,
        },
        next: 'replies',
      }
    }
  }
  const state = {
    ...scan,
    afterId,
    metrics: { ...scan.metrics, new_discussion_posts, new_review_posts, new_data_point_posts },
    bestDiscussion,
  }
  return { state, next: rows.length < size ? 'card' : null }
}

export async function collectModerationSummaryReplyPage(
  scan: ModerationSummaryScan,
  endId: string,
  size: number,
): Promise<PageStep<ModerationSummaryScan>> {
  const { rows } = await read<{
    id: string
    post_type: string
    deleted_at: Date | null
  }>(sql`/* collectModerationSummaryReplyPage */
    SELECT id,post_type,deleted_at FROM posts WHERE parent_post_id=${scan.parentId}
      AND id>${scan.parentId} AND id>${scan.afterChildId} AND id<${endId}
    ORDER BY id LIMIT ${size}`)
  const liveReplies = rows.filter(row => row.post_type === 'comment' && row.deleted_at === null)
  const childCount = Math.min(100, scan.childCount + liveReplies.length)
  const state = { ...scan, afterChildId: rows.at(-1)?.id ?? scan.afterChildId, childCount }
  if (rows.length < size || childCount === 100) {
    const best = scan.bestDiscussion
    const wins =
      !best ||
      childCount > best.replies ||
      (childCount === best.replies && scan.parentId! < best.id)
    return {
      state: {
        ...state,
        bestDiscussion: wins ? { id: scan.parentId!, replies: childCount } : best,
        parentId: null,
        sourceUpperId: null,
      },
      next: 'activityPosts',
    }
  }
  return { state, next: null }
}
