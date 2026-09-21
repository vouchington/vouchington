import { getImageByAny } from './get.mts'
import { withImageStorageLifecycleLock } from './storage-lifecycle-lock.mts'
import { deleteImageByIdWhileStorageLocked } from './delete.mts'

export async function deleteImageById(
  imageId: string | Buffer,
  omitRollback?: true,
  { includeQuarantinePending = false }: { includeQuarantinePending?: boolean } = {},
) {
  const image = await getImageByAny(imageId, { includeQuarantinePending })
  if (!image) return
  return await withImageStorageLifecycleLock(image.id, async () =>
    deleteImageByIdWhileStorageLocked(image.id, omitRollback, includeQuarantinePending),
  )
}
