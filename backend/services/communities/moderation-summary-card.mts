import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getSiteUrl } from '@modules/utils'
import type { CommunityModerationSummaryEmailProps } from '@email-templates/core'
import type { ModerationSummaryBestDiscussion } from '@queues/background/enqueues/moderation-summary-state'
type Card = CommunityModerationSummaryEmailProps['communities'][number]
export function toCard(
  row: Record<string, string | number>,
  discussion: ModerationSummaryBestDiscussion | null,
  title: string | null,
): Card {
  const n = (key: string) => Number(row[key])
  const active = n('active_member_count')
  const joined = n('new_members')
  const left = n('departed_members')
  const total = n('total_active_members')
  return {
    communityId: String(row.id),
    name: String(row.name),
    url: getSiteUrl(`/communities/${row.slug}/settings/moderation`),
    pendingPostReviews: n('pending_post_reviews'),
    pendingApplications: n('pending_applications'),
    pendingReports: n('pending_reports'),
    escalatedItems: n('escalated_items'),
    suspectedBanEvaders: n('suspected_ban_evaders'),
    newMembers: joined,
    departedMembers: left,
    netMemberChange: joined < 100 && left < 100 ? joined - left : null,
    totalActiveMembers: total,
    newDiscussionPosts: n('new_discussion_posts'),
    newReviewPosts: n('new_review_posts'),
    newDataPointPosts: n('new_data_point_posts'),
    topDiscussionTitle: title,
    topDiscussionReplyCount: title === null ? 0 : (discussion?.replies ?? 0),
    activeMemberCount: active,
    activeMemberRate: active < 100 && total < 100 ? (total > 0 ? active / total : 0) : null,
  }
}

export async function readDiscussionTitle(
  communityId: string,
  postId: string | null,
): Promise<string | null> {
  if (postId === null) return null
  const { rows } = await read<{ title: string }>(
    sql`/* readModerationSummaryDiscussionTitle */
    SELECT p.title FROM posts p JOIN communities c ON c.id=p.community_id
      AND c.deleted_at IS NULL AND c.archived_at IS NULL
    WHERE p.id=${postId} AND p.community_id=${communityId}
      AND p.post_type='discussion' AND p.deleted_at IS NULL LIMIT 1`,
    { readOnly: false },
  )
  return rows[0]?.title ?? null
}
