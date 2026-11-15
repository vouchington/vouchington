import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CommunityModerationSummaryEmailProps } from '@email-templates/core'
import type { ModerationSummaryRankedCommunity } from '@queues/background/enqueues/email-digests-domain'
type Card = CommunityModerationSummaryEmailProps['communities'][number]
export async function isCommunityEligible(
  userId: string,
  communityId: string,
  eligibilityAt: Date,
) {
  const { rows } = await read(
    sql`/* isModerationSummaryCommunityEligible */ SELECT cm.id
    FROM community_members cm JOIN communities c ON c.id=cm.community_id
    WHERE cm.user_id=${userId} AND cm.community_id=${communityId} AND cm.removed_at IS NULL
      AND cm.role IN ('owner','moderator') AND c.deleted_at IS NULL AND c.archived_at IS NULL
      AND (NOT cm.should_suppress_community_digests_while_on_vacation OR NOT EXISTS (
        SELECT 1 FROM community_member_vacations v WHERE v.community_id=cm.community_id
          AND v.user_id=cm.user_id AND v.starts_at<=${eligibilityAt}
          AND (v.ends_at IS NULL OR v.ends_at>${eligibilityAt}))) LIMIT 1`,
    { readOnly: false },
  )
  return rows.length > 0
}

export async function recheckModerationSummaryCommunities(
  userId: string,
  cards: readonly Card[],
  at: Date,
  selected: readonly ModerationSummaryRankedCommunity[],
): Promise<Card[]> {
  if (cards.length === 0) return []
  const { rows: eligible } = await read<{ community_id: string }>(
    sql`/* recheckModerationSummaryCommunities */
    SELECT cm.community_id FROM community_members cm JOIN communities c ON c.id=cm.community_id
    WHERE cm.user_id=${userId} AND cm.community_id=ANY(${cards.map(card => card.communityId)}::uuid[])
      AND cm.removed_at IS NULL AND cm.role IN ('owner','moderator')
      AND c.deleted_at IS NULL AND c.archived_at IS NULL
      AND (NOT cm.should_suppress_community_digests_while_on_vacation OR NOT EXISTS (
        SELECT 1 FROM community_member_vacations v WHERE v.community_id=cm.community_id
          AND v.user_id=cm.user_id AND v.starts_at<=${at}
          AND (v.ends_at IS NULL OR v.ends_at>${at})))`,
    { readOnly: false },
  )
  const eligibleIds = new Set(eligible.map(row => row.community_id))
  const selectedById = new Map(selected.map(row => [row.communityId, row.discussionPostId]))
  const postIds = cards.flatMap(card => {
    const id = selectedById.get(card.communityId)
    return eligibleIds.has(card.communityId) && id ? [id] : []
  })
  const { rows: discussions } = await read<{ id: string; community_id: string; title: string }>(
    sql`/* recheckModerationSummaryDiscussionTitles */
    SELECT p.id,p.community_id,p.title FROM posts p JOIN communities c ON c.id=p.community_id
      AND c.deleted_at IS NULL AND c.archived_at IS NULL
    WHERE p.id=ANY(${postIds}::uuid[]) AND p.community_id=ANY(${[...eligibleIds]}::uuid[])
      AND p.post_type='discussion' AND p.deleted_at IS NULL`,
    { readOnly: false },
  )
  const titleById = new Map(discussions.map(row => [row.id, row]))
  return cards.flatMap(card => {
    if (!eligibleIds.has(card.communityId)) return []
    const post = titleById.get(selectedById.get(card.communityId) ?? '')
    const title = post?.community_id === card.communityId ? post.title : null
    return [
      {
        ...card,
        topDiscussionTitle: title,
        topDiscussionReplyCount: title === null ? 0 : card.topDiscussionReplyCount,
      },
    ]
  })
}
