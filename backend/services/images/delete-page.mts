import { beginTransaction } from '@data-stores/psql'
import onError from '@modules/on-error'
import { enqueueBulkOnPostUpdated } from '@queues/entity-listeners/enqueues'
import { enqueueImageDeletionPage } from '@queues/background/enqueues/image-deletion'
import { resetPostClearance } from '@services/post-clearance'
import {
  lockPostPublicationPostScopes,
  recordPostPublicationChange,
} from '@services/post-publication'
import { createPostModerationContent } from '@services/posts/content'
import { getPostModerationInput } from '@services/posts/moderation-input'
import sql from 'sql-template-strings'
import { cleanupDeletedImageStorage } from './delete-storage-cleanup.mts'
import { createImageDeletionPostRevision } from './delete-revisions.mts'
import { withImageStorageLifecycleLock } from './storage-lifecycle-lock.mts'
import { getImagesWorkLimit } from './work-limits.mts'

export type ImageDeletionOptions = {
  beginTransaction?: typeof beginTransaction
  reportAdmissionFailure?: true
}
type DeletionImage = {
  id: string
  s3_key: string
  sha_256: Buffer | null
  upload_staged_at: Date | null
  deletion_post_cursor: string | null
  deletion_posts_completed_at: Date | null
  quarantine_pending_at: Date | null
  quarantined_at: Date | null
}

export async function processImageDeletionPage(
  imageId: string,
  options: ImageDeletionOptions = {},
): Promise<void> {
  return withImageStorageLifecycleLock(imageId, () =>
    processImageDeletionPageWhileLocked(imageId, options),
  )
}

/** One durable page. An unacknowledged fanout is replayed before any later post mutation. */
export async function processImageDeletionPageWhileLocked(
  imageId: string,
  options: ImageDeletionOptions,
): Promise<void> {
  const startTransaction = options.beginTransaction ?? beginTransaction
  const limit = getImagesWorkLimit('deletion_page_size')
  await using transaction = await startTransaction()
  const { rows: images } = await transaction<DeletionImage>(sql`/* processImageDeletionPage:lock */
    SELECT id, s3_key, sha_256, upload_staged_at, deletion_post_cursor, deletion_posts_completed_at,
      quarantine_pending_at, quarantined_at FROM images WHERE id = ${imageId} AND deleted_at IS NOT NULL FOR UPDATE`)
  const image = images[0]
  if (!image) {
    await transaction.commit()
    return
  }
  if (image.quarantine_pending_at && !image.quarantined_at)
    throw new Error('Image quarantine copy is not confirmed')
  if (image.deletion_posts_completed_at) {
    await transaction.commit()
    await cleanupDeletedImageStorage(image)
    return
  }
  const { rows: pending } = await transaction<{
    post_identity_id: string
  }>(sql`/* processImageDeletionPage:pending */
    SELECT post_identity_id FROM image_deletion_post_updates WHERE image_id = ${imageId}
    ORDER BY post_identity_id LIMIT ${limit}`)
  let postIds = pending.map(row => row.post_identity_id)
  let cursor = image.deletion_post_cursor
  if (postIds.length === 0) {
    const pageQuery = sql`/* processImageDeletionPage:posts */ SELECT post_id FROM post_images WHERE image_id = ${imageId}`
    if (cursor) pageQuery.append(sql` AND post_id > ${cursor}`)
    pageQuery.append(sql` ORDER BY post_id LIMIT ${limit}`)
    const { rows } = await transaction<{ post_id: string }>(pageQuery)
    postIds = rows.map(row => row.post_id)
    if (postIds.length === 0) {
      await transaction(
        sql`/* processImageDeletionPage:complete */ UPDATE images SET deletion_posts_completed_at = CURRENT_TIMESTAMP WHERE id = ${imageId}`,
      )
      await transaction.commit()
      await cleanupDeletedImageStorage(image)
      return
    }
    await lockPostPublicationPostScopes(transaction, postIds)
    /* oxlint-disable no-await-in-loop -- the bounded page uses one transaction connection and each post revision depends on its preceding reset */
    for (const postId of postIds) {
      // no-mistakes-disable-next-line query-reached-per-item: the DynamicConfig-bounded page must preserve each locked post clearance transition and its publication capture atomically
      const clearanceChanged = await resetPostClearance(postId, null, { query: transaction })
      // no-mistakes-disable-next-line query-reached-per-item: moderation content must be read after this bounded page post resets clearance on the transaction connection
      const post = await getPostModerationInput(postId, { query: transaction })
      if (!post) continue
      const { content_sha256 } = createPostModerationContent(post)
      await transaction(
        sql`/* processImageDeletionPage:rehash */ UPDATE posts SET llm_moderation_content_sha256 = ${content_sha256} WHERE id = ${postId}`,
      )
      if (!clearanceChanged) {
        // no-mistakes-disable-next-line query-reached-per-item: each bounded locked post needs its own atomic publication-change capture
        await recordPostPublicationChange(transaction, {
          scope: { type: 'post', postId },
          reason: 'post_content_reset',
        })
      }
      const { rows: attachments } = await transaction<{ image_id: string }>(
        sql`/* processImageDeletionPage:attachments */ SELECT image_id FROM post_images WHERE post_id = ${postId} ORDER BY order_index`,
      )
      // no-mistakes-disable-next-line query-reached-per-item: one history revision per bounded locked post commits with the page cursor
      await createImageDeletionPostRevision(
        postId,
        attachments.map(row => row.image_id),
        imageId,
        { query: transaction },
      )
    }
    /* oxlint-enable no-await-in-loop */
    cursor = postIds.at(-1)!
    await transaction(
      sql`/* processImageDeletionPage:receipt */ INSERT INTO image_deletion_post_updates (image_id, post_identity_id) SELECT ${imageId}, unnest(${postIds}::uuid[]) ON CONFLICT DO NOTHING`,
    )
    await transaction(
      sql`/* processImageDeletionPage:advance */ UPDATE images SET deletion_post_cursor = ${cursor} WHERE id = ${imageId}`,
    )
  }
  await transaction.commit()
  try {
    await enqueueBulkOnPostUpdated(postIds.map(id => ({ id, contentChanged: true })))
  } catch (err) {
    if (!options.reportAdmissionFailure) throw err
    onError(err as Error)
    return
  }
  await using admission = await startTransaction()
  await admission(
    sql`/* processImageDeletionPage:acknowledge */ DELETE FROM image_deletion_post_updates WHERE image_id = ${imageId} AND post_identity_id = ANY(${postIds}::uuid[])`,
  )
  const nextQuery = sql`/* processImageDeletionPage:remaining */ SELECT post_id FROM post_images WHERE image_id = ${imageId}`
  if (cursor) nextQuery.append(sql` AND post_id > ${cursor}`)
  nextQuery.append(sql` LIMIT 1`)
  const { rows: remaining } = await admission(nextQuery)
  const { rows: receipts } = await admission(
    sql`/* processImageDeletionPage:remainingReceipts */ SELECT post_identity_id FROM image_deletion_post_updates WHERE image_id = ${imageId} LIMIT 1`,
  )
  const complete = remaining.length === 0 && receipts.length === 0
  if (complete)
    await admission(
      sql`/* processImageDeletionPage:complete */ UPDATE images SET deletion_posts_completed_at = CURRENT_TIMESTAMP WHERE id = ${imageId}`,
    )
  await admission.commit()
  if (complete) await cleanupDeletedImageStorage(image)
  else {
    try {
      await enqueueImageDeletionPage(imageId, cursor, postIds.at(-1))
    } catch (err) {
      if (!options.reportAdmissionFailure) throw err
      onError(err as Error)
    }
  }
}
