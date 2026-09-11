import type { PrivateUser } from '@services/users/types'
import type { Post } from './types.mts'
import type { CommunityMemberRole } from '@services/communities/types'
import { beginTransaction } from '@data-stores/psql'
import { enqueueOnPostDeleted } from '@queues/entity-listeners/enqueues'
import { currentUserCanDeletePost } from './authorization.mts'
import assert from 'http-assert'
import { createPostRevision } from '@services/post-revisions'
import { dismissPendingReportsForDeletedEntity } from '@services/moderation-reports/resolve'
import { dismissPendingDisputesForDeletedReview } from '@services/review-disputes/resolve'
import { recordModeratorAction } from '@services/moderator-actions'
import { lockPostPublication, recordPostPublicationChange } from '@services/post-publication'

export const deletePost = async (
  deleter: PrivateUser,
  post: Post,
  options?: { communityMemberRole?: CommunityMemberRole | null },
) => {
  assert(currentUserCanDeletePost(deleter, post, options), 403, 'Forbidden')
  await using query = await beginTransaction()
  await lockPostPublication(query, post.id)
  const { rowCount } = await query(
    `/* deletePost */
      UPDATE posts
      SET deleted_at = CURRENT_TIMESTAMP, deleted_by_id = $1
      WHERE id = $2 AND deleted_at IS NULL
    `,
    [deleter.id, post.id],
  )
  if ((rowCount ?? 0) > 0) {
    await createPostRevision(
      post.id,
      'delete',
      { deleted_at: { before: null, after: 'now' } },
      deleter.id,
      { query },
    )
    await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_deleted',
      impactedPostIds: [post.id],
      footprint: {
        priorAuthorUserId: post.created_by_id ?? undefined,
        priorCommunityId: post.community_id ?? undefined,
        priorRootId: post.root_id ?? undefined,
        priorPostSlug: post.slug ?? undefined,
      },
    })
  }
  await query.commit()

  void enqueueOnPostDeleted(post.id)
  const isModerationDelete = deleter.id !== post.created_by_id
  await Promise.all([
    dismissPendingReportsForDeletedEntity(
      post.post_type === 'comment' ? 'comment' : 'post',
      post.id,
    ),
    isModerationDelete
      ? recordModeratorAction(deleter.id, {
          actionType: 'remove',
          communityId: post.community_id ?? null,
          postId: post.id,
        })
      : undefined,
  ])
  if (post.post_type === 'review') {
    await dismissPendingDisputesForDeletedReview(post.id)
  }
}
