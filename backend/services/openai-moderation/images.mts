import { getImageByAny } from '@services/images/get'
import { presignImageReadUrl } from '@services/images/s3'
import { enqueueCreateImageEmbeddingsBatch } from '@queues/bedrock-embeddings-batch/enqueues'
import { read, beginTransaction } from '@data-stores/psql'
import onError from '@modules/on-error'
import sql from 'sql-template-strings'
import { deleteFlaggedImage } from './delete-flagged.mts'
import { createOpenAIModeration } from './request.mts'
import { publishTerminalImageState } from './terminal-image-state.mts'
import {
  prepublishImageDeliveryDenials,
  lockImageAssetMutation,
} from '@services/media-delivery-safety'

type UpsertImageModerationDependencies = {
  createOpenAIModeration: typeof createOpenAIModeration
  presignImageReadUrl: typeof presignImageReadUrl
}

const defaultDependencies: UpsertImageModerationDependencies = {
  createOpenAIModeration,
  presignImageReadUrl,
}

export async function upsertImageOpenAIModeration(
  imageId: string,
  dependencyOverrides: Partial<UpsertImageModerationDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides }
  const image = await getImageByAny(imageId)
  if (!image) {
    return {
      skipped: true,
      reason: 'image_not_found',
    }
  }

  if (image.deleted_at) {
    return {
      skipped: true,
      reason: 'image_already_deleted',
    }
  }

  const isUpToDate = await isImageOpenAIModerationUpToDate(imageId)
  if (isUpToDate) {
    if (image.openai_omni_moderation_flagged === true) {
      await publishTerminalImageState(imageId, true)
      await deleteFlaggedImage(imageId)
      return {
        skipped: true,
        reason: 'already_moderated_flagged',
      }
    }

    return {
      skipped: true,
      reason: 'already_moderated',
    }
  }

  const existing = await findExistingImageOpenAIModeration(image.sha_256)
  if (existing) {
    const applied = await applyImageOpenAIModerationResults(
      imageId,
      existing.results,
      existing.flagged,
    )

    if (applied) {
      // Publish terminal state before delete so SSE subscribers always receive it even if
      // the cleanup step throws (ready=true for clean, blocked=true for flagged).
      await publishTerminalImageState(imageId, existing.flagged)

      /* c8 ignore next 2 -- sha_256 is unique; cross-row reuse is retained defensively */
      if (existing.flagged) {
        await deleteFlaggedImage(imageId)
      } else {
        void enqueueImageEmbeddingsBatch()
      }

      return {
        results: existing.results,
        flagged: existing.flagged,
        reused: true,
      }
    }
  }

  const imageUrl = await dependencies.presignImageReadUrl(image.s3_key)

  const results = await dependencies.createOpenAIModeration([], [imageUrl])
  const flagged = results.some(result => result.flagged)

  const applied = await applyImageOpenAIModerationResults(imageId, results, flagged)
  if (!applied) {
    return {
      skipped: true,
      reason: 'image_changed',
    }
  }

  // Publish terminal state before delete so SSE subscribers always receive it even if
  // the cleanup step throws (ready=true for clean, blocked=true for flagged).
  await publishTerminalImageState(imageId, flagged)

  if (flagged) {
    await deleteFlaggedImage(imageId)
  } else {
    void enqueueImageEmbeddingsBatch()
  }

  return {
    results,
    flagged,
  }
}

async function enqueueImageEmbeddingsBatch(): Promise<void> {
  try {
    await enqueueCreateImageEmbeddingsBatch()
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
  }
}

async function applyImageOpenAIModerationResults(
  imageId: string,
  results: unknown,
  flagged: boolean,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  await lockImageAssetMutation(transaction, { imageIds: [imageId] })
  if (flagged) await prepublishImageDeliveryDenials(imageId, { query: transaction })
  const { rows } = await transaction(sql`/* applyImageOpenAIModerationResults */
    UPDATE images
    SET openai_omni_moderation_results = ${JSON.stringify(results)}::jsonb,
        openai_omni_moderation_flagged = ${flagged},
        openai_omni_moderation_created_at = NOW()
    WHERE id = ${imageId}
      AND deleted_at IS NULL
    RETURNING id
  `)

  await transaction.commit()
  return rows.length > 0
}

async function isImageOpenAIModerationUpToDate(imageId: string): Promise<boolean> {
  const { rows } = await read(sql`/* isImageOpenAIModerationUpToDate */
    SELECT 1
    FROM images
    WHERE id = ${imageId}
      AND openai_omni_moderation_results IS NOT NULL
      AND openai_omni_moderation_flagged IS NOT NULL
      AND openai_omni_moderation_created_at IS NOT NULL
  `)

  return rows.length > 0
}

async function findExistingImageOpenAIModeration(
  sha256: Buffer,
): Promise<{ results: unknown; flagged: boolean } | null> {
  const { rows } = await read(sql`/* findExistingImageOpenAIModeration */
    SELECT openai_omni_moderation_results, openai_omni_moderation_flagged
    FROM images
    WHERE sha_256 = ${sha256}
      AND openai_omni_moderation_results IS NOT NULL
      AND openai_omni_moderation_flagged IS NOT NULL
    LIMIT 1
  `)

  if (rows.length === 0) return null

  return {
    results: rows[0].openai_omni_moderation_results,
    flagged: rows[0].openai_omni_moderation_flagged,
  }
}
