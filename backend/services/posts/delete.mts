import type { PrivateUser } from '@services/users/types'
import type { Post } from './types.mts'
import type { CommunityMemberRole } from '@services/communities/types'
import { beginTransaction } from '@data-stores/psql'
import { enqueueOnPostDeleted } from '@queues/entity-listeners/enqueues'
import { awaitReportedEnqueueAdmission } from '@queues/background/enqueues'
import {
  currentUserCanDeletePost,
  loadWritablePost,
  assertDelegatedPostActorActive,
} from './authorization.mts'
import assert from 'http-assert'
import { createPostRevision } from '@services/post-revisions'
import { dismissPendingReportsForDeletedEntity } from '@services/moderation-reports/resolve'
import { dismissPendingDisputesForDeletedReview } from '@services/review-disputes/resolve'
import { recordModeratorAction } from '@services/moderator-actions'
import { recordPostPublicationChange } from '@services/post-publication'
import { retirePostImagePlacements } from './image-placements.mts'
import { repairFailedImageDeliveryMutation } from '@services/media-delivery-safety'
import { lockDelegatedPostThread } from './delegated-write-locks.mts'
import onError from '@modules/on-error'
import { runSequentially } from '@modules/utils/run-sequentially'
import { rearmNextPostBanEvasionEmbedding } from './ban-evasion-embeddings.mts'

export const deletePost = async (
  deleter: PrivateUser,
  post: Post,
  options?: { communityMemberRole?: CommunityMemberRole | null; delegated?: boolean },
) => {
  assert(currentUserCanDeletePost(deleter, post, options), 403, 'Forbidden')
  try {
    await using query = await beginTransaction()
    let rowCount: number | null = null
    await runSequentially([
      async () => {
        if (options?.delegated) await assertDelegatedPostActorActive(deleter.id, { query })
      },
      async () => {
        if (options?.delegated) {
          await lockDelegatedPostThread(query, post.id)
          await loadWritablePost(deleter, post.id, 'delete', { query })
        }
      },
      async () => {
        const result = await query(
          `/* deletePost */
      UPDATE posts
      SET deleted_at = CURRENT_TIMESTAMP, deleted_by_id = $1
      WHERE id = $2 AND deleted_at IS NULL
        AND (
          NOT $3::boolean OR EXISTS (
            SELECT 1 FROM users actor
            WHERE actor.id = $1 AND actor.deleted_at IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM user_suspensions suspension
                WHERE suspension.user_id = actor.id AND suspension.lifted_at IS NULL
              )
          )
        )
    `,
          [deleter.id, post.id, options?.delegated ?? false],
        )
        rowCount = result.rowCount
        assert(
          !options?.delegated || rowCount === 1,
          401,
          'Delegated post deletion was not applied',
        )
      },
    ])
    if ((rowCount ?? 0) > 0) {
      await runSequentially([
        () => rearmNextPostBanEvasionEmbedding(query, post.id),
        () => retirePostImagePlacements(post.id, query),
        () =>
          createPostRevision(
            post.id,
            'delete',
            { deleted_at: { before: null, after: 'now' } },
            deleter.id,
            { query },
          ),
        () =>
          recordPostPublicationChange(query, {
            scope: { type: 'post', postId: post.id },
            reason: 'post_deleted',
            impactedPostIds: [post.id],
            footprint: {
              priorAuthorUserId: post.created_by_id ?? undefined,
              priorCommunityId: post.community_id ?? undefined,
              priorRootId: post.root_post_id ?? undefined,
              priorPostSlug: post.slug ?? undefined,
            },
          }),
      ])
    }
    await query.commit()
  } catch (err) {
    await repairFailedImageDeliveryMutation({ postIds: [post.id] }).catch(onError)
    throw err
  }

  const admission = awaitReportedEnqueueAdmission(() => enqueueOnPostDeleted(post.id))
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
  await admission
}
