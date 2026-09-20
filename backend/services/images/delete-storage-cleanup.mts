import onError from '@modules/on-error'
import { markImageUploadSourceDeleted } from './complete-upload-state.mts'
import { deleteKnownImageStorageFromS3 } from './s3-upload-lifecycle.mts'

type LockedStorageImage = {
  id: string
  s3_key: string
  sha_256: Buffer | null
  upload_staged_at: Date | null
}

export async function cleanupDeletedImageStorage(image: LockedStorageImage): Promise<void> {
  try {
    await deleteKnownImageStorageFromS3(image)
    await markImageUploadSourceDeleted(image.id)
  } catch (error) {
    onError(error as Error)
  }
}
