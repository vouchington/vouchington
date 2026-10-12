import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
export { insertTestImage, insertTestImageWithSha256 } from './images-insert.mts'
export { insertTestPostImage, insertPendingTestImage } from './images-post-placements.mts'
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
  await write(
    allowUnannotatedQuery(
      sql`UPDATE images SET `.append(timestamps).append(sql` WHERE id = ${imageId}`),
    ),
  )
}

export async function markImageDeleted(imageId: string) {
  await write(
    allowUnannotatedQuery(`
    UPDATE images SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1
  `),
    [imageId],
  )
}

export async function markImageModerationFlagged(imageId: string) {
  await write(
    allowUnannotatedQuery(sql`
    UPDATE images
    SET is_flagged_by_openai_omni_moderation = true,
        openai_omni_moderation_created_at = NOW()
    WHERE id = ${imageId}
  `),
  )
}

export async function setImageOpenAIModerationResults(
  imageId: string,
  results: unknown[],
  flagged: boolean,
) {
  await write(
    allowUnannotatedQuery(sql`
    UPDATE images
    SET openai_omni_moderation_results = ${JSON.stringify(results)}::jsonb,
        is_flagged_by_openai_omni_moderation = ${flagged},
        openai_omni_moderation_created_at = NOW()
    WHERE id = ${imageId}
  `),
  )
}

export async function getImageModerationState(imageId: string): Promise<{
  deleted_at: Date | null
  openai_omni_moderation_results: unknown | null
  is_flagged_by_openai_omni_moderation: boolean | null
  openai_omni_moderation_created_at: Date | null
} | null> {
  const { rows } = await read<{
    deleted_at: Date | null
    quarantine_pending_at: Date | null
    quarantined_at: Date | null
    openai_omni_moderation_results: unknown | null
    is_flagged_by_openai_omni_moderation: boolean | null
    openai_omni_moderation_created_at: Date | null
  }>(
    allowUnannotatedQuery(sql`
    SELECT deleted_at, quarantine_pending_at, quarantined_at,
      openai_omni_moderation_results,
      is_flagged_by_openai_omni_moderation,
      openai_omni_moderation_created_at
    FROM images
    WHERE id = ${imageId}
  `),
  )
  return rows[0] ?? null
}

export async function markImageComplete(imageId: string) {
  await write(
    allowUnannotatedQuery(`
    UPDATE images
    SET upload_started_at = NOW(),
        upload_completed_at = NOW(),
        sha_256 = decode(replace($1::text, '-', '') || replace($1::text, '-', ''), 'hex'),
        s3_key = replace($1::text, '-', '') || replace($1::text, '-', '')
    WHERE id = $1
  `),
    [imageId],
  )
}

export async function backdateImageUploadStagedAt(
  imageId: string,
  uploadStagedAt: Date,
  uploadStatus: 'pending' | 'processing' | 'complete' = 'pending',
) {
  const timestamps =
    uploadStatus === 'complete'
      ? sql`upload_started_at = NOW(),
          upload_completed_at = NOW(),
          upload_failed_at = NULL,
          sha_256 = decode(replace(${imageId}::text, '-', '') || replace(${imageId}::text, '-', ''), 'hex'),
          s3_key = replace(${imageId}::text, '-', '') || replace(${imageId}::text, '-', '')`
      : uploadStatus === 'processing'
        ? sql`upload_started_at = NOW(), upload_completed_at = NULL, upload_failed_at = NULL`
        : sql`upload_started_at = NULL, upload_completed_at = NULL, upload_failed_at = NULL`
  await write(
    allowUnannotatedQuery(
      sql`
    UPDATE images
    SET upload_staged_at = ${uploadStagedAt},
        `.append(timestamps).append(sql`
    WHERE id = ${imageId}
  `),
    ),
  )
}

export async function setImageHashAndProcessing(imageId: string, sha256: Buffer): Promise<void> {
  await write(
    allowUnannotatedQuery(
      `UPDATE images SET sha_256 = $1, s3_key = $2, upload_started_at = NOW() WHERE id = $3`,
    ),
    [sha256, sha256.toString('hex'), imageId],
  )
}

export async function setImageCompleteWithData(
  imageId: string,
  sha256: Buffer,
  data: Record<string, unknown>,
): Promise<void> {
  await write(
    allowUnannotatedQuery(`UPDATE images
       SET sha_256 = $1, s3_key = $2, upload_started_at = NOW(), upload_completed_at = NOW(),
           data = $3::jsonb
       WHERE id = $4`),
    [sha256, sha256.toString('hex'), JSON.stringify(data), imageId],
  )
}

export async function getImageEmbeddingState(
  imageId: string,
): Promise<{ bedrock_nova_multimodal_v1_embedding_created_at: Date | null } | null> {
  const { rows } = await read<{ bedrock_nova_multimodal_v1_embedding_created_at: Date | null }>(
    allowUnannotatedQuery(
      `SELECT bedrock_nova_multimodal_v1_embedding_created_at FROM images WHERE id = $1`,
    ),
    [imageId],
  )
  return rows[0] ?? null
}
