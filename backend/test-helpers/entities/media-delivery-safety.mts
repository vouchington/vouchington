import { beginTransaction } from '@data-stores/psql'
import {
  prepublishImageSurfaceDenials,
  type ImageSurfaceReference,
} from '../../services/media-delivery-safety/index.mts'

export async function prepublishTestImageSurfaceDenial(
  input: ImageSurfaceReference,
): Promise<void> {
  await using transaction = await beginTransaction()
  await prepublishImageSurfaceDenials([input], transaction)
  await transaction.commit()
}
