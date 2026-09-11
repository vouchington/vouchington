import { getImageByAny } from '@services/images/get'
import { getPublicImageUrl } from '@services/images/url'
import { enqueueCreateImageEmbeddingsBatch } from '@queues/bedrock-embeddings-batch/enqueues'
import { read, write } from '@data-stores/psql'
import onError from '@modules/on-error'
import sql from 'sql-template-strings'
import { imageStatePubSub } from '@data-stores/valkey-pubsub'
import { deleteFlaggedImage } from './delete-flagged.mts'
import { createOpenAIModeration } from './request.mts'

const TERMINAL_STATE_PUBLISH_ATTEMPTS = 3
const TERMINAL_STATE_PUBLISH_RETRY_MS = 100

type UpsertImageModerationDependencies = {
  createOpenAIModeration: typeof createOpenAIModeration
}

const defaultDependencies: UpsertImageModerationDependencies = { createOpenAIModeration }

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

  const imageUrl = getPublicImageUrl(image.s3_key)
  if (!imageUrl) return { skipped: true, reason: 'non_public_image_origin' }

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

async function publishTerminalImageState(imageId: string, flagged: boolean): Promise<void> {
  let lastError: unknown
  for (let attempt = 1; attempt <= TERMINAL_STATE_PUBLISH_ATTEMPTS; attempt++) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- the next terminal-state publish runs only after this attempt fails
      await imageStatePubSub.publish(imageId, {
        id: imageId,
        upload_status: 'complete',
        upload_error: null,
        ready: !flagged,
        blocked: flagged,
      })
      return
    } catch (err) {
      lastError = err
      if (attempt < TERMINAL_STATE_PUBLISH_ATTEMPTS) {
        // oxlint-disable-next-line no-await-in-loop -- retry backoff must finish before the next publish attempt starts
        await sleep(TERMINAL_STATE_PUBLISH_RETRY_MS)
      }
    }
  }
  onError(lastError instanceof Error ? lastError : new Error(String(lastError)))
}

async function applyImageOpenAIModerationResults(
  imageId: string,
  results: unknown,
  flagged: boolean,
): Promise<boolean> {
  const { rows } = await write(sql`/* applyImageOpenAIModerationResults */
    UPDATE images
    SET openai_omni_moderation_results = ${JSON.stringify(results)}::jsonb,
        openai_omni_moderation_flagged = ${flagged},
        openai_omni_moderation_created_at = NOW()
    WHERE id = ${imageId}
      AND deleted_at IS NULL
    RETURNING id
  `)

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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
