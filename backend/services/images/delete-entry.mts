import { write } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import { withImageStorageLifecycleLock } from './storage-lifecycle-lock.mts'
import { deleteImageByIdWhileStorageLocked } from './delete-while-storage-locked.mts'
import type { ImageDeletionOptions } from './delete-page.mts'

export async function deleteImageById(
  imageId: string | Buffer,
  options: ImageDeletionOptions & { includeQuarantinePending?: boolean } = {},
) {
  const byId = typeof imageId === 'string' && isUUID(imageId)
  const digest = Buffer.isBuffer(imageId)
    ? imageId
    : typeof imageId === 'string' && /^[0-9a-f]{64}$/.test(imageId)
      ? Buffer.from(imageId, 'hex')
      : null
  if (!byId && !digest) return
  const { rows } = await write<{ id: string }>(
    `/* deleteImageById:resolve */
    SELECT id FROM images WHERE ${byId ? 'id' : 'sha_256'} = $1
      AND ($2::boolean OR quarantine_pending_at IS NULL) LIMIT 1`,
    [byId ? imageId : digest, options.includeQuarantinePending ?? false],
  )
  const image = rows[0]
  if (!image) return
  return withImageStorageLifecycleLock(image.id, () =>
    deleteImageByIdWhileStorageLocked(image.id, options),
  )
}
