import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { recordModeratorAction } from '@services/moderator-actions'

export async function logDisputeResolution(
  staffUserId: string,
  actionType: 'resolve_report' | 'dismiss_report',
  disputeId: string,
  postId: string,
): Promise<void> {
  const communityId = await getPostCommunityId(postId)
  await recordModeratorAction(staffUserId, {
    actionType,
    reviewDisputeId: disputeId,
    postId,
    communityId,
  })
}

async function getPostCommunityId(postId: string, options?: QueryOptions): Promise<string | null> {
  const { rows } = await read<{ community_id: string | null }>(
    `/* resolveReviewDispute:communityId */ SELECT community_id FROM posts WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [postId],
    options,
  )
  return rows[0]?.community_id ?? null
}
