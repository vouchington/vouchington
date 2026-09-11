import { beginTransaction } from '@data-stores/psql'
import { createPostModerationContent } from '@services/posts/content'
import { getPostByAny } from '@services/posts/get'
import {
  lockPostPublicationPostScopes,
  recordPostPublicationChange,
} from '@services/post-publication'
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
      openai_omni_moderation_content_sha256: Buffer | null
      llm_moderation_content_sha256: Buffer | null
    }>(sql`/* rollbackImageDeletion */
        SELECT openai_omni_moderation_content_sha256,
          llm_moderation_content_sha256
        FROM posts
        WHERE id = ${postId}
        FOR UPDATE
      `)
    const currentPost = rows[0]
    if (
      !currentPost ||
      rollback.deleted_content_sha256 === null ||
      !bufferEquals(
        currentPost.openai_omni_moderation_content_sha256,
        rollback.deleted_content_sha256,
      ) ||
      !bufferEquals(currentPost.llm_moderation_content_sha256, rollback.deleted_content_sha256)
    ) {
      continue
    }
    // oxlint-disable-next-line no-await-in-loop -- recomputation uses state protected by this iteration's row lock
    const post = await getPostByAny(postId, { query })
    if (!post) continue
    const { content_sha256 } = createPostModerationContent(post)
    // oxlint-disable-next-line no-await-in-loop -- each guarded rollback is applied on the same transaction client
    await query(sql`/* rollbackImageDeletion */
        UPDATE posts
        SET openai_omni_moderation_content_sha256 = ${content_sha256},
            llm_moderation_content_sha256 = ${content_sha256},
            latest_clearance_change_id = ${rollback.latest_clearance_change_id},
            approved_at = ${rollback.approved_at},
            rejected_at = ${rollback.rejected_at},
            in_review_at = ${rollback.in_review_at},
            spam_detection_flagged = ${rollback.spam_detection_flagged},
            spam_detection_created_at = ${rollback.spam_detection_created_at},
            spam_detection_score = ${rollback.spam_detection_score},
            spam_detection_results = ${
              rollback.spam_detection_results == null
                ? null
                : JSON.stringify(rollback.spam_detection_results)
            }::jsonb,
            openai_omni_moderation_flagged = ${rollback.openai_omni_moderation_flagged},
            openai_omni_moderation_created_at = ${rollback.openai_omni_moderation_created_at}
        WHERE id = ${postId}
      `)
    // oxlint-disable-next-line no-await-in-loop -- capture the restored clearance state on this iteration's transaction client
    await recordPostPublicationChange(query, {
      scope: { type: 'post', postId },
      reason: 'post_clearance_changed',
      impactedCommunityIds: post.community_id ? [post.community_id] : [],
      footprint: { priorCommunityId: post.community_id ?? undefined },
    })
    if (rollback.revision_id !== null) {
      // oxlint-disable-next-line no-await-in-loop -- remove only the revision paired with the state this iteration rolled back
      await deleteImageDeletionPostRevision(rollback.revision_id, postId, { query })
    }
  }
  await query.commit()
}

function bufferEquals(actual: Buffer | null, expected: Buffer): boolean {
  return actual !== null && Buffer.compare(actual, expected) === 0
}
