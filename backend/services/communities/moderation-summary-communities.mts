import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getSiteUrl } from '@modules/utils'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import type { CommunityModerationSummaryEmailProps } from '@email-templates/core'
import { hasModerationSummaryWork } from './moderation-summary-schedule.mts'
import { communityModerationSummarySelect } from './moderation-summary-community-select.mts'

function communityModerationSummaryTopDiscussion(windowStartId: string, windowEndId: string) {
  return sql`
    LEFT JOIN LATERAL (
      SELECT
        top_post.title,
        COUNT(reply.id)::int AS reply_count
      FROM posts top_post
      LEFT JOIN posts reply
        ON reply.parent_post_id = top_post.id
        AND reply.post_type = 'comment'
        AND reply.id > top_post.id
        AND reply.id < ${windowEndId}
        AND reply.deleted_at IS NULL
      WHERE top_post.community_id = c.id
        AND top_post.post_type = 'discussion'
        AND top_post.id >= ${windowStartId}
        AND top_post.id < ${windowEndId}
        AND top_post.deleted_at IS NULL
      GROUP BY top_post.id, top_post.title
      ORDER BY reply_count DESC, top_post.id ASC
      LIMIT 1
    ) top_discussion ON TRUE`
}

function communityModerationSummaryMembership(userId: string, eligibilityAt: Date) {
  return sql`
    WHERE cm.user_id = ${userId}
      AND cm.removed_at IS NULL
      AND cm.role IN ('owner', 'moderator')
      AND (
        NOT cm.should_suppress_community_digests_while_on_vacation
        OR NOT EXISTS (
        SELECT 1
        FROM community_member_vacations v
        WHERE v.community_id = cm.community_id
          AND v.user_id = cm.user_id
          AND v.starts_at <= ${eligibilityAt}::timestamptz
          AND (v.ends_at IS NULL OR v.ends_at > ${eligibilityAt}::timestamptz)
        )
      )
    ORDER BY c.name ASC, c.id ASC`
}

export async function getCommunityModerationSummaryCommunities(
  userId: string,
  windowStart: Date,
  activityWindowEnd: Date,
  eligibilityAt: Date,
): Promise<CommunityModerationSummaryEmailProps['communities']> {
  // Vacation eligibility belongs to the queued period; activity reads may stop earlier
  // when a worker clock trails the dispatcher clock.
  const windowStartId = timestampToUuidv7LowerBound(windowStart.getTime())
  const windowEndId = timestampToUuidv7LowerBound(activityWindowEnd.getTime())
  const { rows } = await read(
    sql`/* getCommunityModerationSummaryCommunities */`
      .append(
        communityModerationSummarySelect(
          windowStartId,
          windowEndId,
          windowStart,
          activityWindowEnd,
        ),
      )
      .append(communityModerationSummaryTopDiscussion(windowStartId, windowEndId))
      .append(communityModerationSummaryMembership(userId, eligibilityAt)),
  )

  const communities: CommunityModerationSummaryEmailProps['communities'] = []
  for (const row of rows) {
    const totalActiveMembers = row.total_active_members as number
    const activeMemberCount = row.active_member_count as number
    const community = {
      name: row.name as string,
      url: getSiteUrl(`/communities/${row.slug as string}`),
      pendingPostReviews: row.pending_post_reviews as number,
      pendingApplications: row.pending_applications as number,
      pendingReports: row.pending_reports as number,
      escalatedItems: row.escalated_items as number,
      suspectedBanEvaders: row.suspected_ban_evaders as number,
      netMemberChange: (row.new_members as number) - (row.departed_members as number),
      totalActiveMembers,
      newDiscussionPosts: row.new_discussion_posts as number,
      newReviewPosts: row.new_review_posts as number,
      newDataPointPosts: row.new_data_point_posts as number,
      topDiscussionTitle: (row.top_discussion_title as string | null) ?? null,
      topDiscussionReplyCount: (row.top_discussion_reply_count as number | null) ?? 0,
      activeMemberCount,
      activeMemberRate: totalActiveMembers > 0 ? activeMemberCount / totalActiveMembers : 0,
    }
    if (hasModerationSummaryWork(community)) communities.push(community)
  }
  return communities
}
