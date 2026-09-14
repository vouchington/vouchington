import { getImageByAny } from './get.mts'
import type { ImageDeleteImageRollback, ImageDeleteResult } from './delete-rollback-types.mts'
import { beginTransaction } from '@data-stores/psql'
import { deleteKnownImageStorageFromS3 } from './s3-upload-lifecycle.mts'
import { markImageUploadSourceDeleted } from './complete-upload-state.mts'
import onError from '@modules/on-error'
import { enqueueBulkOnPostUpdated } from '@queues/entity-listeners/enqueues'
import { resetPostClearance } from '@services/post-clearance'
import { createPostModerationContent } from '@services/posts/content'
import { getPostByAny } from '@services/posts/get'
import sql from 'sql-template-strings'
import { createImageDeletionPostRevision } from './delete-revisions.mts'
import { rollbackImageDeletion } from './delete-rollback.mts'
import {
  getImageDeletePostRollbackSnapshots,
  type ImageDeletePostRollbackSnapshot,
} from './delete-rollback-state.mts'
import { withImageStorageLifecycleLock } from './storage-lifecycle-lock.mts'
import {
  lockPostPublicationPostScopes,
  recordPostPublicationChange,
} from '@services/post-publication'

export const deleteImageById = async (
  imageId: string | Buffer,
  omitRollback?: true,
  { includeQuarantinePending = false }: { includeQuarantinePending?: boolean } = {},
) => {
  const image = await getImageByAny(imageId, { includeQuarantinePending })
  if (!image) return
  return await withImageStorageLifecycleLock(image.id, async () =>
    deleteImageByIdWhileStorageLocked(image.id, omitRollback, includeQuarantinePending),
  )
}
async function deleteImageByIdWhileStorageLocked(
  imageId: string | Buffer,
  omitRollback: true | undefined,
  includeQuarantinePending: boolean,
) {
  const image = await getImageByAny(imageId, { includeQuarantinePending })
  if (!image) return
  let lockedStorageImage:
    | {
        id: string
        s3_key: string
        sha_256: Buffer | null
        upload_staged_at: Date | null
      }
    | undefined
  async function deleteImageInTransaction(): Promise<ImageDeleteResult> {
    await using transaction = await beginTransaction()
    async function deleteImageRows(query: typeof transaction) {
      const { rows: imageRollbackRows } = await query<
        ImageDeleteImageRollback & {
          id: string
          s3_key: string
          sha_256: Buffer | null
          upload_staged_at: Date | null
        }
      >(sql`/* deleteImageById */
      SELECT id,
        s3_key,
        sha_256,
        upload_staged_at,
        openai_omni_moderation_results,
        openai_omni_moderation_flagged,
        openai_omni_moderation_created_at
      FROM images
      WHERE id = ${image.id}
        AND deleted_at IS NULL
      FOR UPDATE
    `)
      const imageRollback = imageRollbackRows[0] ?? null
      /* v8 ignore start -- race-only no-op when another delete wins after getImageByAny */
      if (!imageRollback) {
        return {
          affectedPostIds: [],
          deletedThisImage: false,
          imageRollback: null,
          postRollbacks: [],
        }
      }
      /* v8 ignore stop */
      lockedStorageImage = imageRollback

      await query(sql`/* deleteImageById */
      UPDATE images
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = ${image.id}
    `)

      const { rows: postRows } = await query<{
        post_id: string
        image_ids: string[]
      }>(sql`/* deleteImageById */
      WITH affected_posts AS (
        SELECT DISTINCT post_id
        FROM post_images
        WHERE image_id = ${image.id}
      )
      SELECT post_images.post_id,
        array_agg(post_images.image_id ORDER BY post_images.order_index) AS image_ids
      FROM post_images
      JOIN affected_posts USING (post_id)
      GROUP BY post_images.post_id
    `)

      const postIds = postRows.map(row => row.post_id)
      let postRollbacks: ImageDeletePostRollbackSnapshot[] = []
      if (postIds.length > 0) {
        await lockPostPublicationPostScopes(query, postIds)
        postRollbacks = await getImageDeletePostRollbackSnapshots(query, postIds)
      }
      const rehashedPostIds: string[] = []
      const deletedContentShaByPostId = new Map<string, Buffer>()
      const deletedClearanceChangeIdByPostId = new Map<string, string | null>()
      const revisionIdByPostId = new Map<string, string>()
      const clearanceResetByPostId = new Map<string, boolean>()
      for (const { post_id, image_ids } of postRows) {
        // oxlint-disable-next-line no-await-in-loop -- each post's clearance reset must finish on this transaction client before its state is reread
        const clearanceChanged = await resetPostClearance(post_id, null, { query })
        clearanceResetByPostId.set(post_id, clearanceChanged)
        // oxlint-disable-next-line no-await-in-loop -- the post read depends on this iteration's completed clearance reset
        const post = await getPostByAny(post_id, { query })
        if (!post) continue
        const { content_sha256 } = createPostModerationContent(post)
        // oxlint-disable-next-line no-await-in-loop -- each post hash update follows its reset and reread on the same transaction client
        const { rows: updatedPosts } = await query<{
          latest_clearance_change_id: string | null
        }>(sql`/* deleteImageById */
        UPDATE posts
        SET llm_moderation_content_sha256 = ${content_sha256},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${post_id}
        RETURNING latest_clearance_change_id
      `)
        if (!clearanceChanged) {
          // oxlint-disable-next-line no-await-in-loop -- publication capture must commit atomically after this image-content mutation
          await recordPostPublicationChange(query, {
            scope: { type: 'post', postId: post_id },
            reason: 'post_content_reset',
          })
        }
        rehashedPostIds.push(post_id)
        deletedContentShaByPostId.set(post_id, content_sha256)
        deletedClearanceChangeIdByPostId.set(
          post_id,
          updatedPosts[0]?.latest_clearance_change_id ?? null,
        )
        // oxlint-disable-next-line no-await-in-loop -- revision must commit atomically with this post's reset and rehash
        const revisionId = await createImageDeletionPostRevision(post_id, image_ids, image.id, {
          query,
        })
        revisionIdByPostId.set(post_id, revisionId)
      }
      return {
        affectedPostIds: rehashedPostIds,
        deletedThisImage: true,
        imageRollback,
        postRollbacks: postRollbacks.map(rollback => ({
          ...rollback,
          revision_id: revisionIdByPostId.get(rollback.post_id) ?? null,
          deleted_content_sha256: deletedContentShaByPostId.get(rollback.post_id) ?? null,
          deleted_clearance_change_id:
            deletedClearanceChangeIdByPostId.get(rollback.post_id) ?? null,
          clearance_reset: clearanceResetByPostId.get(rollback.post_id) ?? false,
        })),
      }
    }
    const result = await deleteImageRows(transaction)
    await transaction.commit()
    return result as ImageDeleteResult
  }
  const deleteResult = await deleteImageInTransaction()
  if (!deleteResult.deletedThisImage) return
  try {
    await enqueueBulkOnPostUpdated(
      deleteResult.affectedPostIds.map(id => ({ id, contentChanged: true })),
    )
  } catch (error) {
    /* c8 ignore next 3 -- only reached when Valkey fails during CSAM quarantine deletion */
    if (omitRollback) {
      onError(error as Error)
    } else {
      await rollbackImageDeletion(image.id, deleteResult)
      throw error
    }
  }
  try {
    await deleteKnownImageStorageFromS3(lockedStorageImage!)
    await markImageUploadSourceDeleted(lockedStorageImage!.id)
  } catch (error) {
    onError(error as Error)
  }
}
