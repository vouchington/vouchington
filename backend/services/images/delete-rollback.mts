import { beginTransaction } from '@data-stores/psql'
import { createPostModerationContent } from '@services/posts/content'
import { getPostByAny } from '@services/posts/get'
import {
  lockPostPublicationPostScopes,
  recordPostPublicationChange,
} from '@services/post-publication'
import {
  ensureCurrentPostModerationVersion,
  resetPostClearance,
  restorePostClearanceStatus,
  type ClearanceStatus,
} from '@services/post-clearance'
import sql from 'sql-template-strings'
import type { ImageDeleteResult } from './delete-rollback-types.mts'
import { deleteImageDeletionPostRevision } from './delete-revisions.mts'

type CompletedImageDeleteResult = Extract<ImageDeleteResult, { deletedThisImage: true }>

export async function rollbackImageDeletion(
  imageId: string,
  deleteResult: CompletedImageDeleteResult,
): Promise<void> {
  const imageRollback = deleteResult.imageRollback
  await using query = await beginTransaction()
  await query(sql`/* rollbackImageDeletion */
      UPDATE images
      SET deleted_at = NULL,
          openai_omni_moderation_results = ${
            imageRollback.openai_omni_moderation_results == null
              ? null
              : JSON.stringify(imageRollback.openai_omni_moderation_results)
          }::jsonb,
          openai_omni_moderation_flagged = ${imageRollback.openai_omni_moderation_flagged},
          openai_omni_moderation_created_at = ${imageRollback.openai_omni_moderation_created_at}
      WHERE id = ${imageId}
    `)
  await lockPostPublicationPostScopes(query, deleteResult.affectedPostIds)
  for (const rollback of deleteResult.postRollbacks) {
    if (!deleteResult.affectedPostIds.includes(rollback.post_id)) continue
    const postId = rollback.post_id
    // oxlint-disable-next-line no-await-in-loop -- each row is locked before checking whether the deleted-image hash is current
    const { rows } = await query<{
      llm_moderation_content_sha256: Buffer | null
      latest_clearance_change_id: string | null
    }>(sql`/* rollbackImageDeletion */
        SELECT llm_moderation_content_sha256, latest_clearance_change_id
        FROM posts
        WHERE id = ${postId}
        FOR UPDATE
    `)
    const currentPost = rows[0]
    if (!currentPost) continue
    if (rollback.deleted_content_sha256 === null) {
      throw new Error(
        `Image deletion rollback is missing the deleted content hash for post ${postId}`,
      )
    }
    // oxlint-disable-next-line no-await-in-loop -- the restored image and locked post must be read on this transaction before selecting the rollback path
    const post = await getPostByAny(postId, { query })
    if (!post) continue
    const restoredContentSha256 = createPostModerationContent(post).content_sha256
    const deletionStateIsCurrent =
      bufferEquals(currentPost.llm_moderation_content_sha256, rollback.deleted_content_sha256) &&
      currentPost.latest_clearance_change_id === rollback.deleted_clearance_change_id &&
      bufferEquals(restoredContentSha256, rollback.llm_moderation_content_sha256)
    const restorationChangedContent = !bufferEquals(
      currentPost.llm_moderation_content_sha256,
      restoredContentSha256,
    )
    if (deletionStateIsCurrent) {
      // oxlint-disable-next-line no-await-in-loop -- the guarded rollback restores the exact pre-delete content version on this transaction client
      await updatePostModerationContentHash(query, postId, rollback.llm_moderation_content_sha256)
      if (rollback.clearance_reset) {
        if (rollback.deleted_clearance_change_id === null) {
          throw new Error(
            `Image deletion rollback is missing the compensated clearance change for post ${postId}`,
          )
        }
        // oxlint-disable-next-line no-await-in-loop -- each clearance compensation follows this iteration's guarded hash restore on the same transaction client
        await restorePostClearanceStatus(
          postId,
          getRollbackClearanceStatus(rollback),
          rollback.clearance_changed_by_id,
          { query },
          {
            reason: 'image_delete_enqueue_rollback',
            compensates_change_id: rollback.deleted_clearance_change_id,
            restores_change_id: rollback.clearance_change_id,
          },
          {
            reasonCode: rollback.clearance_public_reason_code ?? undefined,
            privateNote: rollback.clearance_private_note ?? undefined,
            platformOverride: rollback.clearance_platform_override,
          },
        )
      } else {
        // oxlint-disable-next-line no-await-in-loop -- capture the restored content state on this iteration's transaction client
        await recordRestoredPostContentChange(query, postId, post.community_id)
      }
    } else if (restorationChangedContent) {
      // oxlint-disable-next-line no-await-in-loop -- a concurrent post state must be rehashed after the shared image is restored
      await updatePostModerationContentHash(query, postId, restoredContentSha256)
      // oxlint-disable-next-line no-await-in-loop -- a concurrent post edit needs a new durable moderation version for the content with the restored image
      const clearanceChanged = await resetPostClearance(postId, null, { query })
      // oxlint-disable-next-line no-await-in-loop -- durable work must commit with the corrected hash so reconciliation can recover the failed dispatch
      await ensureCurrentPostModerationVersion(postId, { query })
      if (!clearanceChanged) {
        // oxlint-disable-next-line no-await-in-loop -- capture the corrected content state on this iteration's transaction client
        await recordRestoredPostContentChange(query, postId, post.community_id)
      }
    } else {
      // oxlint-disable-next-line no-await-in-loop -- a concurrent relationship change still needs durable work after the failed dispatch
      await ensureCurrentPostModerationVersion(postId, { query })
    }
    if (rollback.revision_id !== null) {
      // oxlint-disable-next-line no-await-in-loop -- remove only the revision paired with the state this iteration rolled back
      await deleteImageDeletionPostRevision(rollback.revision_id, postId, { query })
    }
  }
  await query.commit()
}

function updatePostModerationContentHash(
  query: Parameters<typeof recordPostPublicationChange>[0],
  postId: string,
  contentSha256: Buffer,
) {
  return query(sql`/* rollbackImageDeletion */
    UPDATE posts
    SET llm_moderation_content_sha256 = ${contentSha256}
    WHERE id = ${postId}
  `)
}

function recordRestoredPostContentChange(
  query: Parameters<typeof recordPostPublicationChange>[0],
  postId: string,
  communityId: string | null,
) {
  return recordPostPublicationChange(query, {
    scope: { type: 'post', postId },
    reason: 'post_content_reset',
    impactedCommunityIds: communityId ? [communityId] : [],
    footprint: { priorCommunityId: communityId ?? undefined },
  })
}

function bufferEquals(actual: Buffer | null, expected: Buffer): boolean {
  return actual !== null && Buffer.compare(actual, expected) === 0
}

function getRollbackClearanceStatus(rollback: {
  approved_at: Date | null
  rejected_at: Date | null
  in_review_at: Date | null
}): ClearanceStatus {
  if (rollback.approved_at) return 'approved'
  if (rollback.rejected_at) return 'rejected'
  if (rollback.in_review_at) return 'in_review'
  return 'pending'
}
