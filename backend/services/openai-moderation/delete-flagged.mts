import { getImageByAny } from '@services/images/get'
import { deleteImageById } from '@services/images/delete'
import * as imageS3 from '@services/images/s3'
import { deleteKnownImageStorageFromS3 } from '@services/images/s3-upload-lifecycle'
import { write } from '@data-stores/psql'
import onError from '@modules/on-error'
import sql from 'sql-template-strings'
import { recordImageAutoRemoval } from './image-auto-removal-audit.mts'

export async function deleteFlaggedImage(imageId: string): Promise<void> {
  const image = await getImageByAny(imageId)
  if (!image) return
  const results = image.openai_omni_moderation_results as
    | Array<{ categories?: Record<string, boolean> }>
    | null
    | undefined
  const isSexualMinors = results?.some(r => r.categories?.['sexual/minors'] === true) ?? false

  if (isSexualMinors) {
    let quarantineCopied = false
    try {
      await imageS3.copyImageToQuarantine(image)
      quarantineCopied = true
    } catch (error) {
      onError(error as Error)
    }

    if (quarantineCopied) {
      await write(sql`/* deleteFlaggedImage */
        UPDATE images
        SET quarantined_at = NOW(), quarantine_s3_key = ${image.s3_key}
        WHERE id = ${imageId}
      `)
    }

    // Mandatory removal of every database-known source/final object before soft-delete so a
    // worker retry can re-attempt if S3 is degraded. deleteImageById repeats this idempotently.
    await deleteKnownImageStorageFromS3(image)
    await deleteImageById(imageId, true)

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
  } else {
    await deleteImageById(imageId)
    try {
      await recordImageAutoRemoval(imageId)
    } catch (error) {
      /* c8 ignore next -- defensive audit failure isolation after deletion */
      onError(error as Error)
    }
  }
}

async function deleteKnownImageRenders(image: { id: string; s3_key: string }): Promise<void> {
  const keys = new Set([image.s3_key, image.id])
  const results = await Promise.allSettled([...keys].map(key => imageS3.deleteImageRenders(key)))
  const errors = results.flatMap(result => (result.status === 'rejected' ? [result.reason] : []))
  if (errors.length > 0) {
    throw new AggregateError(errors, `Failed to delete renders for image ${image.id}`)
  }
}
