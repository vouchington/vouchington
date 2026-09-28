import { getImageByAny } from './get.mts'
import { withImageStorageLifecycleLock } from './storage-lifecycle-lock.mts'
import { deleteImageByIdWhileStorageLocked } from './delete-while-storage-locked.mts'

export async function deleteImageById(
  imageId: string | Buffer,
  omitRollback?: true,
  { includeQuarantinePending = false }: { includeQuarantinePending?: boolean } = {},
) {
  const image = await getImageByAny(imageId, { includeQuarantinePending })
  if (!image) return
  return withImageStorageLifecycleLock(image.id, async () =>
    deleteImageByIdWhileStorageLocked(image.id, omitRollback, includeQuarantinePending),
  )
}
