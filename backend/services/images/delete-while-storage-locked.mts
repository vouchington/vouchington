import { beginTransaction } from '@data-stores/psql'
import onError from '@modules/on-error'
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
    await lockImageAssetMutation(transaction, { imageIds: [imageId] })
    const { rows } = await transaction<{ deleted_at: Date | null }>(
      `/* deleteImageById:fence */ SELECT deleted_at FROM images WHERE id = $1 FOR UPDATE`,
      [imageId],
    )
    if (rows[0] && !rows[0].deleted_at) {
      await prepublishImageDeliveryDenials(imageId, { query: transaction })
      await transaction(
        '/* deleteImageById:fence */ UPDATE images SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
        [imageId],
      )
      await retireImagePlacementsForDeletedImage(imageId, transaction)
      await retireImageSurfacePlacementsForDeletedImage(imageId, transaction)
    }
    await transaction.commit()
  }
  await fence().catch(async (err: unknown) => {
    await repairFailedImageDeliveryMutation({ imageIds: [imageId] }).catch(onError)
    throw err
  })
  await processImageDeletionPageWhileLocked(imageId, options)
}
