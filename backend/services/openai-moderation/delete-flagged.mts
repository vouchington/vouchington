import { getImageByAny } from '@services/images/get'
import { deleteImageById } from '@services/images/delete'
import * as imageS3 from '@services/images/s3'
import { read, write } from '@data-stores/psql'
import onError from '@modules/on-error'
import sql from 'sql-template-strings'
import { recordImageAutoRemoval } from './image-auto-removal-audit.mts'
import { prepublishImageDeliveryDenials } from '@services/media-delivery-safety'

export const IMAGE_QUARANTINE_RECONCILIATION_BATCH_SIZE = 25

export async function deleteFlaggedImage(imageId: string): Promise<boolean> {
  const image = await getImageByAny(imageId, { includeQuarantinePending: true })
  if (!image) return false
  const results = image.openai_omni_moderation_results as
    | Array<{ categories?: Record<string, boolean> }>
    | null
    | undefined
  const isSexualMinors = results?.some(r => r.categories?.['sexual/minors'] === true) ?? false

  if (isSexualMinors) {
    await prepublishImageDeliveryDenials(image.id)
    const pending = await markImageQuarantinePending(image.id)
    if (!pending) return false

    if (!image.quarantined_at) {
      try {
        await imageS3.copyImageToQuarantine(image)
      } catch (error) {
        onError(error as Error)
        return false
      }

      await write(sql`/* deleteFlaggedImage */
        UPDATE images
        SET quarantined_at = NOW(), quarantine_s3_key = ${image.s3_key}
        WHERE id = ${image.id}
          AND quarantine_pending_at IS NOT NULL
      `)
    }

    // The durable pending marker blocks all application reads before S3 is touched. Never remove
    // source objects or metadata unless the permanent quarantine copy is confirmed above.
    await deleteImageById(image.id, true, { includeQuarantinePending: true })

    try {
      await deleteKnownImageRenders(image)
    } catch (error) {
      onError(error as Error)
    }

    try {
      await recordImageAutoRemoval(imageId, { reason: 'openai_image_quarantine_csam' })
    } catch (error) {
      /* c8 ignore next -- defensive audit failure isolation after deletion */
      onError(error as Error)
    }
    return true
  }

  await prepublishImageDeliveryDenials(imageId)
  await deleteImageById(imageId)
  try {
    await recordImageAutoRemoval(imageId)
  } catch (error) {
    /* c8 ignore next -- defensive audit failure isolation after deletion */
    onError(error as Error)
  }
  return true
}

export async function reconcilePendingImageQuarantines(): Promise<{ reconciled: number }> {
  const { rows } = await read<{ id: string }>(sql`/* reconcilePendingImageQuarantines */
    SELECT id
    FROM images
    WHERE quarantine_pending_at IS NOT NULL
      AND deleted_at IS NULL
    ORDER BY quarantine_pending_at, id
    LIMIT ${IMAGE_QUARANTINE_RECONCILIATION_BATCH_SIZE}
  `)

  let reconciled = 0
  for (const { id } of rows) {
    // oxlint-disable-next-line no-await-in-loop -- bounded retries avoid concurrent duplicate quarantine transfers for the same source image
    if (await deleteFlaggedImage(id)) reconciled++
  }
  return { reconciled }
}

async function markImageQuarantinePending(imageId: string): Promise<boolean> {
  const { rows } = await write(sql`/* markImageQuarantinePending */
    UPDATE images
    SET quarantine_pending_at = COALESCE(quarantine_pending_at, NOW())
    WHERE id = ${imageId}
      AND deleted_at IS NULL
    RETURNING id
  `)
  return rows.length > 0
}

async function deleteKnownImageRenders(image: { id: string; s3_key: string }): Promise<void> {
  const keys = new Set([image.s3_key, image.id])
  const results = await Promise.allSettled([...keys].map(key => imageS3.deleteImageRenders(key)))
  const errors = results.flatMap(result => (result.status === 'rejected' ? [result.reason] : []))
  if (errors.length > 0) {
    throw new AggregateError(errors, `Failed to delete renders for image ${image.id}`)
  }
}
