import sql from 'sql-template-strings'
import { beginTransaction } from '@data-stores/psql'
import {
  writeImageSurfaceMutation,
  type ImageSurfaceReference,
} from '../../services/media-delivery-safety/index.mts'

export async function prepublishTestImageSurfaceDenial(
  input: ImageSurfaceReference,
): Promise<void> {
  await using transaction = await beginTransaction()
  await writeImageSurfaceMutation(
    transaction,
    [{ ...input, nextImageId: null }],
    null,
    async (_before, scopeQuery) => {
      if ('userId' in input)
        await scopeQuery(
          sql`/* retireTestProfileSurface */ UPDATE users SET profile_image_id = NULL WHERE id = ${input.userId}`,
        )
      else throw new Error('Fixture requires a user profile surface')
    },
  )
  await transaction.commit()
}
