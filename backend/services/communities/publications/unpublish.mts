import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { recordModeratorAction } from '@services/moderator-actions'
import { lockPostPublication } from '@services/post-publication'
import { recordPublicationUnpublishedFeedback } from './training-feedback.mts'
import { assertPublicationModeratorAccess, getPublicationReview } from './access.mts'
import { recordCommunityPublicationChange } from './publication-change.mts'
import { overridePublication } from './platform-override.mts'
import { recordPublicationReviewChange } from './review-change.mts'

export async function unpublishPost(
  currentUser: PrivateUser,
  communityId: string,
  postId: string,
): Promise<void> {
  const access = await assertPublicationModeratorAccess(currentUser, communityId)
  if (access.isPlatformModerator) {
    await overridePublication(currentUser, communityId, postId, {
      action: 'unpublish',
      reasonCode: 'staff_unpublished',
    })
    return
  }

  const publication = await getPublicationReview(communityId, postId)
  assert(publication, 404, 'Community post review not found')
  assert(
    !publication.platform_override_at,
    403,
    'This publication has a platform moderation override',
  )
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
        AND platform_override_at IS NULL`,
    { query },
  )
  const changed = (rowCount ?? 0) > 0
  if (changed) {
    await recordPublicationReviewChange(query, {
      communityId,
      postId,
      actorUserId: currentUser.id,
      action: 'unpublish',
    })
    await recordCommunityPublicationChange(query, communityId, postId)
  }
  await query.commit()

  if (changed) {
    await recordPublicationUnpublishedFeedback({ actorUserId: currentUser.id, communityId, postId })
    await recordModeratorAction(currentUser.id, { actionType: 'remove', communityId, postId })
    void enqueueRefreshTopHashtags()
  }
}
