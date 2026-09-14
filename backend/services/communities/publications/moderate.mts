import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { enqueueCommunityModerationDispatcher } from '@queues/ai-agents/enqueues/community-moderation'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { recordModeratorAction } from '@services/moderator-actions'
import {
  recordPublicationApprovedFeedback,
  recordPublicationRejectedFeedback,
} from './training-feedback.mts'
import { recordCommunityPublicationChange } from './publication-change.mts'
import { assertPublicationModeratorAccess, getPublicationReview } from './access.mts'
import { assertNotBanned } from '../bans/get.mts'
import { lockCommunityUser } from '../bans/lock.mts'
import { overridePublication } from './platform-override.mts'
import { recordPublicationReviewChange } from './review-change.mts'

export { unpublishPostAsAgent } from './agent-moderate.mts'
export { assertModeratorAccess } from './access.mts'
export { unpublishPost } from './unpublish.mts'

export { overridePublication } from './platform-override.mts'

export async function approvePublication(
  currentUser: PrivateUser,
  communityId: string,
  postId: string,
): Promise<void> {
  const access = await assertPublicationModeratorAccess(currentUser, communityId)
  if (access.isPlatformModerator) {
    await overridePublication(currentUser, communityId, postId, {
      action: 'approve',
      reasonCode: 'staff_approved',
    })
    return
  }

  const publication = await assertCommunityPublicationCanChange(communityId, postId)
  assert(
    !publication.approved_at && !publication.rejected_at,
    422,
    'Community post review has already been reviewed',
  )
  assert(!publication.unpublished_at, 422, 'Community post has been unpublished')

  await using query = await beginTransaction()
  const options = { query }
  if (publication.submitted_by_id) {
    await lockCommunityUser(communityId, publication.submitted_by_id, options)
    await assertNotBanned(communityId, publication.submitted_by_id, options)
  }
  const { rowCount } = await write(
    sql`/* approvePublication */
      UPDATE community_post_reviews
      SET reviewed_at = CURRENT_TIMESTAMP,
          reviewed_by_id = ${currentUser.id},
          approved_at = CURRENT_TIMESTAMP
      WHERE community_id = ${communityId}
        AND post_id = ${postId}
        AND approved_at IS NULL
        AND rejected_at IS NULL
        AND platform_override_at IS NULL`,
    options,
  )
  const changed = (rowCount ?? 0) > 0
  if (changed) {
    await recordPublicationReviewChange(query, {
      communityId,
      postId,
      actorUserId: currentUser.id,
      action: 'approve',
    })
    await recordCommunityPublicationChange(query, communityId, postId)
  }
  await query.commit()

  if (changed) {
    await recordPublicationApprovedFeedback({
      actorUserId: currentUser.id,
      communityId,
      postId,
      communityTrusted: Boolean(access.community.trusted_at),
    })
    await recordModeratorAction(currentUser.id, { actionType: 'approve', communityId, postId })
    void enqueueRefreshTopHashtags()
    void enqueueCommunityModerationDispatcher(postId, communityId)
  }
}

export async function rejectPublication(
  currentUser: PrivateUser,
  communityId: string,
  postId: string,
  reason?: string,
): Promise<void> {
  const access = await assertPublicationModeratorAccess(currentUser, communityId)
  if (access.isPlatformModerator) {
    await overridePublication(currentUser, communityId, postId, {
      action: 'reject',
      reasonCode: 'staff_rejected',
      privateNote: reason,
    })
    return
  }
  if (reason) assertReasonText(reason, 1000, 'Reason')

  const publication = await assertCommunityPublicationCanChange(communityId, postId)
  assert(
    !publication.approved_at && !publication.rejected_at,
    422,
    'Community post review has already been reviewed',
  )

  await using query = await beginTransaction()
  const { rowCount } = await write(
    sql`/* rejectPublication */
      UPDATE community_post_reviews
      SET reviewed_at = CURRENT_TIMESTAMP,
          reviewed_by_id = ${currentUser.id},
          rejected_at = CURRENT_TIMESTAMP,
          rejection_reason = ${reason ?? null}
      WHERE community_id = ${communityId}
        AND post_id = ${postId}
        AND approved_at IS NULL
        AND rejected_at IS NULL
        AND platform_override_at IS NULL`,
    { query },
  )
  const changed = (rowCount ?? 0) > 0
  if (changed) {
    await recordPublicationReviewChange(query, {
      communityId,
      postId,
      actorUserId: currentUser.id,
      action: 'reject',
    })
    await recordCommunityPublicationChange(query, communityId, postId)
  }
  await query.commit()

  if (changed) {
    await recordPublicationRejectedFeedback({
      actorUserId: currentUser.id,
      communityId,
      postId,
      reason,
    })
    await recordModeratorAction(currentUser.id, {
      actionType: 'reject',
      communityId,
      postId,
      reason: reason ?? null,
    })
    void enqueueRefreshTopHashtags()
  }
}

async function assertCommunityPublicationCanChange(communityId: string, postId: string) {
  const publication = await getPublicationReview(communityId, postId)
  assert(publication, 404, 'Community post review not found')
  assert(
    !publication.platform_override_at,
    403,
    'This publication has a platform moderation override',
  )
  return publication
}

function assertReasonText(value: string, maxLength: number, name: string): void {
  assert(value.trim() === value, 422, `${name} must not have leading or trailing whitespace`)
  assert(value.length <= maxLength, 422, `${name} must be at most ${maxLength} characters`)
}
