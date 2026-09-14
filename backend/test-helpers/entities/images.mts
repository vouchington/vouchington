import { createHash, randomBytes } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 } from 'uuid'

export async function updateImageStatus(
  imageId: string,
  status: 'pending' | 'processing' | 'complete' | 'failed',
) {
  const timestamps =
    status === 'failed'
      ? sql`upload_started_at = NOW(), upload_failed_at = NOW(), upload_error = 'Test upload failure'`
      : status === 'complete'
        ? sql`upload_started_at = NOW(), upload_completed_at = NOW(), upload_error = NULL`
        : status === 'processing'
          ? sql`upload_started_at = NOW()`
          : sql`upload_started_at = NULL, upload_completed_at = NULL, upload_failed_at = NULL`
  await write(sql`UPDATE images SET `.append(timestamps).append(sql` WHERE id = ${imageId}`))
}

export async function markImageDeleted(imageId: string) {
  await write(
    `
    UPDATE images SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1
  `,
    [imageId],
  )
}

export async function markImageModerationFlagged(imageId: string) {
  await write(sql`
    UPDATE images
    SET openai_omni_moderation_flagged = true,
        openai_omni_moderation_created_at = NOW()
    WHERE id = ${imageId}
  `)
}

export async function setImageOpenAIModerationResults(
  imageId: string,
  results: unknown[],
  flagged: boolean,
) {
  await write(sql`
    UPDATE images
    SET openai_omni_moderation_results = ${JSON.stringify(results)}::jsonb,
        openai_omni_moderation_flagged = ${flagged},
        openai_omni_moderation_created_at = NOW()
    WHERE id = ${imageId}
  `)
}

export async function getImageModerationState(imageId: string): Promise<{
  deleted_at: Date | null
  openai_omni_moderation_results: unknown | null
  openai_omni_moderation_flagged: boolean | null
  openai_omni_moderation_created_at: Date | null
} | null> {
  const { rows } = await read(sql`
    SELECT deleted_at, quarantine_pending_at, quarantined_at,
      openai_omni_moderation_results,
      openai_omni_moderation_flagged,
      openai_omni_moderation_created_at
    FROM images
    WHERE id = ${imageId}
  `)
  return rows[0] ?? null
}

export async function markImageComplete(imageId: string) {
  await write(
    `
    UPDATE images
    SET upload_started_at = NOW(),
        upload_completed_at = NOW(),
        sha_256 = decode(replace($1::text, '-', '') || replace($1::text, '-', ''), 'hex'),
        s3_key = replace($1::text, '-', '') || replace($1::text, '-', '')
    WHERE id = $1
  `,
    [imageId],
  )
}

export async function setImageIdAndUploadStatus(
  currentImageId: string,
  newImageId: string,
  uploadStatus?: 'pending' | 'processing' | 'complete',
) {
  if (uploadStatus) {
    const startedAt = uploadStatus !== 'pending' ? 'NOW()' : 'NULL'
    const completedAt = uploadStatus === 'complete' ? 'NOW()' : 'NULL'
    const digest = uploadStatus === 'complete' ? newImageId.replaceAll('-', '').repeat(2) : null
    await write(
      `
      UPDATE images
      SET id = $1,
          upload_started_at = ${startedAt},
          upload_completed_at = ${completedAt},
          sha_256 = COALESCE(decode($2, 'hex'), sha_256),
          s3_key = COALESCE($2, s3_key)
      WHERE id = $3
    `,
      [newImageId, digest, currentImageId],
    )
    return
  }

  await write(
    `
    UPDATE images
    SET id = $1
    WHERE id = $2
  `,
    [newImageId, currentImageId],
  )
}

export async function setImageHashAndProcessing(imageId: string, sha256: Buffer): Promise<void> {
  await write(
    `UPDATE images SET sha_256 = $1, s3_key = $2, upload_started_at = NOW() WHERE id = $3`,
    [sha256, sha256.toString('hex'), imageId],
  )
}

export async function setImageCompleteWithData(
  imageId: string,
  sha256: Buffer,
  data: Record<string, unknown>,
): Promise<void> {
  await write(
    `UPDATE images
       SET sha_256 = $1, s3_key = $2, upload_started_at = NOW(), upload_completed_at = NOW(),
           data = $3::jsonb
       WHERE id = $4`,
    [sha256, sha256.toString('hex'), JSON.stringify(data), imageId],
  )
}

export async function insertTestImage(userId: string): Promise<string> {
  const sha256 = randomBytes(32)
  const s3Key = `test/${randomBytes(16).toString('hex')}`
  const { rows } = await write(sql`
    INSERT INTO images (
      created_by_id, sha_256, upload_started_at, upload_completed_at, data, s3_key,
      openai_omni_moderation_flagged, openai_omni_moderation_created_at
    )
    VALUES (${userId}, ${sha256}, NOW(), NOW(), '{}', ${s3Key}, false, NOW())
    RETURNING id
  `)
  return rows[0].id
}

export async function insertTestImageWithSha256(
  userId: string,
): Promise<{ id: string; sha256: Buffer }> {
  const sha256 = randomBytes(32)
  const s3Key = `test/${randomBytes(16).toString('hex')}`
  const { rows } = await write(sql`
    INSERT INTO images (
      created_by_id, sha_256, upload_started_at, upload_completed_at, data, s3_key,
      openai_omni_moderation_flagged, openai_omni_moderation_created_at
    )
    VALUES (${userId}, ${sha256}, NOW(), NOW(), '{}', ${s3Key}, false, NOW())
    RETURNING id
  `)
  return { id: rows[0].id, sha256 }
}

export async function insertTestPostImage(data: {
  postId: string
  imageId: string
  orderIndex?: number
  caption?: string
}): Promise<void> {
  await write(sql`
    INSERT INTO post_images (post_id, image_id, order_index, caption)
    VALUES (${data.postId}, ${data.imageId}, ${data.orderIndex ?? 0}, ${data.caption ?? ''})
  `)
}

export async function insertPendingTestImage(userId: string): Promise<string> {
  const imageId = v7()
  const tempHash = createHash('sha256').update(imageId).digest()
  const { rows } = await write(sql`
    INSERT INTO images (id, created_by_id, sha_256, data, s3_key)
    VALUES (${imageId}, ${userId}, ${tempHash}, '{}', ${imageId})
    RETURNING id
  `)
  return rows[0].id
}

export async function getImageEmbeddingState(
  imageId: string,
): Promise<{ bedrock_nova_multimodal_v1_embedding_created_at: Date | null } | null> {
  const { rows } = await read(
    `SELECT bedrock_nova_multimodal_v1_embedding_created_at FROM images WHERE id = $1`,
    [imageId],
  )
  return rows[0] ?? null
}
