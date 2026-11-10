import { beginTransaction } from '@data-stores/psql'
import type { ImageSurfaceReference } from '../../services/media-delivery-safety/index.mts'
import { writeTestImageSurfaceMutation } from '../image-surface-mutation.mts'

export async function prepublishTestImageSurfaceDenial(
  input: ImageSurfaceReference,
): Promise<void> {
  if (!('userId' in input)) throw new Error('Fixture requires a user profile surface')
  await using transaction = await beginTransaction()
  await writeTestImageSurfaceMutation(input, null, null, transaction)
  await transaction.commit()
}
