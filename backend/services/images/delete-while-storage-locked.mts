import { beginTransaction } from '@data-stores/psql'
import onError from '@modules/on-error'
import { runSequentially } from '@modules/utils/run-sequentially'
import {
  lockImageAssetMutation,
  prepublishImageDeliveryDenials,
  repairFailedImageDeliveryMutation,
} from '@services/media-delivery-safety'
import { retireImagePlacementsForDeletedImage } from './placements.mts'
import { retireImageSurfacePlacementsForDeletedImage } from './surface-placements.mts'
import { processImageDeletionPageWhileLocked, type ImageDeletionOptions } from './delete-page.mts'

export async function deleteImageByIdWhileStorageLocked(
  imageId: string,
  options: ImageDeletionOptions,
) {
  async function fence() {
    await using transaction = await (options.beginTransaction ?? beginTransaction)()
    await lockImageAssetMutation(transaction, { imageIds: [imageId], imageOnly: true })
    const { rows } = await transaction<{
      deleted_at: Date | null
      quarantine_pending_at: Date | null
      quarantined_at: Date | null
    }>(
      `/* deleteImageById:fence */ SELECT deleted_at, quarantine_pending_at, quarantined_at
      FROM images WHERE id = $1 FOR UPDATE`,
      [imageId],
    )
    if (rows[0]?.quarantine_pending_at && !rows[0].quarantined_at) {
      // Keep the row eligible for quarantine-copy reconciliation if admission won the lookup race.
      await transaction.commit()
      return false
    }
    if (rows[0] && !rows[0].deleted_at) {
      await runSequentially([
        () => prepublishImageDeliveryDenials(imageId, { query: transaction, imageOnly: true }),
        () =>
          transaction(
            '/* deleteImageById:fence */ UPDATE images SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
            [imageId],
          ),
        () => retireImagePlacementsForDeletedImage(imageId, transaction),
        () => retireImageSurfacePlacementsForDeletedImage(imageId, transaction),
      ])
    }
    await transaction.commit()
    return true
  }
  const fenced = await fence().catch(async (err: unknown) => {
    await repairFailedImageDeliveryMutation({ imageIds: [imageId] }).catch(onError)
    throw err
  })
  if (fenced) await processImageDeletionPageWhileLocked(imageId, options)
}
