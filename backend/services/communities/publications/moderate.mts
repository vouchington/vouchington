import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { assertNotBanned } from '../bans/get.mts'
import { lockCommunityUser } from '../bans/lock.mts'
import { enqueueCommunityModerationDispatcher } from '@queues/ai-agents/enqueues/community-moderation'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { approvePendingPostClearance } from '@services/post-clearance'
import { recordModeratorAction } from '@services/moderator-actions'
import {
  recordPublicationApprovedFeedback,
  recordPublicationRejectedFeedback,
  recordPublicationUnpublishedFeedback,
} from './training-feedback.mts'
import { recordCommunityPublicationChange } from './publication-change.mts'
import { assertModeratorAccess, getPublicationReview } from './access.mts'
import { lockPostPublication } from '@services/post-publication'
export { unpublishPostAsAgent } from './agent-moderate.mts'
export { assertModeratorAccess } from './access.mts'

export async function approvePublication(
  currentUser: PrivateUser,
  communityId: string,
  postId: string,
): Promise<void> {
  const community = await assertModeratorAccess(currentUser, communityId)

  const publication = await getPublicationReview(communityId, postId)
  assert(publication, 404, 'Community post review not found')
  assert(
    !publication.approved_at && !publication.rejected_at,
    422,
    'Community post review has already been reviewed',
  )
  assert(!publication.unpublished_at, 422, 'Community post has been unpublished')

  await using query = await beginTransaction()
  const options = { query }

  // A banned user's pending post must not be approved/published, even though their membership
  // was already removed by the ban. Take the per-user lock and recheck inside the transaction
  // so a ban committing concurrently cannot slip an approval through.
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
    `,
    options,
  )
  const changed = (rowCount ?? 0) > 0
  if (changed) {
    await recordCommunityPublicationChange(query, communityId, postId)
  }
  const approved = changed

  await query.commit()

  if (approved) {
    await recordPublicationApprovedFeedback({
      actorUserId: currentUser.id,
      communityId,
      postId,
      communityTrusted: Boolean(community.trusted_at),
    })
  }

  if (community.trusted_at) {
    await approvePendingPostClearance(postId, currentUser.id)
  }

  if (approved) {
    await recordModeratorAction(currentUser.id, {
      actionType: 'approve',
      communityId,
      postId,
    })
    void enqueueRefreshTopHashtags()
  }

  void enqueueCommunityModerationDispatcher(postId, communityId)
}

export async function rejectPublication(
  currentUser: PrivateUser,
  communityId: string,
  postId: string,
  reason?: string,
): Promise<void> {
  await assertModeratorAccess(currentUser, communityId)

  const publication = await getPublicationReview(communityId, postId)
  assert(publication, 404, 'Community post review not found')
  assert(
    !publication.approved_at && !publication.rejected_at,
    422,
    'Community post review has already been reviewed',
  )

  if (reason) {
    assert(reason.trim() === reason, 422, 'Reason must not have leading or trailing whitespace')
    assert(reason.length <= 1000, 422, 'Reason must be at most 1000 characters')
  }

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
    `,
    { query },
  )
  const changed = (rowCount ?? 0) > 0
  if (changed) {
    await recordCommunityPublicationChange(query, communityId, postId)
  }
  const rejected = changed

  await query.commit()
  if (rejected) {
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

export async function unpublishPost(
  currentUser: PrivateUser,
  communityId: string,
  postId: string,
): Promise<void> {
  await assertModeratorAccess(currentUser, communityId)

  const publication = await getPublicationReview(communityId, postId)
  assert(publication, 404, 'Community post review not found')
  assert(publication.approved_at && !publication.rejected_at, 422, 'Post is not published')
  assert(!publication.unpublished_at, 422, 'Post has already been unpublished')

  await using query = await beginTransaction()
  await lockPostPublication(query, postId)
  const { rowCount } = await write(
    sql`/* unpublishPost */
  UPDATE community_post_reviews
  SET unpublished_at = CURRENT_TIMESTAMP,
      unpublished_by_id = ${currentUser.id}
  WHERE community_id = ${communityId}
    AND post_id = ${postId}
    AND unpublished_at IS NULL
    `,
    { query },
  )
  const changed = (rowCount ?? 0) > 0
  if (changed) {
    await recordCommunityPublicationChange(query, communityId, postId)
  }
  const unpublished = changed

  await query.commit()
  if (unpublished) {
    await recordPublicationUnpublishedFeedback({ actorUserId: currentUser.id, communityId, postId })
    await recordModeratorAction(currentUser.id, {
      actionType: 'remove',
      communityId,
      postId,
    })
    void enqueueRefreshTopHashtags()
  }
}
