import onError from '@modules/on-error'
import { deleteImageRenders } from './s3.mts'
import { markImageUploadSourceDeleted } from './complete-upload-state.mts'
import { deleteKnownImageStorageFromS3 } from './s3-upload-lifecycle.mts'

type LockedStorageImage = {
  id: string
  s3_key: string
  sha_256: Buffer | null
  upload_staged_at: Date | null
  quarantined_at?: Date | null
}

export async function cleanupDeletedImageStorage(image: LockedStorageImage): Promise<void> {
  try {
    await deleteKnownImageStorageFromS3(image)
    await markImageUploadSourceDeleted(image.id)
  } catch (err) {
    onError(err as Error)
  }
  if (!image.quarantined_at) return
  try {
    const results = await Promise.allSettled(
      [...new Set([image.s3_key, image.id])].map(key => deleteImageRenders(key)),
    )
    const errors = results.flatMap(result => (result.status === 'rejected' ? [result.reason] : []))
    if (errors.length > 0)
      throw new AggregateError(errors, `Failed to delete renders for image ${image.id}`)
  } catch (err) {
    onError(err as Error)
  }
}
