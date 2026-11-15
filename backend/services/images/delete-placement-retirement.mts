import type { beginTransaction } from '@data-stores/psql'
import type { ImageDeletionRetirementCursor } from '@queues/background/enqueues/image-deletion-jobs'
import { retireImagePlacementsForDeletedImage } from './placements.mts'
import { retireImageSurfacePlacementsForDeletedImage } from './surface-placements.mts'

/** Each binding statement inspects at most one page, including rows already retired on replay. */
export async function retireDeletedImagePlacementPage(
  imageId: string,
  cursor: ImageDeletionRetirementCursor,
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<ImageDeletionRetirementCursor | null> {
  if (cursor.family === 'complete') return null
  if (cursor.family === 'post') {
    const ids = await retireImagePlacementsForDeletedImage(
      imageId,
      transaction,
      cursor.afterPlacementId,
    )
    const lastPlacementId = ids.at(-1)
    if (lastPlacementId) return { family: 'post', afterPlacementId: lastPlacementId }
  }
  const ids = await retireImageSurfacePlacementsForDeletedImage(
    imageId,
    transaction,
    cursor.family === 'surface' ? cursor.afterPlacementId : undefined,
  )
  const lastPlacementId = ids.at(-1)
  return lastPlacementId ? { family: 'surface', afterPlacementId: lastPlacementId } : null
}
